import { logger } from "@/modules/core/logger";
import { appError, err, ok, type Result } from "@/modules/core/result";
import type { LatLng } from "@/modules/city/types";

/**
 * Idealista official Search API (https://developers.idealista.com): OAuth2
 * client credentials, then `POST /3.5/{country}/search`. Shared by the
 * market comparables adapter and the Radar listings source so one token and
 * one cache serve both. Free plans allow ~100 requests/month: every search is
 * cached in memory and callers keep their request count minimal.
 */
export interface IdealistaClientConfig {
  apiKey: string;
  apiSecret: string;
  /** ISO country code of the search endpoint (es | it | pt). */
  country?: string;
  baseUrl?: string;
  timeoutMs?: number;
  cacheTtlMs?: number;
  now?: () => number;
}

export type IdealistaOperation = "sale" | "rent";
export type IdealistaPropertyType = "homes" | "offices" | "premises" | "garages";

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
  municipality?: string;
  province?: string;
  propertyType?: string;
  operation?: string;
  rooms?: number;
  bathrooms?: number;
  thumbnail?: string;
  numPhotos?: number;
}

export interface IdealistaSearchResponse {
  elementList?: IdealistaListing[];
  total?: number;
  totalPages?: number;
  actualPage?: number;
  itemsPerPage?: number;
}

export interface IdealistaSearch {
  operation: IdealistaOperation;
  propertyType: IdealistaPropertyType;
  center: LatLng;
  distanceM: number;
  maxItems?: number;
  page?: number;
  minSizeM2?: number;
  maxSizeM2?: number;
  order?: "distance" | "price" | "publicationDate" | "size";
  sort?: "asc" | "desc";
}

const DEFAULTS = {
  country: "es",
  baseUrl: "https://api.idealista.com",
  timeoutMs: 12_000,
  cacheTtlMs: 6 * 60 * 60 * 1000,
};

interface CacheEntry {
  at: number;
  value: IdealistaSearchResponse;
}

export class IdealistaClient {
  readonly cfg: Required<Omit<IdealistaClientConfig, "now">> & { now: () => number };
  private token: { value: string; expiresAt: number } | undefined;
  private tokenRequest: Promise<Result<string>> | undefined;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    config: IdealistaClientConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.cfg = { ...DEFAULTS, now: () => Date.now(), ...config };
  }

  get configured(): boolean {
    return Boolean(this.cfg.apiKey && this.cfg.apiSecret);
  }

  get searchUrl(): string {
    return `${this.cfg.baseUrl}/3.5/${this.cfg.country}/search`;
  }

  async search(s: IdealistaSearch): Promise<Result<IdealistaSearchResponse>> {
    if (!this.configured)
      return err(
        appError("SOURCE_NOT_CONFIGURED", "Idealista: faltan IDEALISTA_API_KEY / IDEALISTA_API_SECRET."),
      );
    const params = new URLSearchParams({
      operation: s.operation,
      propertyType: s.propertyType,
      center: `${s.center.lat.toFixed(5)},${s.center.lng.toFixed(5)}`,
      distance: String(Math.round(s.distanceM)),
      locale: "es",
      maxItems: String(s.maxItems ?? 50),
      numPage: String(s.page ?? 1),
      order: s.order ?? "distance",
      sort: s.sort ?? "asc",
    });
    if (s.minSizeM2) params.set("minSize", String(Math.round(s.minSizeM2)));
    if (s.maxSizeM2) params.set("maxSize", String(Math.round(s.maxSizeM2)));
    const key = params.toString();
    const cached = this.cache.get(key);
    if (cached && this.cfg.now() - cached.at < this.cfg.cacheTtlMs) return ok(cached.value);
    const token = await this.accessToken();
    if (!token.ok) return token;
    try {
      const res = await this.fetchImpl(this.searchUrl, {
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
        logger.warn("idealista.search_failed", { status: res.status, operation: s.operation, body });
        return err(
          appError("SOURCE_ERROR", `Idealista respondió ${res.status} a la búsqueda de ${s.operation}.`),
        );
      }
      const json = (await res.json()) as IdealistaSearchResponse;
      this.cache.set(key, { at: this.cfg.now(), value: json });
      return ok(json);
    } catch (e) {
      logger.warn("idealista.search_error", {
        operation: s.operation,
        error: e instanceof Error ? e.message : String(e),
      });
      return err(appError("SOURCE_UNAVAILABLE", `Idealista no responde (${s.operation}).`));
    }
  }

  /** One token request at a time: parallel searches share it. */
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

/** Idealista `floor` codes → number (bj/en = 0, ss/st = -1). */
export function idealistaFloor(floor: IdealistaListing["floor"]): number | undefined {
  if (floor === undefined || floor === null) return undefined;
  if (typeof floor === "number") return floor;
  const f = floor.trim().toLowerCase();
  if (f === "bj" || f === "en") return 0;
  if (f === "ss" || f === "st") return -1;
  const n = Number(f);
  return Number.isFinite(n) ? n : undefined;
}

/** Idealista `status` → renovation state. "good" is habitable, not necessarily renovated. */
export function idealistaState(l: IdealistaListing): "new" | "to_renovate" | "good" | "unknown" {
  if (l.newDevelopment || l.status === "newdevelopment") return "new";
  if (l.status === "renew") return "to_renovate";
  if (l.status === "good") return "good";
  return "unknown";
}

let shared: { key: string; client: IdealistaClient } | undefined;

/** Process-wide client built from the environment, so market and Radar share token and cache. */
export function sharedIdealistaClient(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
): IdealistaClient {
  const key = `${env.IDEALISTA_API_KEY ?? ""}:${env.IDEALISTA_API_SECRET ?? ""}:${env.IDEALISTA_COUNTRY ?? "es"}`;
  if (!shared || shared.key !== key || fetchImpl) {
    const client = new IdealistaClient(
      {
        apiKey: env.IDEALISTA_API_KEY ?? "",
        apiSecret: env.IDEALISTA_API_SECRET ?? "",
        country: env.IDEALISTA_COUNTRY ?? "es",
      },
      fetchImpl,
    );
    if (fetchImpl) return client;
    shared = { key, client };
  }
  return shared.client;
}
