import { z } from "zod";
import { defaultCity } from "@/modules/city/registry";
import type { CityProfile } from "@/modules/city/types";
import { logger } from "@/modules/core/logger";
import { xmlToObject } from "../catastro/xml";
import { assetUseFor, conditionFromText, microzoneIdFor, today, typologyFromText } from "./mapping";
import type { ListingsFetch, ListingsFilter, OpportunityListing, SourceAdapter } from "./types";

/**
 * Partner feeds: the way agencies, CRMs and portals share listings with
 * permission. Two formats:
 *
 * - `kyero`: Kyero XML v3, the de-facto exchange format in Spain (exported by
 *   Inmovilla, Witei, Mobilia, Kyero itself and most portal back-offices).
 * - `json`: a plain JSON array (or `{ listings: [...] }`) with the fields
 *   documented in docs/DATA_SOURCES.md — for custom integrations.
 *
 * Configured with RADAR_FEEDS (JSON array). No scraping: a feed URL is
 * something the owner of the data hands over.
 */
export const feedConfigSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,40}$/, "id: minúsculas, dígitos y guiones"),
  name: z.string().min(1).max(80),
  url: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://") || u.startsWith("http://localhost"), "url: https"),
  format: z.enum(["kyero", "json"]),
  headers: z.record(z.string(), z.string()).optional(),
});
export type FeedConfig = z.infer<typeof feedConfigSchema>;
export const feedsConfigSchema = z.array(feedConfigSchema).max(50);

export function parseFeedsConfig(raw: string | undefined): { feeds: FeedConfig[]; error?: string } {
  if (!raw || !raw.trim()) return { feeds: [] };
  try {
    const parsed = feedsConfigSchema.safeParse(JSON.parse(raw));
    if (!parsed.success)
      return {
        feeds: [],
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      };
    const ids = new Set<string>();
    for (const f of parsed.data) {
      if (ids.has(f.id)) return { feeds: [], error: `feed id duplicado: ${f.id}` };
      ids.add(f.id);
    }
    return { feeds: parsed.data };
  } catch (e) {
    return { feeds: [], error: e instanceof Error ? e.message : "JSON inválido" };
  }
}

const TIMEOUT_MS = 20_000;
const MAX_BYTES = 25 * 1024 * 1024;

export class FeedListingsSource implements SourceAdapter {
  readonly sourceId: string;
  readonly sourceName: string;
  kind = "partner" as const;

  constructor(
    readonly config: FeedConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly city: CityProfile = defaultCity(),
    private readonly now: () => number = Date.now,
  ) {
    this.sourceId = `feed-${config.id}`;
    this.sourceName = config.name;
  }

  async isAvailable() {
    return true;
  }

  async listings(filter: ListingsFilter = {}): Promise<OpportunityListing[]> {
    const r = await this.fetchAll();
    return r.listings.filter(
      (l) =>
        (!filter.microzoneIds || filter.microzoneIds.includes(l.microzoneId ?? "")) &&
        (!filter.maxPrice || l.askingPrice <= filter.maxPrice) &&
        (!filter.assetUse || l.assetUse === filter.assetUse),
    );
  }

