import { normalizeText } from "@/modules/city/registry";
import type { AssetUse } from "@/modules/engines/financial/types";
import type { PropertyTypology } from "./types";

export type IntakeIntent =
  | "analyze_property"
  | "find_opportunity"
  | "capital_available"
  | "optimize_investment"
  | "what_if"
  | "question"
  | "unknown";

export interface IntakeRequest {
  intent: IntakeIntent;
  rawText: string;
  property?: {
    address?: string;
    cadastralRef?: string;
    coordinates?: { lat: number; lng: number };
    url?: string;
    typology?: PropertyTypology;
    assetUse?: AssetUse;
    areaM2?: number;
    bedrooms?: number;
    bathrooms?: number;
    floor?: number;
    condition?: "to_renovate" | "renovated" | "good";
  };
  price?: number;
  /** Monthly rent mentioned in the text ("1.500 € al mes"); never taken as the purchase price. */
  expectedRent?: number;
  investor?: {
    capital?: number;
    maxEquity?: number;
    horizonMonths?: number;
    targetProfit?: number;
    targetRoe?: number;
    zones?: string[];
  };
  /** Free-form entities recognised but not mapped. */
  notes: string[];
}

const CADASTRAL_RE = /\b([0-9]{7}[A-Z]{2}[0-9]{4}[A-Z]{1}[0-9]{4}[A-Z]{2}|[0-9A-Z]{14})\b/i;
const CADASTRAL_FULL_RE = /\b[0-9]{7}[A-Z]{2}[0-9]{4}[A-Z][0-9]{4}[A-Z]{2}\b/i;
const URL_RE = /https?:\/\/[^\s]+/i;
const COORD_RE = /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/;
const NUMBER_SRC = "(\\d{1,3}(?:[.\\s]\\d{3})+|\\d+)";
/** Suffix units: k / mil (thousands), M / millón / millones (millions), currency words. */
const UNIT_SRC = "(k(?![a-z0-9])|mill(?:on|ón|ones)\\b|m(?![a-z0-9²])|mil\\b|€|eur\\b|euros?\\b)";
/** "285.000 €", "€ 285.000", "300k", "1,5 millones", "1.5M". Prefix or suffix required. */
const MONEY_RE = new RegExp(`(?:(€|eur(?:os)?)\\s*)?${NUMBER_SRC}(?:[,.](\\d{1,2}))?\\s*${UNIT_SRC}?`, "gi");
/** Bare number after a price keyword ("precio 199.000", "por 199.000"), no unit. */
const BARE_PRICE_RE = new RegExp(
  `\\b(?:precio|por|a|piden|pide|compra(?:r|rlo|rla)?|compro|cuesta|vale)\\s*(?:de|:)?\\s*${NUMBER_SRC}(?![.,]?\\d)`,
  "gi",
);
const RENT_AFTER_RE =
  /^\s*(?:€|euros?|eur)?\s*(?:al\s+mes|\/\s*mes|por\s+mes|mensual(?:es)?|de\s+alquiler|de\s+renta)\b/i;
const RENT_BEFORE_RE = /(?:alquiler|alquilar(?:l[oa])?|arrendar|renta)\s+(?:de|por|a|en)?\s*$/i;
const SALE_BEFORE_RE = /(?:vend(?:e|o|er|erlo|erla)|venta|salida|revender)\s+(?:a|por|en|de)?\s*$/i;
const BUY_BEFORE_RE =
  /(?:\bcompra(?:r|rlo|rla)?|\bcompro|\bprecio|\bpiden|\bpide|\bpor|\ba|\bcuesta|\bvale)\s*(?:de|:)?\s*$/i;
