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
const MONEY_RE = /(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:[,.](\d{1,2}))?\s*(?:k(?![a-z])|mil\b|€|eur\b|euros?\b)/gi;
const AREA_RE = /(\d{2,4})\s*(?:m2|m²|metros)/i;
const MONTHS_RE = /(\d{1,2})\s*(?:meses|mes)\b/i;
const YEARS_RE = /(\d{1,2})\s*(?:años|año)\b/i;
const ROOMS_RE = /(\d)\s*(?:habitaciones|hab\b|dormitorios)/i;
const BATH_RE = /(\d)\s*(?:baños|baño)/i;
const FLOOR_RE = /\b(\d)\s*[ºo°ª](?:\s*(?:planta|piso))?|\b(\d)\s*(?:planta|piso)\b|\bplanta\s+(\d)\b/i;
const ROE_RE = /(\d{1,2})\s*%\s*(?:de\s+)?(?:roe|rentabilidad|retorno)/i;
const STREET_RE = /\b(?:calle|c\/|avenida|avda\.?|av\.?|plaza|pza\.?|paseo|ronda|travesía|travesia|camino|carretera|glorieta|barriada|bda\.?)\s+[^,.;\d]{2,60}(?:,?\s*(?:n[ºo°.]?\s*)?\d{1,4}(?:\s*[a-z]\b)?)?/i;

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

export function parseMoney(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(MONEY_RE)) {
    const whole = (m[1] ?? "").replace(/[.\s]/g, "");
    let n = Number(whole);
    if (!Number.isFinite(n)) continue;
    const suffix = m[0].toLowerCase();
    if (/\d\s*k$|mil$/.test(suffix.replace(/\s+$/, "")) && n < 10_000) n *= 1_000;
    if (n >= 1_000) out.push(n);
  }
  return out;
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

  const cadastral = raw.match(CADASTRAL_FULL_RE)?.[0] ?? (raw.match(CADASTRAL_RE)?.[0]?.length === 14 && /[A-Z]/i.test(raw.match(CADASTRAL_RE)![0]) && /\d/.test(raw.match(CADASTRAL_RE)![0]) ? raw.match(CADASTRAL_RE)![0] : undefined);
  const url = raw.match(URL_RE)?.[0];
  const coord = raw.match(COORD_RE);
  const street = raw.match(STREET_RE)?.[0]?.trim();
  const money = parseMoney(raw);
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
  const mentionsCapital = /\btengo\b|\bdispongo\b|\bcapital\b|\bpresupuesto\b|\bquiero invertir\b|\binvertir\b/.test(t);
  const mentionsSearch = /\bencuentra\b|\bbusca\b|\bbuscar\b|\boportunidad(?:es)?\b|\bque\s+puedo\s+comprar\b|\bradar\b/.test(t);
  const mentionsOptimize = /\boptimiza\b|\bmejora\b|\bmejorar\b|\bhaz magia\b/.test(t);
  const mentionsWhatIf = /\bque pasa si\b|\by si\b|\bque pasaria\b|\bsi vendo\b|\bsi pago\b/.test(t);
  const isQuestion = /\?$/.test(raw) || /^(?:que|cual|cuanto|cuanta|como|por que|donde|hasta)\b/.test(t);

  if (mentionsWhatIf) req.intent = "what_if";
  else if (hasPropertyRef || (typology && (/\banaliza\b|\bestudia\b|\bvalora\b/.test(t) || money.length > 0))) req.intent = "analyze_property";
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
      condition: /\bpara reformar\b|\ba reformar\b|\breformar\b/.test(t) ? "to_renovate" : /\breformado\b/.test(t) ? "renovated" : undefined,
    };
    if (!street && !cadastral && !url && !coord) {
      // Free text like "local de Triana": keep the neighbourhood hint as address.
      const zoneHint = raw.match(/\b(?:en|de)\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)*)/)?.[1];
      if (zoneHint) req.property.address = zoneHint;
    }
  }

  if (req.intent === "analyze_property") {
    const priceMatch = raw.match(/(?:por|precio|piden|a)\s+(\d{1,3}(?:[.\s]\d{3})+|\d+)\s*(?:k|mil|€|eur|euros)?/i);
    if (priceMatch) {
      const p = parseMoney(priceMatch[0]);
      req.price = p[0] ?? undefined;
    }
    if (!req.price && money.length > 0) req.price = Math.max(...money);
  }

  if (req.intent === "capital_available" || req.intent === "find_opportunity" || mentionsCapital) {
    const investor: NonNullable<IntakeRequest["investor"]> = {};
    const capitalMatch = raw.match(/(?:tengo|dispongo de|capital de|capital)\s+(?:unos\s+)?(\d{1,3}(?:[.\s]\d{3})+|\d+)\s*(?:k|mil|€|eur|euros)?/i);
    if (capitalMatch) investor.capital = parseMoney(capitalMatch[0])[0];
    const equityMatch = raw.match(/(?:aportar|aportación|aportacion|entrada|equity)\s+(?:máximo|maximo|de|hasta)?\s*(\d{1,3}(?:[.\s]\d{3})+|\d+)\s*(?:k|mil|€|eur|euros)?/i);
    if (equityMatch) investor.maxEquity = parseMoney(equityMatch[0])[0];
    const profitMatch = raw.match(/(\d{1,3}(?:[.\s]\d{3})+|\d+)\s*(?:k|mil|€|eur|euros)?\s+de\s+(?:potencial|beneficio|margen)/i);
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
