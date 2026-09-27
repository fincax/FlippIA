import { defaultCity, microzonesFromText, normalizeText } from "@/modules/city/registry";
import type { CityProfile } from "@/modules/city/types";
import type { InvestorDNA } from "@/modules/investor/types";
import { parseIntake, parseMoney, type IntakeRequest } from "@/modules/property/intake";
import { STRATEGY_PLUGINS } from "@/modules/strategies/plugins";
import type { StrategyPlugin } from "@/modules/strategies/types";
import { ASSET_USE_LABEL, TYPOLOGY_LABEL, type AssetConstraints } from "./criteria";

export type StrategyFamily = StrategyPlugin["family"];

/**
 * Reverse investing brief: what the investor wants to do (strategies,
 * families, objective) and what the asset must be (use, typology, size,
 * zones, price cap), parsed deterministically from the spoken objective.
 * Numbers about the investor come from `parseIntake`, unchanged.
 */
export interface ProjectBrief {
  rawText: string;
  intake: IntakeRequest;
  /** Capital was stated explicitly ("tengo", "dispongo", "capital"), not inferred from a price cap. */
  explicitCapital: boolean;
  strategyIds: string[];
  families: StrategyFamily[];
  objective?: InvestorDNA["objective"];
  asset: AssetConstraints;
  /** The text describes a project (what to buy or what to do with it), not only a budget. */
  hasProject: boolean;
  summary: string;
}

const FAMILY_LABEL: Record<StrategyFamily, string> = {
  sell: "reformar y vender",
  hold: "obtener rentas",
  transform: "transformar",
  develop: "promover",
};

/** Spoken project → strategies. Extend here when a new plugin deserves its own words. */
const STRATEGY_KEYWORDS: Array<{
  re: RegExp;
  strategyIds?: string[];
  families?: StrategyFamily[];
  objective?: InvestorDNA["objective"];
}> = [
  {
    re: /cambio de uso|convertir(?:lo|la|los|las)?\s+(?:en|a)\s+vivienda|pasar(?:lo|la)?\s+a\s+vivienda|transformar(?:lo|la)?\s+en\s+vivienda|hacer(?:lo)?\s+vivienda/,
    strategyIds: ["change_of_use"],
  },
  { re: /dividir|division|segregar|dos viviendas|partir(?:lo|la)? en dos/, strategyIds: ["subdivision"] },
  { re: /turistic|airbnb|\bvut\b|\bvft\b|vacacional/, strategyIds: ["tourist_rental"], objective: "income" },
  {
    re: /rehabilitacion energetica|eficiencia energetica|certificado energetico|calificacion energetica/,
    strategyIds: ["energy_retrofit_sale"],
  },
  {
    re: /vender con (?:proyecto|licencia)|con licencia concedida|licencia y vender/,
    strategyIds: ["sale_with_licence"],
  },
  { re: /redistribu/, strategyIds: ["redistribution_sale"] },
  {
    re: /alquil|arrendar|\brentas?\b|renta mensual|cash ?flow|patrimoni|para mantener/,
    families: ["hold"],
    objective: "income",
  },
  {
    re: /reformar y vender|\bflip\b|revender|plusvalia|compra ?venta|para vender|y vender/,
    families: ["sell"],
    objective: "capital_gain",
  },
  { re: /promover|promocion|desarrollar|edificar|construir/, families: ["develop"] },
];

const CAPITAL_RE = /\b(?:tengo|dispongo de|capital de|capital|presupuesto de|presupuesto)\s+(?:unos\s+)?\d/;
const MAX_PRICE_RE =
  /(?:hasta|menos de|por debajo de|no mas de|inferior(?:es)? a|tope de|precio maximo(?: de)?|maximo(?: de)?|que no (?:pase|supere) de)\s+(?:unos\s+)?(\d{1,3}(?:[.\s]\d{3})+|\d+(?:[.,]\d+)?)\s*(k|mil|m|millones|€|eur|euros)?/g;
const EQUITY_BEFORE_RE = /(?:aportar|aportacion|entrada|equity|capital propio)\s*(?:de\s+)?$/;
const AREA_RE = /(\d{2,4})\s*(?:m2|m²|metros)/g;
const AREA_MIN_BEFORE_RE = /(?:mas de|minimo|al menos|a partir de|desde|no menos de)\s*(?:unos\s+)?$/;
const AREA_MAX_BEFORE_RE = /(?:menos de|hasta|maximo|no mas de|por debajo de)\s*(?:unos\s+)?$/;
const MIN_PRICE = 20_000;

function pluginsByFamily(families: StrategyFamily[]): string[] {
  return STRATEGY_PLUGINS.filter((p) => families.includes(p.family)).map((p) => p.id);
}

