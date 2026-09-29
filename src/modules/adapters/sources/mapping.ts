import { defaultCity, haversineM, microzoneFromPoint } from "@/modules/city/registry";
import type { CityProfile, LatLng } from "@/modules/city/types";
import type { PropertyTypology } from "@/modules/property/types";
import type { OpportunityListing } from "./types";

/** Microzone for a point, only when the point is reasonably inside it. */
export function microzoneIdFor(
  point: LatLng | undefined,
  city: CityProfile = defaultCity(),
): string | undefined {
  if (!point) return undefined;
  const zone = microzoneFromPoint(city, point);
  if (!zone) return undefined;
  return haversineM(zone.centroid, point) <= zone.radiusM * 1.5 ? zone.id : undefined;
}

export function assetUseFor(typology: PropertyTypology): OpportunityListing["assetUse"] {
  switch (typology) {
    case "premises":
      return "commercial";
    case "office":
      return "office";
    case "warehouse":
      return "industrial";
    case "plot":
      return "land";
    case "garage":
    case "other":
      return "other";
    default:
      return "residential";
  }
}

/** Free-text property type (Idealista, Kyero, CRMs) → typology. */
export function typologyFromText(text: string | undefined): PropertyTypology {
  const t = (text ?? "").toLowerCase();
  if (!t) return "other";
  if (/(penthouse|ático|atico)/.test(t)) return "penthouse";
  if (/(bajo|ground)/.test(t)) return "ground_floor_flat";
  if (/(flat|apartment|apartamento|piso|studio|estudio|duplex|dúplex|loft)/.test(t)) return "flat";
  if (/(chalet|house|casa|villa|townhouse|adosad|country|finca|cortijo)/.test(t)) return "house";
  if (/(premises|local|commercial|comercial|shop|tienda|nave.*comercial)/.test(t)) return "premises";
  if (/(office|oficina)/.test(t)) return "office";
  if (/(building|edificio)/.test(t)) return "building";
  if (/(plot|land|solar|parcela|terreno)/.test(t)) return "plot";
  if (/(warehouse|nave|industrial)/.test(t)) return "warehouse";
  if (/(garage|garaje|parking|plaza)/.test(t)) return "garage";
  return "other";
}

export function conditionFromText(text: string | undefined): OpportunityListing["condition"] {
  const t = (text ?? "").toLowerCase();
  if (/(renovat|reform|restaur|new|nuev|obra nueva|to_renovate)/.test(t)) {
    if (/(to_renovate|para reformar|a reformar|needs|necesita|renew)/.test(t)) return "to_renovate";
    return "renovated";
  }
  if (/(good|buen)/.test(t)) return "good";
  return "unknown";
}

export function today(now: () => number = Date.now): string {
  return new Date(now()).toISOString().slice(0, 10);
}