  async fetchAll(): Promise<ListingsFetch> {
    let body: string;
    try {
      const res = await this.fetchImpl(this.config.url, {
        headers: {
          Accept: this.config.format === "json" ? "application/json" : "application/xml, text/xml",
          ...this.config.headers,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok)
        return { listings: [], complete: false, errors: [`${this.sourceName}: HTTP ${res.status}`] };
      body = await res.text();
      if (body.length > MAX_BYTES)
        return { listings: [], complete: false, errors: [`${this.sourceName}: feed demasiado grande`] };
    } catch (e) {
      logger.warn("feed.fetch_failed", {
        sourceId: this.sourceId,
        error: e instanceof Error ? e.message : String(e),
      });
      return {
        listings: [],
        complete: false,
        errors: [`${this.sourceName}: ${e instanceof Error ? e.message : "sin respuesta"}`],
      };
    }
    try {
      const listings = this.config.format === "kyero" ? this.parseKyero(body) : this.parseJson(body);
      return { listings, complete: true, errors: [] };
    } catch (e) {
      return {
        listings: [],
        complete: false,
        errors: [`${this.sourceName}: ${e instanceof Error ? e.message : "formato no reconocido"}`],
      };
    }
  }

  /** Kyero XML v3: <root><property>…</property></root>. Only sale listings (price_freq = sale) enter the Radar. */
  parseKyero(xml: string): OpportunityListing[] {
    const doc = xmlToObject(xml);
    const root = (doc.root ?? doc) as Record<string, unknown>;
    const props = asArray(root.property);
    const out: OpportunityListing[] = [];
    for (const p of props) {
      const node = p as Record<string, unknown>;
      const freq = text(node.price_freq).toLowerCase();
      if (freq && freq !== "sale") continue;
      const id = text(node.id) || text(node.ref);
      const price = num(text(node.price));
      const surface = node.surface_area as Record<string, unknown> | undefined;
      const built = num(text(surface?.built)) || num(text(node.built)) || num(text(node.surface));
      if (!id || !price || price <= 0 || !built || built <= 0) continue;
      const location = node.location as Record<string, unknown> | undefined;
      const lat = num(text(location?.latitude));
      const lng = num(text(location?.longitude));
      const point = lat !== undefined && lng !== undefined ? { lat, lng } : undefined;
      const typology = typologyFromText(text(node.type));
      const newBuild = text(node.new_build) === "1";
      const features = asArray((node.features as Record<string, unknown> | undefined)?.feature).map((f) =>
        text(f).toLowerCase(),
      );
      const desc = localized(node.desc);
      const condition: OpportunityListing["condition"] = newBuild
        ? "renovated"
        : features.some((f) => /(reform|renovat)/.test(f)) ||
            /(recién reformad|totalmente reformad|reformado)/i.test(desc)
          ? "renovated"
          : /(para reformar|a reformar|to renovate|needs renovation)/i.test(desc)
            ? "to_renovate"
            : "unknown";
      const town = text(node.town);
      const detail = text(node.location_detail);
      const date = text(node.date).slice(0, 10) || today(this.now);
      const publishedAt = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today(this.now);
      out.push({
        id: `lst_${this.config.id}_${id}`.replace(/[^a-zA-Z0-9_-]/g, "_"),
        sourceId: this.sourceId,
        sourceName: this.sourceName,
        reference: text(node.ref) || id,
        title: localized(node.title) || `${typologyFromTextLabel(typology)} en ${detail || town}`,
        address: [detail, town].filter(Boolean).join(", ") || this.city.name,
        microzoneId: microzoneIdFor(point, this.city),
        coordinates: point,
        typology,
        assetUse: assetUseFor(typology),
        builtAreaM2: Math.round(built),
        bedrooms: num(text(node.beds)),
        bathrooms: num(text(node.baths)),
        elevator: features.some((f) => /(lift|ascensor|elevator)/.test(f)) || undefined,
        condition,
        askingPrice: Math.round(price),
        publishedAt,
        priceHistory: [{ date: publishedAt, price: Math.round(price) }],
        url: localized(node.url) || undefined,
        demo: false,
      });
    }
    return out;
  }

  /** JSON array or { listings: [] } with tolerant field names. */
  parseJson(body: string): OpportunityListing[] {
    const parsed = JSON.parse(body) as unknown;
    const items = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { listings?: unknown }).listings)
        ? (parsed as { listings: unknown[] }).listings
        : [];
    const out: OpportunityListing[] = [];
    for (const raw of items) {
      const r = raw as Record<string, unknown>;
      const id = text(r.id ?? r.reference ?? r.ref);
      const price = num(r.askingPrice ?? r.price);
      const built = num(r.builtAreaM2 ?? r.area ?? r.areaM2 ?? r.size);
      if (!id || !price || price <= 0 || !built || built <= 0) continue;
      const lat = num(r.lat ?? r.latitude ?? (r.coordinates as Record<string, unknown> | undefined)?.lat);
      const lng = num(r.lng ?? r.longitude ?? (r.coordinates as Record<string, unknown> | undefined)?.lng);
      const point = lat !== undefined && lng !== undefined ? { lat, lng } : undefined;
      const typology = typologyFromText(text(r.typology ?? r.type));
      const date = text(r.publishedAt ?? r.date).slice(0, 10);
      const publishedAt = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today(this.now);
      const address = text(r.address);
      out.push({
        id: `lst_${this.config.id}_${id}`.replace(/[^a-zA-Z0-9_-]/g, "_"),
        sourceId: this.sourceId,
        sourceName: this.sourceName,
        reference: text(r.reference ?? r.ref) || id,
        title: text(r.title) || `${typologyFromTextLabel(typology)} en ${address || this.city.name}`,
        address: address || this.city.name,
        microzoneId: text(r.microzoneId) || microzoneIdFor(point, this.city),
        coordinates: point,
        typology,
        assetUse: assetUseFor(typology),
        builtAreaM2: Math.round(built),
        bedrooms: num(r.bedrooms ?? r.beds),
        bathrooms: num(r.bathrooms ?? r.baths),
        floor: num(r.floor),
        elevator: typeof r.elevator === "boolean" ? r.elevator : undefined,
        condition: conditionFromText(text(r.condition ?? r.state)),
        askingPrice: Math.round(price),
        publishedAt,
        priceHistory: [{ date: publishedAt, price: Math.round(price) }],
        url: text(r.url) || undefined,
        demo: false,
      });
    }
    return out;
  }
}

function asArray(v: unknown): unknown[] {
  return v === undefined || v === "" ? [] : Array.isArray(v) ? v : [v];
}

function text(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object" && "__text" in (v as Record<string, unknown>))
    return text((v as Record<string, unknown>).__text);
  return "";
}

/** Kyero localised nodes: <title><es>…</es><en>…</en></title>; plain text also accepted. */
function localized(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return text(o.es) || text(o.en) || text(Object.values(o)[0]);
  }
  return "";
}

function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function typologyFromTextLabel(t: OpportunityListing["typology"]): string {
  return t === "flat"
    ? "Piso"
    : t === "house"
      ? "Casa"
      : t === "premises"
        ? "Local"
        : t === "penthouse"
          ? "Ático"
          : t === "ground_floor_flat"
            ? "Bajo"
            : "Inmueble";
}