/** Parse a spoken objective into a brief. Never throws; an unrelated text yields an empty brief. */
export function parseProjectBrief(text: string, city: CityProfile = defaultCity()): ProjectBrief {
  const intake = parseIntake(text);
  const t = normalizeText(text);

  const strategyIds = new Set<string>();
  const families = new Set<StrategyFamily>();
  let objective: InvestorDNA["objective"] | undefined;
  for (const k of STRATEGY_KEYWORDS) {
    if (!k.re.test(t)) continue;
    for (const id of k.strategyIds ?? []) strategyIds.add(id);
    for (const f of k.families ?? []) families.add(f);
    if (k.objective) objective = objective && objective !== k.objective ? "mixed" : k.objective;
  }

  const asset: AssetConstraints = { zoneIds: microzonesFromText(city, text).map((z) => z.id) };
  if (intake.property?.assetUse) asset.assetUse = intake.property.assetUse;
  if (intake.property?.typology) asset.typology = intake.property.typology;
  if (intake.property?.condition && intake.property.condition !== "good")
    asset.condition = intake.property.condition;

  for (const m of t.matchAll(MAX_PRICE_RE)) {
    const before = t.slice(Math.max(0, m.index - 24), m.index);
    if (EQUITY_BEFORE_RE.test(before)) continue;
    const amount = parseMoney(`${m[1]} ${m[2] ?? "€"}`)[0];
    if (amount && amount >= MIN_PRICE) {
      asset.maxPrice = amount;
      break;
    }
  }

  for (const m of t.matchAll(AREA_RE)) {
    const value = Number(m[1]);
    const before = t.slice(Math.max(0, m.index - 20), m.index);
    if (AREA_MIN_BEFORE_RE.test(before)) asset.minAreaM2 = value;
    else if (AREA_MAX_BEFORE_RE.test(before)) asset.maxAreaM2 = value;
    else {
      asset.minAreaM2 = Math.round(value * 0.8);
      asset.maxAreaM2 = Math.round(value * 1.25);
    }
  }

  const hasProject =
    strategyIds.size > 0 ||
    families.size > 0 ||
    objective !== undefined ||
    Boolean(asset.assetUse || asset.typology);

  const brief: ProjectBrief = {
    rawText: text,
    intake,
    explicitCapital: CAPITAL_RE.test(t),
    strategyIds: [...strategyIds],
    families: [...families],
    objective,
    asset,
    hasProject,
    summary: "",
  };
  brief.summary = summarizeBrief(brief, city);
  return brief;
}

function summarizeBrief(b: ProjectBrief, city: CityProfile): string {
  const parts: string[] = [];
  const what = b.asset.typology
    ? TYPOLOGY_LABEL[b.asset.typology]
    : b.asset.assetUse
      ? `activo ${ASSET_USE_LABEL[b.asset.assetUse]}`
      : "oportunidades";
  parts.push(what);
  if (b.asset.condition === "to_renovate") parts.push("para reformar");
  if (b.asset.condition === "renovated") parts.push("reformado");
  if (b.asset.minAreaM2 && b.asset.maxAreaM2) parts.push(`${b.asset.minAreaM2}–${b.asset.maxAreaM2} m²`);
  else if (b.asset.minAreaM2) parts.push(`desde ${b.asset.minAreaM2} m²`);
  else if (b.asset.maxAreaM2) parts.push(`hasta ${b.asset.maxAreaM2} m²`);
  if (b.asset.zoneIds.length) {
    const names = b.asset.zoneIds
      .map((id) => city.microzones.find((z) => z.id === id)?.name ?? id)
      .join(", ");
    parts.push(`en ${names}`);
  }
  if (b.asset.maxPrice) parts.push(`hasta ${b.asset.maxPrice.toLocaleString("es-ES")} €`);
  const labels = b.strategyIds
    .map((id) => STRATEGY_PLUGINS.find((p) => p.id === id)?.label.toLowerCase() ?? id)
    .concat(b.families.filter((f) => !b.strategyIds.length || f === "develop").map((f) => FAMILY_LABEL[f]));
  if (labels.length) parts.push(`para ${[...new Set(labels)].join(" o ")}`);
  return parts.join(" · ");
}

/**
 * Strategies the Radar should evaluate for a brief and a DNA. `undefined`
 * keeps the classic quick pass (buy, renovate, sell); a list switches to the
 * MultiExit quick pass with exactly those plugins.
 */
export function strategySetFor(brief: ProjectBrief | undefined, investor: InvestorDNA): string[] | undefined {
  const known = new Set(STRATEGY_PLUGINS.map((p) => p.id));
  if (brief?.strategyIds.length) return brief.strategyIds.filter((id) => known.has(id));
  if (brief?.families.length) return pluginsByFamily(brief.families);
  if (brief?.objective === "income") return pluginsByFamily(["hold"]);
  if (brief?.objective === "capital_gain") return pluginsByFamily(["sell", "transform", "develop"]);
  if (brief?.hasProject) return [...known];
  if (investor.strategies.length) {
    const own = investor.strategies.filter((id) => known.has(id));
    return own.length ? own : undefined;
  }
  return undefined;
}

/**
 * A spoken objective overrides the saved DNA for one search. Numbers follow
 * the historic Radar rules (equity 40 % of capital when not stated; ticket
 * stretched to 1,6 × capital); the brief adds zones, strategies, objective
 * and a price cap. A price cap is never mistaken for capital.
 */
export function applyBriefToDna(saved: InvestorDNA, brief: ProjectBrief): InvestorDNA {
  const inv = brief.intake.investor ?? {};
  const capital =
    inv.capital && (brief.explicitCapital || inv.capital !== brief.asset.maxPrice) ? inv.capital : undefined;
  const dna: InvestorDNA = {
    ...saved,
    capitalAvailable: capital ?? saved.capitalAvailable,
    maxEquityPerDeal: inv.maxEquity ?? (capital ? Math.round(capital * 0.4) : saved.maxEquityPerDeal),
    horizonMonths: inv.horizonMonths ?? saved.horizonMonths,
    targetProfit: inv.targetProfit ?? saved.targetProfit,
    targetRoe: inv.targetRoe ?? saved.targetRoe,
    ticketMax: capital ? Math.max(saved.ticketMax, capital * 1.6) : saved.ticketMax,
    zones: brief.asset.zoneIds.length ? brief.asset.zoneIds : saved.zones,
    strategies: brief.strategyIds.length ? brief.strategyIds : saved.strategies,
    objective: brief.objective ?? saved.objective,
  };
  if (brief.asset.maxPrice) {
    dna.ticketMax = brief.asset.maxPrice;
    dna.ticketMin = Math.min(saved.ticketMin, brief.asset.maxPrice);
  }
  return dna;
}
