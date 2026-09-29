import type { OpportunityListing } from "@/modules/adapters/sources/types";
import type { Microzone } from "@/modules/city/types";
import type { InvestorDNA } from "@/modules/investor/types";
import type { PropertyTypology } from "@/modules/property/types";

/** Quick-pass figures every criterion is checked against. */
export interface QuickFigures {
  roe: number | null;
  netProfit: number;
  equityRequired: number;
  durationMonths: number;
}

/**
 * Investor DNA criteria as human-readable failures. Shared by the flip quick
 * pass and the MultiExit quick pass so both explain a miss the same way.
 */
export function investorCriteriaFailures(
  listing: OpportunityListing,
  zone: Microzone,
  investor: InvestorDNA,
  f: QuickFigures,
  opts: { ignoreDuration?: boolean } = {},
): string[] {
  const failed: string[] = [];
  if (f.roe === null || f.roe < investor.targetRoe)
    failed.push(
      `ROE ${f.roe === null ? "n/d" : (f.roe * 100).toFixed(1) + " %"} < objetivo ${(investor.targetRoe * 100).toFixed(0)} %`,
    );
  if (f.netProfit < investor.targetProfit)
    failed.push(
      `Beneficio ${Math.round(f.netProfit).toLocaleString("es-ES")} € < objetivo ${investor.targetProfit.toLocaleString("es-ES")} €`,
    );
  if (f.equityRequired > investor.maxEquityPerDeal)
    failed.push(
      `Capital ${Math.round(f.equityRequired).toLocaleString("es-ES")} € > máximo ${investor.maxEquityPerDeal.toLocaleString("es-ES")} €`,
    );
  if (!opts.ignoreDuration && f.durationMonths > investor.horizonMonths)
    failed.push(`Duración ${f.durationMonths} meses > horizonte ${investor.horizonMonths}`);
  if (investor.zones.length && !investor.zones.includes(zone.id))
    failed.push(`Zona ${zone.name} fuera de tus zonas`);
  if (listing.askingPrice > investor.ticketMax || listing.askingPrice < investor.ticketMin)
    failed.push("Precio fuera de tu ticket");
  return failed;
}

/** What the asset itself must be for a project brief. Every field is optional; nothing = no constraint. */
export interface AssetConstraints {
  assetUse?: OpportunityListing["assetUse"];
  typology?: PropertyTypology;
  condition?: OpportunityListing["condition"];
  minAreaM2?: number;
  maxAreaM2?: number;
  maxPrice?: number;
  /** Microzone ids; applied through `InvestorDNA.zones`, kept here for the summary. */
  zoneIds: string[];
}

export const ASSET_USE_LABEL: Record<OpportunityListing["assetUse"], string> = {
  residential: "residencial",
  commercial: "comercial",
  office: "oficinas",
  industrial: "industrial",
  land: "suelo",
  other: "otro uso",
};

export const TYPOLOGY_LABEL: Record<PropertyTypology, string> = {
  flat: "piso",
  ground_floor_flat: "bajo",
  penthouse: "ático",
  house: "casa",
  premises: "local",
  office: "oficina",
  building: "edificio",
  plot: "solar",
  warehouse: "nave",
  garage: "garaje",
  other: "otro",
};

const CONDITION_LABEL: Record<OpportunityListing["condition"], string> = {
  to_renovate: "para reformar",
  good: "en buen estado",
  renovated: "reformado",
  unknown: "estado desconocido",
};

/** Typologies a brief accepts as the same thing ("piso" also admits a ground-floor flat or a penthouse). */
const TYPOLOGY_FAMILY: Partial<Record<PropertyTypology, PropertyTypology[]>> = {
  flat: ["flat", "ground_floor_flat", "penthouse"],
  premises: ["premises"],
  office: ["office"],
  house: ["house"],
};

/** Failures of a listing against the asset constraints of a brief, in the same voice as the DNA criteria. */
export function assetConstraintFailures(listing: OpportunityListing, c: AssetConstraints): string[] {
  const failed: string[] = [];
  if (c.assetUse && listing.assetUse !== c.assetUse)
    failed.push(`Uso ${ASSET_USE_LABEL[listing.assetUse]}, buscas ${ASSET_USE_LABEL[c.assetUse]}`);
  if (c.typology && !(TYPOLOGY_FAMILY[c.typology] ?? [c.typology]).includes(listing.typology))
    failed.push(`Tipología ${TYPOLOGY_LABEL[listing.typology]}, buscas ${TYPOLOGY_LABEL[c.typology]}`);
  if (c.condition && listing.condition !== c.condition && listing.condition !== "unknown")
    failed.push(`Estado ${CONDITION_LABEL[listing.condition]}, buscas ${CONDITION_LABEL[c.condition]}`);
  if (c.minAreaM2 && listing.builtAreaM2 < c.minAreaM2)
    failed.push(`Superficie ${listing.builtAreaM2} m² < mínimo ${c.minAreaM2} m²`);
  if (c.maxAreaM2 && listing.builtAreaM2 > c.maxAreaM2)
    failed.push(`Superficie ${listing.builtAreaM2} m² > máximo ${c.maxAreaM2} m²`);
  if (c.maxPrice && listing.askingPrice > c.maxPrice)
    failed.push(
      `Precio ${listing.askingPrice.toLocaleString("es-ES")} € > tope ${c.maxPrice.toLocaleString("es-ES")} €`,
    );
  return failed;
}
