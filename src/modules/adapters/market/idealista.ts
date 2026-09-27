import { defaultCity, haversineM } from "@/modules/city/registry";
import type { LatLng } from "@/modules/city/types";
import { appError, err, ok, type Result } from "@/modules/core/result";
import { logger } from "@/modules/core/logger";
import type { Comparable } from "@/modules/engines/valuation/types";
import type { NewEvidence } from "@/modules/evidence/store";
import type { AdapterResponse, DataSourceAdapter } from "../types";
import { deriveStats } from "./stats";
import type { MarketQuery, MarketSnapshot, RentComparable } from "./types";

/**
 * Idealista official Search API (https://developers.idealista.com), the
 * authorised way to read active listings: OAuth2 client credentials, then
 * `POST /3.5/{country}/search` around the parcel. Asking prices only; the
 * valuation engine discounts them and weights them below transactions.
 *
 * Free plans allow ~100 requests/month, so each analysis makes at most two
 * calls (sale + rent) and results are cached in memory for a while.
 */
export interface IdealistaConfig {
  apiKey: string;
  apiSecret: string;
  /** ISO country code of the search endpoint (es | it | pt). */
  country?: string;
  baseUrl?: string;
  /** Search radius around the property. */
  radiusM?: number;
  maxItems?: number;
  timeoutMs?: number;
  cacheTtlMs?: number;
  now?: () => number;
}

export interface IdealistaListing {
  propertyCode?: string | number;
  price?: number;
  size?: number;
  priceByArea?: number;
  latitude?: number;
  longitude?: number;
  distance?: number | string;
  status?: string;
  newDevelopment?: boolean;
  floor?: string | number;
  hasLift?: boolean;
  exterior?: boolean;
  url?: string;
  address?: string;
  neighborhood?: string;
  district?: string;
  propertyType?: string;
  operation?: string;
  rooms?: number;
}

export interface IdealistaSearchResponse {
  elementList?: IdealistaListing[];
  total?: number;
  totalPages?: number;
  actualPage?: number;
}

type Operation = "sale" | "rent";

const DEFAULTS = {
  country: "es",
  baseUrl: "https://api.idealista.com",
  radiusM: 1_000,
  maxItems: 50,
  timeoutMs: 12_000,
  cacheTtlMs: 6 * 60 * 60 * 1000,
};

interface CacheEntry {
  at: number;
  value: IdealistaSearchResponse;
}

export function idealistaPropertyType(assetUse: MarketQuery["assetUse"]): "homes" | "offices" | "premises" {
  if (assetUse === "office") return "offices";
  if (assetUse === "commercial") return "premises";
  return "homes";
}

/** Idealista `status` → valuation condition. "good" is habitable, not necessarily renovated. */
export function idealistaCondition(l: IdealistaListing): Comparable["condition"] {
  if (l.newDevelopment || l.status === "newdevelopment") return "new";
  if (l.status === "renew") return "unrenovated";
  if (l.status === "good") return "unknown";
  return "unknown";
}

export function idealistaFloor(floor: IdealistaListing["floor"]): number | undefined {
  if (floor === undefined || floor === null) return undefined;
  if (typeof floor === "number") return floor;
  const f = floor.trim().toLowerCase();
  if (f === "bj" || f === "en") return 0;
  if (f === "ss" || f === "st") return -1;
  const n = Number(f);
  return Number.isFinite(n) ? n : undefined;
}

export class IdealistaMarketAdapter implements DataSourceAdapter<MarketQuery, MarketSnapshot> {
  sourceId = "idealista-api";
  sourceType = "market_listing" as const;
  sourceName = "Idealista (API oficial)";
  sourceAuthority = "Idealista S.A.U. — anuncios activos vía API autorizada";
  mode = "partner" as const;