const AREA_RE = /(\d{2,4})\s*(?:m2|m²|metros)/i;
const MONTHS_RE = /(\d{1,2})\s*(?:meses|mes)\b/i;
const YEARS_RE = /(\d{1,2})\s*(?:años|año)\b/i;
const ROOMS_RE = /(\d)\s*(?:habitaciones|hab\b|dormitorios)/i;
const BATH_RE = /(\d)\s*(?:baños|baño)/i;
const FLOOR_RE = /\b(\d)\s*[ºo°ª](?:\s*(?:planta|piso))?|\b(\d)\s*(?:planta|piso)\b|\bplanta\s+(\d)\b/i;
const ROE_RE = /(\d{1,2})\s*%\s*(?:de\s+)?(?:roe|rentabilidad|retorno)/i;
// Street names may start with a number ("Calle 10 de Diciembre 4"): allow a leading number followed by a word.
const STREET_RE =
  /\b(?:calle|c\/|avenida|avda\.?|av\.?|plaza|pza\.?|paseo|ronda|travesía|travesia|camino|carretera|glorieta|barriada|bda\.?)\s+(?:\d{1,4}\s+(?=[a-záéíóúñ]))?[^,.;\d]{2,60}(?:,?\s*(?:n[ºo°.]?\s*)?\d{1,4}(?:\s*[a-z]\b)?)?/i;
const ZONE_HINT_RE =
  /\b(?:en|de)\s+(?:(?:la|el|los|las)\s+)?([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)*)/;

const TYPOLOGY_KEYWORDS: Array<[RegExp, PropertyTypology, AssetUse]> = [
  [/\blocal(?:es)?\b/, "premises", "commercial"],
  [/\bnave\b/, "warehouse", "industrial"],
  [/\boficina\b/, "office", "office"],
  [/\bedificio\b/, "building", "residential"],
  [/\bsolar\b|\bparcela\b|\bterreno\b/, "plot", "land"],
  [/\bático\b|\batico\b/, "penthouse", "residential"],
  [/\bbajo\b|\bplanta baja\b/, "ground_floor_flat", "residential"],
  [/\bcasa\b|\bchalet\b|\badosado\b|\bunifamiliar\b/, "house", "residential"],
  [/\bpiso\b|\bvivienda\b|\bapartamento\b/, "flat", "residential"],
  [/\bgaraje\b|\bplaza de garaje\b/, "garage", "other"],
];

/** Money amount as written: integer part with Spanish separators, optional decimals and unit. */
function toAmount(whole: string, decimals: string | undefined, unit: string | undefined): number | undefined {
  const int = Number(whole.replace(/[.\s]/g, ""));
  if (!Number.isFinite(int)) return undefined;
  const dec = decimals ? Number(decimals) / 10 ** decimals.length : 0;
  const u = unit ?? "";
  // A lowercase bare "m" is metres ("a 200 m del metro"), never millions.
  if (u === "m") return undefined;
  if (u === "M" || /^mill/i.test(u)) {
    const n = int + dec;
    return n < 1_000 ? Math.round(n * 1_000_000) : Math.round(n);
  }
  if (/^(?:k|mil)$/i.test(u)) {
    const n = int + dec;
    return n < 10_000 ? Math.round(n * 1_000) : Math.round(n);
  }
  return int;
}

interface MoneyMatch {
  amount: number;
  index: number;
  end: number;
  /** Bare number after a price keyword (no currency unit). */
  bare: boolean;
}

function matchMoney(text: string): MoneyMatch[] {
  const out: MoneyMatch[] = [];
  for (const m of text.matchAll(MONEY_RE)) {
    const [raw, prefix, whole, decimals, unit] = m;
    if (!prefix && !unit) continue;
    const amount = toAmount(whole ?? "", decimals, unit);
    if (amount === undefined || amount <= 0) continue;
    out.push({ amount, index: m.index, end: m.index + raw.length, bare: false });
  }
  for (const m of text.matchAll(BARE_PRICE_RE)) {
    const whole = m[1] ?? "";
    const numberIndex = m.index + m[0].lastIndexOf(whole);
    const overlaps = out.some((x) => numberIndex < x.end && numberIndex + whole.length > x.index);
    if (overlaps) continue;
    const amount = toAmount(whole, undefined, undefined);
    if (amount === undefined || amount < 1_000) continue;
    out.push({ amount, index: numberIndex, end: numberIndex + whole.length, bare: true });
  }
  return out.sort((a, b) => a.index - b.index);
}

