import { defaultCity, haversineM } from "@/modules/city/registry";
import type { LatLng } from "@/modules/city/types";
import { appError, err, ok, type Result } from "@/modules/core/result";
import type { Comparable } from "@/modules/engines/valuation/types";
import type { NewEvidence } from "@/modules/evidence/store";
import {
  IdealistaClient,
  idealistaFloor,
  idealistaState,
  type IdealistaClientConfig,
  type IdealistaListing,
  type IdealistaPropertyType,
} from "../idealista";
import type { AdapterResponse, DataSourceAdapter } from "../types";
import { deriveStats } from "./stats";
import type { MarketQuery, MarketSnapshot, RentComparable } from "./types";

export type { IdealistaListing, IdealistaSearchResponse } from "../idealista";
export { idealistaFloor } from "../idealista";

/**
 * Market comparables from the Idealista official Search API: active sale and
 * rent listings around the parcel. Asking prices only; the valuation engine
 * discounts them and weights them below transactions. Each analysis makes at
 * most two calls (sale + rent), cached by the shared client.
 */
export interface IdealistaConfig extends IdealistaClientConfig {
  /** Search radius around the property. */
  radiusM?: number;
  maxItems?: number;
}

const RADIUS_M = 1_000;
const MAX_ITEMS = 50;

export function idealistaPropertyType(assetUse: MarketQuery["assetUse"]): IdealistaPropertyType {
  if (assetUse === "office") return "offices";
  if (assetUse === "commercial") return "premises";
  return "homes";
}

/** Idealista `status` → valuation condition. */
export function idealistaCondition(l: IdealistaListing): Comparable["condition"] {
  const s = idealistaState(l);
  return s === "new" ? "new" : s === "to_renovate" ? "unrenovated" : "unknown";
}

export class IdealistaMarketAdapter implements DataSourceAdapter<MarketQuery, MarketSnapshot> {
  sourceId = "idealista-api";
  sourceType = "market_listing" as const;
  sourceName = "Idealista (API oficial)";
  sourceAuthority = "Idealista S.A.U. — anuncios activos vía API autorizada";
  mode = "partner" as const;

  readonly client: IdealistaClient;
  private readonly radiusM: number;
  private readonly maxItems: number;

  constructor(
    config: IdealistaConfig | IdealistaClient,
    fetchImpl: typeof fetch = fetch,
    options: { radiusM?: number; maxItems?: number } = {},
  ) {
    if (config instanceof IdealistaClient) {
      this.client = config;
      this.radiusM = options.radiusM ?? RADIUS_M;
      this.maxItems = options.maxItems ?? MAX_ITEMS;
    } else {
      const { radiusM, maxItems, ...clientConfig } = config;
      this.client = new IdealistaClient(clientConfig, fetchImpl);
      this.radiusM = radiusM ?? options.radiusM ?? RADIUS_M;
      this.maxItems = maxItems ?? options.maxItems ?? MAX_ITEMS;
    }
  }

  async isAvailable() {
    return this.client.configured;
  }

  async query(q: MarketQuery): Promise<Result<AdapterResponse<MarketSnapshot>>> {
    if (!this.client.configured)
      return err(
        appError("SOURCE_NOT_CONFIGURED", "Idealista: faltan IDEALISTA_API_KEY / IDEALISTA_API_SECRET."),
      );
    const city = defaultCity();
    const zone = city.microzones.find((m) => m.id === q.microzoneId);
    if (!zone) return err(appError("MICROZONE_NOT_FOUND", `Microzona ${q.microzoneId} desconocida.`));
    const centre = q.point ?? zone.centroid;
    const radiusM = q.point ? this.radiusM : Math.max(this.radiusM, zone.radiusM);
    const propertyType = idealistaPropertyType(q.assetUse);
    const size = q.areaM2 > 0 ? { minSizeM2: Math.max(20, q.areaM2 * 0.5), maxSizeM2: q.areaM2 * 2 } : {};

    const [sale, rent] = await Promise.all([
      this.client.search({
        operation: "sale",
        propertyType,
        center: centre,
        distanceM: radiusM,
        maxItems: this.maxItems,
        ...size,
      }),
      this.client.search({
        operation: "rent",
        propertyType,
        center: centre,
        distanceM: radiusM,
        maxItems: this.maxItems,
        ...size,
      }),
    ]);
    if (!sale.ok) return sale;
    if (!rent.ok) return rent;

    const retrievedAt = new Date(this.client.cfg.now()).toISOString();
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
      sourceUrl: this.client.searchUrl,
      retrievedAt,
      geographicScope: {
        level: "point",
        label: `${radiusM} m alrededor de ${centre.lat.toFixed(5)},${centre.lng.toFixed(5)}`,
      },
      excerpt: `Idealista API: ${sale.value.total ?? comparablesSale.length} anuncios de venta y ${rent.value.total ?? comparablesRent.length} de alquiler activos en ${radiusM} m (${propertyType}).`,
      structuredData: { ...stats, radiusM, propertyType },
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
