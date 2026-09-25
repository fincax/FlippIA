import { defaultCity } from "@/modules/city/registry";
import { seededUnit } from "../types";
import type { OpportunityListing, SourceAdapter } from "./types";

/** DEMO listings feed: 24 synthetic Sevilla listings with price history. */
export class DemoListingsSource implements SourceAdapter {
  sourceId = "listings-demo";
  sourceName = "Red FlippIA (DEMO)";
  kind = "demo" as const;

  async isAvailable() {
    return true;
  }

  async listings(filter: { microzoneIds?: string[]; maxPrice?: number; assetUse?: OpportunityListing["assetUse"] } = {}) {
    const all = generateDemoListings();
    return all.filter((l) => (!filter.microzoneIds || filter.microzoneIds.includes(l.microzoneId ?? "")) && (!filter.maxPrice || l.askingPrice <= filter.maxPrice) && (!filter.assetUse || l.assetUse === filter.assetUse));
  }
}

const STREETS: Record<string, string[]> = {
  "sev-triana": ["Calle Pureza", "Calle Betis", "Calle Castilla", "Calle Alfarería", "Calle Rodrigo de Triana"],
  "sev-centro": ["Calle Regina", "Calle Feria", "Calle San Luis", "Calle Amor de Dios"],
  "sev-nervion": ["Calle Luis Montoto", "Avenida Eduardo Dato", "Calle Marqués de Nervión"],
  "sev-remedios": ["Calle Asunción", "Calle Virgen de Luján", "Calle Fernando IV"],
  "sev-macarena": ["Calle Resolana", "Calle Doctor Fedriani", "Calle San Julián"],
  "sev-alameda": ["Alameda de Hércules", "Calle Calatrava", "Calle Jesús del Gran Poder"],
  "sev-san-bernardo": ["Calle San Bernardo", "Avenida Menéndez Pelayo"],
  "sev-porvenir": ["Calle Felipe II", "Calle Juan Sebastián Elcano"],
  "sev-ciudad-jardin": ["Calle Marqués de Pickman", "Avenida de la Buhaira"],
  "sev-este": ["Avenida Emilio Lemos", "Calle Flota de Indias"],
};

let cache: OpportunityListing[] | undefined;

export function generateDemoListings(): OpportunityListing[] {
  if (cache) return cache;
  const city = defaultCity();
  const out: OpportunityListing[] = [];
  const zones = Object.keys(STREETS);
  for (let i = 0; i < 24; i++) {
    const zoneId = zones[i % zones.length]!;
    const zone = city.microzones.find((m) => m.id === zoneId)!;
    const u = (salt: string) => seededUnit(`listing:${i}`, salt);
    const isPremises = u("use") < 0.25;
    const toRenovate = u("cond") < 0.65;
    const area = Math.round(55 + u("area") * 100);
    const streets = STREETS[zoneId]!;
    const street = streets[Math.floor(u("street") * streets.length)]!;
    const number = Math.floor(2 + u("num") * 80);
    const perM2 = isPremises ? zone.demoMarket.commercialPerM2 : toRenovate ? zone.demoMarket.residentialUnrenovatedPerM2 : zone.demoMarket.residentialRenovatedPerM2;
    // Some listings are mispriced (value discrepancy): that is what the Radar hunts.
    const discrepancy = u("disc") < 0.3 ? 0.82 : u("disc") < 0.6 ? 0.95 : 1.08;
    const price = Math.round((perM2 * area * discrepancy) / 1000) * 1000;
    const daysAgo = Math.floor(u("days") * 120);
    const published = new Date("2026-01-15");
    published.setDate(published.getDate() - daysAgo);
    const history: OpportunityListing["priceHistory"] = [{ date: published.toISOString().slice(0, 10), price: Math.round(price * (u("hist") < 0.4 ? 1.06 : 1)) }];
    if (history[0]!.price !== price) {
      const d = new Date(published.getTime());
      d.setDate(d.getDate() + Math.floor(daysAgo * 0.6));
      history.push({ date: d.toISOString().slice(0, 10), price });
    }
    out.push({
      id: `lst_demo_${String(i + 1).padStart(3, "0")}`,
      sourceId: "listings-demo",
      reference: `DEMO-${1000 + i}`,
      title: `${isPremises ? "Local" : toRenovate ? "Piso para reformar" : "Piso reformado"} en ${zone.name}`,
      address: `${street} ${number}, ${zone.name}, Sevilla`,
      microzoneId: zoneId,
      typology: isPremises ? "premises" : u("floor") < 0.2 ? "ground_floor_flat" : "flat",
      assetUse: isPremises ? "commercial" : "residential",
      builtAreaM2: area,
      bedrooms: isPremises ? undefined : Math.max(1, Math.round(area / 32)),
      bathrooms: isPremises ? 1 : area > 90 ? 2 : 1,
      floor: isPremises ? 0 : Math.floor(u("floor") * 5),
      elevator: u("lift") < 0.55,
      condition: isPremises ? "to_renovate" : toRenovate ? "to_renovate" : "renovated",
      askingPrice: price,
      publishedAt: published.toISOString().slice(0, 10),
      priceHistory: history,
      demo: true,
    });
  }
  cache = out;
  return out;
}
