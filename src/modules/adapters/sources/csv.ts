import type { PropertyTypology } from "@/modules/property/types";
import type { OpportunityListing } from "./types";

/**
 * One listing as an organisation supplies it (CSV row or API item). The
 * server resolves the microzone (id, point or address) and stamps ids,
 * source and price history; nothing here is synthetic.
 */
export interface OwnListingInput {
  title?: string;
  address: string;
  askingPrice: number;
  builtAreaM2: number;
  assetUse: OpportunityListing["assetUse"];
  typology: PropertyTypology;
  condition: OpportunityListing["condition"];
  bedrooms?: number;
  bathrooms?: number;
  floor?: number;
  elevator?: boolean;
  microzoneId?: string;
  lat?: number;
  lng?: number;
  /** ISO date the listing was published; defaults to the import date. */
  publishedAt?: string;
  reference?: string;
}

const USES = new Set<OpportunityListing["assetUse"]>([
  "residential",
  "commercial",
  "office",
  "industrial",
  "land",
  "other",
]);
const TYPOLOGIES = new Set<PropertyTypology>([
  "flat",
  "ground_floor_flat",
  "penthouse",
  "house",
  "premises",
  "office",
  "building",
  "plot",
  "warehouse",
  "garage",
  "other",
]);

/** Spanish and English spellings accepted in the `asset_use` column. */
const USE_ALIASES: Record<string, OpportunityListing["assetUse"]> = {
  residencial: "residential",
  vivienda: "residential",
  comercial: "commercial",
  local: "commercial",
  oficina: "office",
  oficinas: "office",
  industrial: "industrial",
  nave: "industrial",
  suelo: "land",
  solar: "land",
  otro: "other",
};

const TYPOLOGY_ALIASES: Record<string, PropertyTypology> = {
  piso: "flat",
  bajo: "ground_floor_flat",
  atico: "penthouse",
  ático: "penthouse",
  casa: "house",
  chalet: "house",
  local: "premises",
  oficina: "office",
  edificio: "building",
  solar: "plot",
  parcela: "plot",
  nave: "warehouse",
  garaje: "garage",
  otro: "other",
};

const CONDITION_ALIASES: Record<string, OpportunityListing["condition"]> = {
  to_renovate: "to_renovate",
  "para reformar": "to_renovate",
  "a reformar": "to_renovate",
  reformar: "to_renovate",
  good: "good",
  bueno: "good",
  "buen estado": "good",
  renovated: "renovated",
  reformado: "renovated",
  unknown: "unknown",
  desconocido: "unknown",
};

