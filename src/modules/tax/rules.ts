import type { TaxRuleSet } from "./types";

/**
 * Notary fees (arancel RD 1426/1989) and registry fees (RD 1427/1989), simplified
 * to the base scale on the deed value. Real invoices add copies, VAT and
 * concepts; the engine labels these figures as INFERRED estimates.
 */
const NOTARY_SCALE = [
  { upTo: 6_010.12, fixed: 90.15 },
  { upTo: 30_050.61, marginalRate: 0.0045 },
  { upTo: 60_101.21, marginalRate: 0.0015 },
  { upTo: 150_253.03, marginalRate: 0.001 },
  { upTo: 601_012.1, marginalRate: 0.0005 },
  { upTo: 6_010_121.04, marginalRate: 0.0003 },
  { upTo: Infinity, marginalRate: 0.0002 },
];

const REGISTRY_SCALE = [
  { upTo: 6_010.12, fixed: 24.04 },
  { upTo: 30_050.61, marginalRate: 0.00175 },
  { upTo: 60_101.21, marginalRate: 0.00125 },
  { upTo: 150_253.03, marginalRate: 0.00075 },
  { upTo: 601_012.1, marginalRate: 0.0003 },
  { upTo: Infinity, marginalRate: 0.0002 },
];

/**
 * Andalucía + Sevilla, rules identified as in force for 2025–2026 analyses.
 * Figures are reviewed against the regulatory registry entries referenced
 * below. Any deviation (reduced ITP for young buyers, VPO, etc.) is a
 * REVIEW_REQUIRED item rather than an automatic assumption.
 */
export const TAX_RULES_ES_AND_SEVILLA_2025: TaxRuleSet = {
  id: "tax.es.and.sevilla.2025",
  label: "España · Andalucía · Sevilla (vigente 2025)",
  jurisdiction: { country: "ES", region: "AND", municipalityCode: "41091" },
  effectiveFrom: "2025-01-01",
  regulationRefs: ["reg.es.and.tributos-cedidos.dl1-2018", "reg.es.irpf.ley35-2006", "reg.es.sevilla.ordenanza-icio", "reg.es.itp-ajd.rdl1-1993"],
  status: "INFERRED",
  notes: [
    "ITP general en Andalucía: 7 % desde la reforma del Decreto-ley 1/2018 (texto refundido de tributos cedidos). Tipos reducidos (jóvenes, VPO, familias numerosas) no se aplican automáticamente.",
    "AJD general en Andalucía: 1,2 %.",
    "IVA en vivienda nueva 10 %; en locales y obra nueva no residencial 21 %.",
    "Los aranceles notariales y registrales se estiman sobre la escala base; la factura final incluye copias, IVA y conceptos adicionales.",
    "La plusvalía municipal (IIVTNU) depende del valor catastral del suelo y del periodo de tenencia; requiere dato catastral y revisión.",
  ],
  acquisition: {
    itpRate: 0.07,
    ajdRate: 0.012,
    ivaResidentialNew: 0.1,
    ivaCommercial: 0.21,
    notaryScale: NOTARY_SCALE,
    registryScale: REGISTRY_SCALE,
  },
  works: {
    icioRate: 0.04,
    licenceFeeRate: 0.0075,
    ivaWorksRate: 0.21,
    ivaWorksReducedRate: 0.1,
  },
  holding: {
    ibiUrbanRateOnCadastral: 0.0045,
  },
  exit: {
    capitalGainsIndividual: [
      { upTo: 6_000, rate: 0.19 },
      { upTo: 50_000, rate: 0.21 },
      { upTo: 200_000, rate: 0.23 },
      { upTo: 300_000, rate: 0.27 },
      { upTo: Infinity, rate: 0.3 },
    ],
    corporateTaxRate: 0.25,
    plusvaliaMunicipal: {
      method: "requires_cadastral_land_value",
      maxRate: 0.3,
      note: "Se calcula sobre el incremento del valor catastral del suelo (método objetivo o real). Requiere valor catastral y fecha de adquisición.",
    },
  },
};

const RULE_SETS: TaxRuleSet[] = [TAX_RULES_ES_AND_SEVILLA_2025];

export function listTaxRuleSets(): TaxRuleSet[] {
  return [...RULE_SETS];
}

/**
 * Resolve the most specific rule set in force on `date` for a jurisdiction.
 * Specificity: municipality > region > country.
 */
export function resolveTaxRules(
  jurisdiction: { country: string; region?: string; municipalityCode?: string },
  date: string,
): TaxRuleSet | undefined {
  const candidates = RULE_SETS.filter((r) => {
    if (r.jurisdiction.country !== jurisdiction.country) return false;
    if (r.jurisdiction.region && r.jurisdiction.region !== jurisdiction.region) return false;
    if (r.jurisdiction.municipalityCode && r.jurisdiction.municipalityCode !== jurisdiction.municipalityCode) return false;
    if (r.effectiveFrom > date) return false;
    if (r.effectiveUntil && r.effectiveUntil < date) return false;
    return true;
  });
  candidates.sort((a, b) => specificity(b) - specificity(a) || b.effectiveFrom.localeCompare(a.effectiveFrom));
  return candidates[0];
}

function specificity(r: TaxRuleSet): number {
  return (r.jurisdiction.municipalityCode ? 4 : 0) + (r.jurisdiction.region ? 2 : 0) + 1;
}
