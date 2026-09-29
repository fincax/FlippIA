import { createCatastroAdapter, type CatastroAdapter } from "./catastro";
import { createFinancingAdapter, type FinancingProviderAdapter } from "./financing";
import { CompositeMarketAdapter, createMarketAdapter, type MarketAdapter } from "./market";
import { createListingSources, type SourceAdapter } from "./sources";
import type { SourceStatus } from "./types";
import { createUrbanismAdapter, type UrbanismAdapter } from "./urbanismo-sevilla";
import { defaultCity } from "@/modules/city/registry";
import type { CityProfile } from "@/modules/city/types";
import { queryLayer } from "./geoservices";

export interface AdapterSet {
  catastro: CatastroAdapter;
  urbanism: UrbanismAdapter;
  market: MarketAdapter;
  financing: FinancingProviderAdapter;
  sources: SourceAdapter[];
}

let cached: AdapterSet | undefined;

/** Adapters are chosen by environment; the rest of the system never knows which implementation is active. */
export function adapters(): AdapterSet {
  cached ??= {
    catastro: createCatastroAdapter(undefined, parcelResolverFromCity(), cadastreNames(defaultCity())),
    urbanism: createUrbanismAdapter(),
    market: createMarketAdapter(),
    financing: createFinancingAdapter(),
    sources: createListingSources(),
  };
  return cached;
}

/** Province and municipality as the Catastro spells them for a city. */
function cadastreNames(city: CityProfile): { province: string; municipality: string } {
  return city.cadastre ?? { province: city.name.toUpperCase(), municipality: city.name.toUpperCase() };
}

/** Cadastral reference under a point via the city's public parcel layer (when configured). */
function parcelResolverFromCity():
  ((point: { lat: number; lng: number }) => Promise<string | undefined>) | undefined {
  const parcel = defaultCity().urbanism.publicSources?.parcel;
  const field = parcel?.fields.cadastralRef;
  if (!parcel || !field) return undefined;
  return async (point) => {
    const attempt = async (distanceM?: number) => {
      const r = await queryLayer(
        parcel.source,
        { point, maxFeatures: 1, ...(distanceM ? { distanceM } : {}) },
        { timeoutMs: 10_000 },
      );
      const v = r.features[0]?.attributes[field];
      return v ? String(v).trim().toUpperCase() : undefined;
    };
    return (await attempt()) ?? (await attempt(8));
  };
}

export function overrideAdapters(set: Partial<AdapterSet>) {
  cached = { ...adapters(), ...set };
}

export async function sourceStatuses(set = adapters()): Promise<SourceStatus[]> {
  const market =
    set.market instanceof CompositeMarketAdapter
      ? [...set.market.providers, ...(set.market.fallback ? [set.market.fallback] : [])]
      : [set.market];
  const entries = [set.catastro, set.urbanism, ...market, set.financing];
  const statuses = await Promise.all(
    entries.map(async (a) => ({
      sourceId: a.sourceId,
      name: a.sourceName,
      authority: a.sourceAuthority,
      mode: a.mode,
      available: await a.isAvailable(),
      note:
        a.mode === "demo"
          ? "Datos sintéticos de demostración. Sustituible por la fuente real sin cambios en la aplicación."
          : a.mode === "unavailable"
            ? "Fuente no configurada."
            : a.mode === "partner"
              ? "Fuente autorizada (API con credenciales o datos propios de la organización)."
              : "Fuente pública.",
      demo: a.mode === "demo",
    })),
  );
  for (const s of set.sources) {
    statuses.push({
      sourceId: s.sourceId,
      name: s.sourceName,
      authority: s.kind === "demo" ? "FlippIA" : s.sourceName,
      mode: s.kind === "demo" ? "demo" : "partner",
      available: await s.isAvailable(),
      note:
        s.kind === "demo"
          ? "Listado sintético de oportunidades."
          : s.kind === "api"
            ? "Anuncios activos por API autorizada (sincronización programada)."
            : "Feed autorizado del propietario de los datos.",
      demo: s.kind === "demo",
    });
  }
  return statuses;
}