  private readonly cfg: Required<Omit<IdealistaConfig, "now">> & { now: () => number };
  private token: { value: string; expiresAt: number } | undefined;
  private tokenRequest: Promise<Result<string>> | undefined;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    config: IdealistaConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.cfg = { ...DEFAULTS, now: () => Date.now(), ...config };
  }

  async isAvailable() {
    return Boolean(this.cfg.apiKey && this.cfg.apiSecret);
  }

  async query(q: MarketQuery): Promise<Result<AdapterResponse<MarketSnapshot>>> {
    if (!(await this.isAvailable()))
      return err(
        appError("SOURCE_NOT_CONFIGURED", "Idealista: faltan IDEALISTA_API_KEY / IDEALISTA_API_SECRET."),
      );
    const city = defaultCity();
    const zone = city.microzones.find((m) => m.id === q.microzoneId);
    if (!zone) return err(appError("MICROZONE_NOT_FOUND", `Microzona ${q.microzoneId} desconocida.`));
    const centre = q.point ?? zone.centroid;
    const radiusM = q.point ? this.cfg.radiusM : Math.max(this.cfg.radiusM, zone.radiusM);
    const type = idealistaPropertyType(q.assetUse);

    const [sale, rent] = await Promise.all([
      this.search("sale", type, centre, radiusM, q.areaM2),
      this.search("rent", type, centre, radiusM, q.areaM2),
    ]);
    if (!sale.ok) return sale;
    if (!rent.ok) return rent;

    const retrievedAt = new Date(this.cfg.now()).toISOString();
    const assetUse: Comparable["assetUse"] =
      q.assetUse === "residential" || q.assetUse === "commercial" || q.assetUse === "office"
        ? q.assetUse
        : "other";
    const comparablesSale: Comparable[] = [];
    const evidence: NewEvidence[] = [];
    for (const l of sale.value.elementList ?? []) {
      const c = this.toComparable(l, centre, q.analysisDate, assetUse);
      if (!c) continue;
      comparablesSale.push(c);
      evidence.push(
        this.evidenceFor(
          l,
          c.id,
          retrievedAt,
          `Anuncio de venta: ${c.price.toLocaleString("es-ES")} € · ${c.areaM2} m² · ${c.distanceM} m`,
          {
            comparableId: c.id,
            price: c.price,
            areaM2: c.areaM2,
            condition: c.condition,
            distanceM: c.distanceM,
          },
        ),
      );
    }
    const comparablesRent: RentComparable[] = [];
    for (const l of rent.value.elementList ?? []) {
      const base = this.toComparable(l, centre, q.analysisDate, assetUse);
      if (!base) continue;
      const r: RentComparable = {
        id: base.id.replace(/^cmp_/, "rcmp_"),
        monthlyRent: base.price,
        areaM2: base.areaM2,
        date: base.date,
        distanceM: base.distanceM,
        type: "asking",
        demo: false,
        sourceId: this.sourceId,
        label: base.label,
      };
      comparablesRent.push(r);
      evidence.push(
        this.evidenceFor(
          l,
          r.id,
          retrievedAt,
          `Anuncio de alquiler: ${r.monthlyRent.toLocaleString("es-ES")} €/mes · ${r.areaM2} m² · ${r.distanceM} m`,
          {
            comparableId: r.id,
            monthlyRent: r.monthlyRent,
            areaM2: r.areaM2,
            distanceM: r.distanceM,
          },
        ),
      );
    }
    const stats = deriveStats({
      sale: comparablesSale,
      rent: comparablesRent,
      marketDepth: sale.value.total ?? comparablesSale.length,
      notes: [
        `Idealista: ${comparablesSale.length} anuncios de venta y ${comparablesRent.length} de alquiler en ${radiusM} m (precios de oferta, no transacciones).`,
      ],
    });
    const data: MarketSnapshot = {
      microzoneId: zone.id,
      microzoneName: zone.name,
      comparablesSale,
      comparablesRent,
      stats,
      sources: [
        {
          sourceId: this.sourceId,
          name: this.sourceName,
          sale: comparablesSale.length,
          rent: comparablesRent.length,
          demo: false,
        },
      ],
      demo: false,
    };
    evidence.unshift({
      sourceType: this.sourceType,
      sourceId: this.sourceId,
      sourceName: this.sourceName,
      sourceAuthority: this.sourceAuthority,
      sourceUrl: `${this.cfg.baseUrl}/3.5/${this.cfg.country}/search`,
      retrievedAt,
      geographicScope: {
        level: "point",
        label: `${radiusM} m alrededor de ${centre.lat.toFixed(5)},${centre.lng.toFixed(5)}`,
      },
      excerpt: `Idealista API: ${sale.value.total ?? comparablesSale.length} anuncios de venta y ${rent.value.total ?? comparablesRent.length} de alquiler activos en ${radiusM} m (${type}).`,
      structuredData: { ...stats, radiusM, propertyType: type },
      confidence: 0.6,
      verificationStatus: "VERIFIED",
      demo: false,
    });
    return ok({ data, evidence, retrievedAt, freshness: retrievedAt, mode: "partner" });
  }

  private toComparable(
    l: IdealistaListing,
    centre: LatLng,
    analysisDate: string,
    assetUse: Comparable["assetUse"],
  ): Comparable | undefined {
    const price = Number(l.price);
    const area = Number(l.size);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(area) || area <= 0) return undefined;
    const point =
      typeof l.latitude === "number" && typeof l.longitude === "number"
        ? { lat: l.latitude, lng: l.longitude }
        : undefined;
    const reported = Number(l.distance);
    const distanceM =
      Number.isFinite(reported) && reported >= 0
        ? Math.round(reported)
        : point
          ? Math.round(haversineM(centre, point))
          : 0;
    const condition = idealistaCondition(l);
    const where = [l.address, l.neighborhood ?? l.district].filter(Boolean).join(" · ");
    return {
      id: `cmp_idealista_${l.propertyCode ?? `${price}_${area}_${distanceM}`}`,
      type: "asking",
      sourceId: this.sourceId,
      price: Math.round(price),
      areaM2: Math.round(area),
      // The API does not expose the publication date; an active listing is an observation as of the analysis.
      date: analysisDate,
      distanceM,
      condition,
      assetUse,
      floor: idealistaFloor(l.floor),
      elevator: typeof l.hasLift === "boolean" ? l.hasLift : undefined,
      exterior: typeof l.exterior === "boolean" ? l.exterior : undefined,
      label: `${conditionLabel(condition)} · ${Math.round(area)} m²${where ? ` · ${where}` : ""}`,
      demo: false,
    };
  }

  private evidenceFor(
    l: IdealistaListing,
    comparableId: string,
    retrievedAt: string,
    excerpt: string,
    structuredData: Record<string, unknown>,
  ): NewEvidence {
    return {
      sourceType: this.sourceType,
      sourceId: this.sourceId,
      sourceName: this.sourceName,
      sourceAuthority: this.sourceAuthority,
      sourceUrl: l.url,
      retrievedAt,
      geographicScope: { level: "point", label: l.address ?? l.neighborhood ?? l.district ?? "Idealista" },
      documentId: l.propertyCode !== undefined ? String(l.propertyCode) : undefined,
      excerpt,
      structuredData: { ...structuredData, propertyCode: l.propertyCode, status: l.status, url: l.url },
      confidence: 0.5,
      verificationStatus: "VERIFIED",
      demo: false,
    };
  }

  private async search(
    operation: Operation,
    propertyType: ReturnType<typeof idealistaPropertyType>,
    centre: LatLng,
    radiusM: number,
    areaM2: number,
  ): Promise<Result<IdealistaSearchResponse>> {
    const center = `${centre.lat.toFixed(5)},${centre.lng.toFixed(5)}`;
    const params = new URLSearchParams({
      operation,
      propertyType,
      center,
      distance: String(Math.round(radiusM)),
      locale: "es",
      maxItems: String(this.cfg.maxItems),
      numPage: "1",
      order: "distance",
      sort: "asc",
    });
    if (areaM2 > 0) {
      params.set("minSize", String(Math.max(20, Math.round(areaM2 * 0.5))));
      params.set("maxSize", String(Math.round(areaM2 * 2)));
    }
    const key = params.toString();
    const cached = this.cache.get(key);
    if (cached && this.cfg.now() - cached.at < this.cfg.cacheTtlMs) return ok(cached.value);
    const token = await this.accessToken();
    if (!token.ok) return token;
    const url = `${this.cfg.baseUrl}/3.5/${this.cfg.country}/search`;
    try {
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.value}`,
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
        },
        body: params,
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      });
      if (res.status === 401) this.token = undefined;
      if (!res.ok) {
        const body = (await res.text().catch(() => "")).slice(0, 300);
        logger.warn("idealista.search_failed", { status: res.status, operation, body });
        return err(
          appError("SOURCE_ERROR", `Idealista respondió ${res.status} a la búsqueda de ${operation}.`),
        );
      }
      const json = (await res.json()) as IdealistaSearchResponse;
      this.cache.set(key, { at: this.cfg.now(), value: json });
      return ok(json);
    } catch (e) {
      logger.warn("idealista.search_error", { operation, error: e instanceof Error ? e.message : String(e) });
      return err(appError("SOURCE_UNAVAILABLE", `Idealista no responde (${operation}).`));
    }
  }

  /** One token request at a time: parallel sale/rent searches share it. */
  private accessToken(): Promise<Result<string>> {
    if (this.token && this.token.expiresAt - 60_000 > this.cfg.now())
      return Promise.resolve(ok(this.token.value));
    this.tokenRequest ??= this.requestToken().finally(() => {
      this.tokenRequest = undefined;
    });
    return this.tokenRequest;
  }

  private async requestToken(): Promise<Result<string>> {
    const credentials = Buffer.from(`${this.cfg.apiKey}:${this.cfg.apiSecret}`).toString("base64");
    try {
      const res = await this.fetchImpl(`${this.cfg.baseUrl}/oauth/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
        },
        body: new URLSearchParams({ grant_type: "client_credentials", scope: "read" }),
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      });
      if (!res.ok) {
        logger.warn("idealista.token_failed", { status: res.status });
        return err(appError("SOURCE_AUTH", `Idealista rechazó las credenciales (${res.status}).`));
      }
      const json = (await res.json()) as { access_token?: string; expires_in?: number };
      if (!json.access_token) return err(appError("SOURCE_AUTH", "Idealista no devolvió access_token."));
      const ttl = (Number(json.expires_in) || 3600) * 1000;
      this.token = { value: json.access_token, expiresAt: this.cfg.now() + ttl };
      return ok(json.access_token);
    } catch (e) {
      logger.warn("idealista.token_error", { error: e instanceof Error ? e.message : String(e) });
      return err(appError("SOURCE_UNAVAILABLE", "Idealista no responde (oauth/token)."));
    }
  }
}

function conditionLabel(c: Comparable["condition"]): string {
  return c === "renovated"
    ? "Reformado"
    : c === "unrenovated"
      ? "Para reformar"
      : c === "new"
        ? "Obra nueva"
        : "Estado no indicado";
}
