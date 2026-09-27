import type { OwnComparable } from "./types";

export type CsvComparable = Omit<OwnComparable, "id" | "point"> & { lat: number; lng: number };

const KINDS = new Set(["sale", "rent"]);
const TYPES = new Set(["transaction", "verified", "professional", "internal", "manual", "partner"]);
const CONDITIONS = new Set(["renovated", "unrenovated", "new", "unknown"]);
const USES = new Set(["residential", "commercial", "office", "other"]);

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

/** Accepts "245000", "245.000", "245.000,50", "92,5", "37.3826" and "1 250 €". */
function num(v: string | undefined): number | undefined {
  if (v === undefined || v === "") return undefined;
  let s = v.replace(/[^\d.,-]/g, "");
  if (s.includes(".") && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return s !== "" && Number.isFinite(n) ? n : undefined;
}

/** Coordinates never carry thousands separators: "37.383" and "37,383" are both 37.383. */
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
 * Parses a CSV of own comparables. Header names are case-insensitive and
 * accept `area_m2` / `areaM2` / `m2`; separator `;` or `,` is detected from
 * the header. Errors name the line; nothing is imported when any line fails.
 */
export function parseComparablesCsv(text: string): { comparables: CsvComparable[]; errors: string[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  const errors: string[] = [];
  if (!lines.length) return { comparables: [], errors: ["CSV vacío"] };
  const header = lines[0]!;
  const sep = (header.match(/;/g)?.length ?? 0) >= (header.match(/,/g)?.length ?? 0) ? ";" : ",";
  const cols = splitLine(header, sep).map((c) => c.toLowerCase().replace(/[\s-]/g, "_"));
  const idx = (...names: string[]) => cols.findIndex((c) => names.includes(c));
  const at = (cells: string[], ...names: string[]) => {
    const i = idx(...names);
    return i >= 0 ? cells[i] : undefined;
  };
  const comparables: CsvComparable[] = [];
  lines.slice(1).forEach((line, n) => {
    const cells = splitLine(line, sep);
    const row = n + 2;
    const kind = (at(cells, "kind", "tipo_operacion", "operacion") ?? "sale").toLowerCase();
    const type = (at(cells, "type", "tipo") ?? "transaction").toLowerCase();
    const price = num(at(cells, "price", "precio", "renta"));
    const areaM2 = num(at(cells, "area_m2", "aream2", "m2", "superficie"));
    const date = at(cells, "date", "fecha") ?? "";
    const lat = coord(at(cells, "lat", "latitud"));
    const lng = coord(at(cells, "lng", "lon", "longitud"));
    const condition = (at(cells, "condition", "estado") ?? "unknown").toLowerCase();
    const assetUse = (at(cells, "asset_use", "assetuse", "uso") ?? "residential").toLowerCase();
    const problems: string[] = [];
    if (!KINDS.has(kind)) problems.push(`kind "${kind}"`);
    if (!TYPES.has(type)) problems.push(`type "${type}"`);
    if (!price || price <= 0) problems.push("price");
    if (!areaM2 || areaM2 <= 0) problems.push("area_m2");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) problems.push(`date "${date}" (YYYY-MM-DD)`);
    if (lat === undefined || Math.abs(lat) > 90) problems.push("lat");
    if (lng === undefined || Math.abs(lng) > 180) problems.push("lng");
    if (!CONDITIONS.has(condition)) problems.push(`condition "${condition}"`);
    if (!USES.has(assetUse)) problems.push(`asset_use "${assetUse}"`);
    if (problems.length) {
      errors.push(`línea ${row}: ${problems.join(", ")}`);
      return;
    }
    const floor = num(at(cells, "floor", "planta"));
    comparables.push({
      kind: kind as CsvComparable["kind"],
      type: type as CsvComparable["type"],
      price: price!,
      areaM2: areaM2!,
      date,
      lat: lat!,
      lng: lng!,
      condition: condition as CsvComparable["condition"],
      assetUse: assetUse as CsvComparable["assetUse"],
      floor: floor === undefined ? undefined : Math.round(floor),
      elevator: bool(at(cells, "elevator", "ascensor")),
      exterior: bool(at(cells, "exterior")),
      label: at(cells, "label", "etiqueta", "direccion") || undefined,
      reference: at(cells, "reference", "referencia") || undefined,
      note: at(cells, "note", "nota") || undefined,
    });
  });
  return { comparables, errors };
}
