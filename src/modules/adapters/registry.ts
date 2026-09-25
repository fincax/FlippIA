import { createCatastroAdapter, type CatastroAdapter } from "./catastro";
import { createFinancingAdapter, type FinancingProviderAdapter } from "./financing";
import { createMarketAdapter, type MarketAdapter } from "./market";
import { DemoListingsSource, type SourceAdapter } from "./sources";
import type { SourceStatus } from "./types";
import { createUrbanismAdapter, type UrbanismAdapter } from "./urbanismo-sevilla";

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
    catastro: createCatastroAdapter(),
    urbanism: createUrbanismAdapter(),
    market: createMarketAdapter(),
    financing: createFinancingAdapter(),
    sources: [new DemoListingsSource()],
  };
  return cached;
}

export function overrideAdapters(set: Partial<AdapterSet>) {
  cached = { ...adapters(), ...set };
}

export async function sourceStatuses(set = adapters()): Promise<SourceStatus[]> {
  const entries = [set.catastro, set.urbanism, set.market, set.financing];
  const statuses = await Promise.all(
    entries.map(async (a) => ({
      sourceId: a.sourceId,
      name: a.sourceName,
      authority: a.sourceAuthority,
      mode: a.mode,
      available: await a.isAvailable(),
      note: a.mode === "demo" ? "Datos sintéticos de demostración. Sustituible por la fuente real sin cambios en la aplicación." : a.mode === "unavailable" ? "Fuente no configurada." : "Fuente pública.",
      demo: a.mode === "demo",
    })),
  );
  for (const s of set.sources) {
    statuses.push({ sourceId: s.sourceId, name: s.sourceName, authority: "FlippIA", mode: s.kind === "demo" ? "demo" : "partner", available: await s.isAvailable(), note: s.kind === "demo" ? "Listado sintético de oportunidades." : "Feed autorizado.", demo: s.kind === "demo" });
  }
  return statuses;
}