/** Typology implied by a use when the column is empty. */
export function defaultTypologyFor(use: OpportunityListing["assetUse"]): PropertyTypology {
  switch (use) {
    case "residential":
      return "flat";
    case "commercial":
      return "premises";
    case "office":
      return "office";
    case "industrial":
      return "warehouse";
    case "land":
      return "plot";
    default:
      return "other";
  }
}

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === sep && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Accepts "245000", "245.000", "245.000,50", "92,5" and "1 250 €". */
function num(v: string | undefined): number | undefined {
  if (v === undefined || v === "") return undefined;
  let s = v.replace(/[^\d.,-]/g, "");
  if (s.includes(".") && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return s !== "" && Number.isFinite(n) ? n : undefined;
}

function coord(v: string | undefined): number | undefined {
  if (v === undefined || v === "") return undefined;
  const n = Number(v.replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function bool(v: string | undefined): boolean | undefined {
  if (v === undefined || v === "") return undefined;
  const s = v.toLowerCase();
  return ["1", "true", "sí", "si", "yes", "s", "y"].includes(s)
    ? true
    : ["0", "false", "no", "n"].includes(s)
      ? false
      : undefined;
}

/**
 * Parses a CSV of own listings (a partner feed export, a network's sheet, a
 * manual list). Header names are case-insensitive, Spanish or English;
 * separator `;` or `,` is detected from the header. Errors name the line and
 * nothing is imported when any line fails. Microzones are resolved by the
 * server from `microzone_id`, `lat`/`lng` or the address text.
 */
export function parseListingsCsv(text: string): { listings: OwnListingInput[]; errors: string[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  const errors: string[] = [];
  if (!lines.length) return { listings: [], errors: ["CSV vacío"] };
  const header = lines[0]!;
  const sep = (header.match(/;/g)?.length ?? 0) >= (header.match(/,/g)?.length ?? 0) ? ";" : ",";
  const cols = splitLine(header, sep).map((c) =>
    c.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s-]/g, "_"),
  );
  const idx = (...names: string[]) => cols.findIndex((c) => names.includes(c));
  const at = (cells: string[], ...names: string[]) => {
    const i = idx(...names);
    return i >= 0 ? cells[i] : undefined;
  };
  const listings: OwnListingInput[] = [];
  lines.slice(1).forEach((line, n) => {
    const cells = splitLine(line, sep);
    const row = n + 2;
    const address = at(cells, "address", "direccion") ?? "";
    const askingPrice = num(at(cells, "price", "precio", "asking_price"));
    const builtAreaM2 = num(at(cells, "area_m2", "aream2", "m2", "superficie"));
    const useRaw = (at(cells, "asset_use", "assetuse", "uso") ?? "residential").toLowerCase();
    const assetUse = (USE_ALIASES[useRaw] ?? useRaw) as OpportunityListing["assetUse"];
    const typRaw = (at(cells, "typology", "tipologia", "tipo") ?? "").toLowerCase();
    const typology = (
      typRaw ? (TYPOLOGY_ALIASES[typRaw] ?? typRaw) : defaultTypologyFor(assetUse)
    ) as PropertyTypology;
    const condRaw = (at(cells, "condition", "estado") ?? "unknown").toLowerCase();
    const condition = CONDITION_ALIASES[condRaw];
    const lat = coord(at(cells, "lat", "latitud"));
    const lng = coord(at(cells, "lng", "lon", "longitud"));
    const publishedAt = at(cells, "published_at", "fecha", "date") || undefined;
    const problems: string[] = [];
    if (address.length < 4) problems.push("address");
    if (!askingPrice || askingPrice <= 0) problems.push("price");
    if (!builtAreaM2 || builtAreaM2 <= 0) problems.push("area_m2");
    if (!USES.has(assetUse)) problems.push(`asset_use "${useRaw}"`);
    if (!TYPOLOGIES.has(typology)) problems.push(`typology "${typRaw}"`);
    if (!condition) problems.push(`condition "${condRaw}"`);
    if (lat !== undefined && Math.abs(lat) > 90) problems.push("lat");
    if (lng !== undefined && Math.abs(lng) > 180) problems.push("lng");
    if ((lat === undefined) !== (lng === undefined)) problems.push("lat/lng (ambos o ninguno)");
    if (publishedAt && !/^\d{4}-\d{2}-\d{2}$/.test(publishedAt))
      problems.push(`published_at "${publishedAt}" (YYYY-MM-DD)`);
    if (problems.length) {
      errors.push(`línea ${row}: ${problems.join(", ")}`);
      return;
    }
    const bedrooms = num(at(cells, "bedrooms", "habitaciones", "dormitorios"));
    const bathrooms = num(at(cells, "bathrooms", "banos", "baños"));
    const floor = num(at(cells, "floor", "planta"));
    listings.push({
      title: at(cells, "title", "titulo") || undefined,
      address,
      askingPrice: askingPrice!,
      builtAreaM2: builtAreaM2!,
      assetUse,
      typology,
      condition: condition!,
      bedrooms: bedrooms === undefined ? undefined : Math.round(bedrooms),
      bathrooms: bathrooms === undefined ? undefined : Math.round(bathrooms),
      floor: floor === undefined ? undefined : Math.round(floor),
      elevator: bool(at(cells, "elevator", "ascensor")),
      microzoneId: at(cells, "microzone_id", "microzona") || undefined,
      lat,
      lng,
      publishedAt,
      reference: at(cells, "reference", "referencia") || undefined,
    });
  });
  return { listings, errors };
}