const MIN_AMOUNT = 1_000;

/** All money amounts (≥ 1.000) written with a currency or magnitude unit, in text order. */
export function parseMoney(text: string): number[] {
  return matchMoney(text)
    .filter((m) => !m.bare && m.amount >= MIN_AMOUNT)
    .map((m) => m.amount);
}

type MoneyRole = "rent" | "sale" | "buy" | "other";

function classifyMoney(text: string, m: MoneyMatch): MoneyRole {
  const before = text.slice(Math.max(0, m.index - 30), m.index);
  const after = text.slice(m.end);
  if (RENT_AFTER_RE.test(after) || RENT_BEFORE_RE.test(before)) return "rent";
  if (SALE_BEFORE_RE.test(before)) return "sale";
  if (BUY_BEFORE_RE.test(before)) return "buy";
  return "other";
}

/**
 * Convert natural language into a structured research request. Deterministic:
 * no model is needed for the core intake, which keeps the WOW moment working
 * offline; the LLM (when configured) only enriches ambiguous cases.
 */
export function parseIntake(text: string): IntakeRequest {
  const raw = text.trim();
  const t = normalizeText(raw);
  const req: IntakeRequest = { intent: "unknown", rawText: raw, notes: [] };

  const cadastral =
    raw.match(CADASTRAL_FULL_RE)?.[0] ??
    (raw.match(CADASTRAL_RE)?.[0]?.length === 14 &&
    /[A-Z]/i.test(raw.match(CADASTRAL_RE)![0]) &&
    /\d/.test(raw.match(CADASTRAL_RE)![0])
      ? raw.match(CADASTRAL_RE)![0]
      : undefined);
  const url = raw.match(URL_RE)?.[0];
  const coord = raw.match(COORD_RE);
  const street = raw.match(STREET_RE)?.[0]?.trim();
  const moneyMatches = matchMoney(raw).map((m) => ({ ...m, role: classifyMoney(raw, m) }));
  const rent = moneyMatches.find((m) => m.role === "rent" && !m.bare);
  // Amounts (≥ 1.000, with a unit) that are not a rent: what the intent logic keys on.
  const money = moneyMatches
    .filter((m) => !m.bare && m.amount >= MIN_AMOUNT && m.role !== "rent")
    .map((m) => m.amount);
  const area = raw.match(AREA_RE);
  const months = raw.match(MONTHS_RE);
  const years = raw.match(YEARS_RE);
  const rooms = raw.match(ROOMS_RE);
  const baths = raw.match(BATH_RE);
  const floor = raw.match(FLOOR_RE);
  const roe = raw.match(ROE_RE);

  let typology: PropertyTypology | undefined;
  let assetUse: AssetUse | undefined;
  for (const [re, ty, use] of TYPOLOGY_KEYWORDS) {
    if (re.test(t)) {
      typology = ty;
      assetUse = use;
      break;
    }
  }

  const hasPropertyRef = Boolean(cadastral || url || coord || street);
  const mentionsCapital =
    /\btengo\b|\bdispongo\b|\bcapital\b|\bpresupuesto\b|\bquiero invertir\b|\binvertir\b/.test(t);
  const mentionsSearch =
    /\bencuentra\b|\bbusca\b|\bbuscar\b|\bbusco\b|\bnecesito\b|\bquiero\s+(?:un|una|comprar)\b|\boportunidad(?:es)?\b|\bque\s+puedo\s+comprar\b|\bradar\b/.test(
      t,
    );
  const mentionsOptimize = /\boptimiza\b|\bmejora\b|\bmejorar\b|\bhaz magia\b/.test(t);
  const mentionsWhatIf = /\bque pasa si\b|\by si\b|\bque pasaria\b|\bsi vendo\b|\bsi pago\b/.test(t);
  const isQuestion = /\?$/.test(raw) || /^(?:que|cual|cuanto|cuanta|como|por que|donde|hasta)\b/.test(t);

  if (mentionsWhatIf) req.intent = "what_if";
  // "Busco un local por 200.000 €" describes what to find, not an asset to analyse.
  else if (
    hasPropertyRef ||
    (typology && !mentionsSearch && (/\banaliza\b|\bestudia\b|\bvalora\b/.test(t) || money.length > 0))
  )
    req.intent = "analyze_property";
  else if (mentionsCapital || (money.length > 0 && mentionsSearch)) req.intent = "capital_available";
  else if (mentionsSearch) req.intent = "find_opportunity";
  else if (mentionsOptimize) req.intent = "optimize_investment";
  else if (isQuestion) req.intent = "question";
  else if (typology) req.intent = "analyze_property";

  if (hasPropertyRef || typology) {
    req.property = {
      address: street,
      cadastralRef: cadastral?.toUpperCase(),
      url,
      coordinates: coord ? { lat: Number(coord[1]), lng: Number(coord[2]) } : undefined,
      typology,
      assetUse,
      areaM2: area ? Number(area[1]) : undefined,
      bedrooms: rooms ? Number(rooms[1]) : undefined,
      bathrooms: baths ? Number(baths[1]) : undefined,
      floor: floor ? Number(floor[1] ?? floor[2] ?? floor[3]) : undefined,
      condition: /\bpara reformar\b|\ba reformar\b|\breformar\b/.test(t)
        ? "to_renovate"
        : /\breformado\b/.test(t)
          ? "renovated"
          : undefined,
    };
    if (!street && !cadastral && !url && !coord) {
      // Free text like "local de Triana": keep the neighbourhood hint as address.
      const zoneHint = raw.match(ZONE_HINT_RE)?.[1];
      if (zoneHint) req.property.address = zoneHint;
    }
  }

  if (rent) req.expectedRent = rent.amount;

  if (req.intent === "analyze_property") {
    // Purchase price: the first amount in a buying context ("por", "precio", "compra…"),
    // never a rent or a sale price ("vende a 340.000 €"); otherwise the largest remaining amount.
    const candidates = moneyMatches.filter(
      (m) => m.amount >= MIN_AMOUNT && m.role !== "rent" && m.role !== "sale",
    );
    const buy = candidates.find((m) => m.role === "buy");
    const withUnit = candidates.filter((m) => !m.bare).map((m) => m.amount);
    req.price = buy?.amount ?? (withUnit.length > 0 ? Math.max(...withUnit) : undefined);
  }

  if (req.intent === "capital_available" || req.intent === "find_opportunity" || mentionsCapital) {
    const investor: NonNullable<IntakeRequest["investor"]> = {};
    const capitalMatch = raw.match(
      /(?:tengo|dispongo de|capital de|capital)\s+(?:unos\s+)?(\d{1,3}(?:[.\s]\d{3})+|\d+)\s*(?:k|mil|€|eur|euros)?/i,
    );
    if (capitalMatch) investor.capital = parseMoney(capitalMatch[0])[0];
    const equityMatch = raw.match(
      /(?:aportar|aportación|aportacion|entrada|equity)\s+(?:máximo|maximo|de|hasta)?\s*(\d{1,3}(?:[.\s]\d{3})+|\d+)\s*(?:k|mil|€|eur|euros)?/i,
    );
    if (equityMatch) investor.maxEquity = parseMoney(equityMatch[0])[0];
    const profitMatch = raw.match(
      /(\d{1,3}(?:[.\s]\d{3})+|\d+)\s*(?:k|mil|€|eur|euros)?\s+de\s+(?:potencial|beneficio|margen)/i,
    );
    if (profitMatch) investor.targetProfit = parseMoney(profitMatch[0])[0];
    if (!investor.capital && money.length > 0) investor.capital = Math.max(...money);
    if (months) investor.horizonMonths = Number(months[1]);
    else if (years) investor.horizonMonths = Number(years[1]) * 12;
    if (roe) investor.targetRoe = Number(roe[1]) / 100;
    req.investor = investor;
  }

  if (req.intent === "what_if" && months) req.notes.push(`months:${months[1]}`);
  return req;
}
