import { err, ok, appError } from "@/modules/core/result";
import { logger } from "@/modules/core/logger";
import type { EvidenceStatus } from "@/modules/core/evidence-status";
import type { AssetUse } from "@/modules/engines/financial/types";
import type { NewEvidence } from "@/modules/evidence/store";
import type { AdapterResponse, DataSourceAdapter } from "../types";
import { CATASTRO_USE_LABELS, type CatastroParcelInfo, type CatastroQuery, type CatastroUnit } from "./types";

const OVC_BASE = "https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero";
const TIMEOUT_MS = 8_000;

/**
 * Public Catastro adapter using the free OVC web services (Sede Electrónica del
 * Catastro, "servicios web libres"). Only non-protected data is requested:
 * cadastral reference, address, built area, use and year. Cadastral values are
 * protected and are never requested here.
 */
export class CatastroPublicAdapter implements DataSourceAdapter<CatastroQuery, CatastroParcelInfo> {
  sourceId = "catastro";
  sourceType = "official_registry" as const;
  sourceName = "Sede Electrónica del Catastro (OVC)";
  sourceAuthority = "Dirección General del Catastro";
  mode = "public" as const;

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async isAvailable() {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3_000);
      const res = await this.fetchImpl(`${OVC_BASE}/COVCCallejero.svc/json/ObtenerProvincias`, {
        signal: ctrl.signal,
      });
      clearTimeout(t);
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Parcel centroid from the free coordinates service; undefined when it fails (never throws). */
  async coordinatesFor(
    cadastralRef: string,
    province: string,
    municipality: string,
  ): Promise<{ lat: number; lng: number } | undefined> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const res = await this.fetchImpl(buildCoordinatesUrl(cadastralRef, province, municipality), {
        signal: ctrl.signal,
        headers: { accept: "application/json" },
      });
      clearTimeout(t);
      if (!res.ok) return undefined;
      return parseCoordinates((await res.json()) as unknown);
    } catch (e) {
      logger.warn("catastro.public.coordinates_failed", {
        error: e instanceof Error ? e.message : String(e),
      });
      return undefined;
    }
  }

  /**
   * `ObtenerNumerero` lists the numbers the cadastre knows around the requested
   * one on that street; the closest parcel is then read by cadastral reference.
   */
  async nearestNumber(
    input: Extract<CatastroQuery, { kind: "address" }>,
  ): Promise<{ number: string; parsed: CatastroParcelInfo } | undefined> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const res = await this.fetchImpl(buildNumereroUrl(input), {
        signal: ctrl.signal,
        headers: { accept: "application/json" },
      });
      clearTimeout(t);
      if (!res.ok) return undefined;
      const candidates = parseNumerero((await res.json()) as unknown);
      const wanted = Number(input.number.replace(/\D/g, ""));
      const best = candidates
        .filter((c) => Number.isFinite(c.number))
        .sort((a, b) => Math.abs(a.number - wanted) - Math.abs(b.number - wanted))[0];
      if (!best || Math.abs(best.number - wanted) > MAX_NUMBER_DISTANCE) return undefined;
      const byRc = await this.fetchParsed({
        kind: "cadastralRef",
        cadastralRef: best.cadastralRef,
        province: input.province,
        municipality: input.municipality,
      });
      return byRc ? { number: String(best.number), parsed: byRc } : undefined;
    } catch (e) {
      logger.warn("catastro.public.numerero_failed", { error: e instanceof Error ? e.message : String(e) });
      return undefined;
    }
  }

  private async fetchParsed(q: CatastroQuery): Promise<CatastroParcelInfo | null> {
    const url = buildUrl(q);
    if (!url) return null;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await this.fetchImpl(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
      if (!res.ok) return null;
      return parseOvc((await res.json()) as unknown, q);
    } finally {
      clearTimeout(t);
    }
  }

  async query(input: CatastroQuery) {
    const url = buildUrl(input);
    if (!url)
      return err(
        appError("UNSUPPORTED_QUERY", "Consulta no soportada por el servicio público del Catastro."),
      );
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const res = await this.fetchImpl(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
      clearTimeout(t);
      if (!res.ok)
        return err(
          appError("SOURCE_HTTP_ERROR", `Catastro respondió ${res.status}.`, { status: res.status }),
        );
      const json = (await res.json()) as unknown;
      let parsed = parseOvc(json, input);
      const notes: string[] = [];
      if (!parsed) {
        const ovc = ovcError(json);
        // Street number not in the cadastre: use the closest existing number, clearly flagged.
        if (ovc?.code === OVC_NUMBER_NOT_FOUND && input.kind === "address") {
          const nearest = await this.nearestNumber(input);
          if (nearest) {
            parsed = nearest.parsed;
            notes.push(
              `El número ${input.number} no consta en el Catastro; se usa el ${nearest.number} (parcela más próxima). Verificar la referencia catastral.`,
            );
          }
        }
        if (!parsed)
          return err(
            appError(
              ovc ? "SOURCE_ERROR" : "SOURCE_EMPTY",
              ovc
                ? `Catastro: ${ovc.message} (código ${ovc.code}).`
                : "El Catastro no devolvió inmuebles para esta consulta.",
              ovc ? { ovcCode: ovc.code } : undefined,
            ),
          );
      }
      if (!parsed.coordinates && parsed.cadastralRef) {
        // Free geolocation of the parcel: lets the planning connector query the geoservices.
        parsed.coordinates = await this.coordinatesFor(
          parsed.cadastralRef,
          parsed.province,
          parsed.municipality,
        );
      }
      const retrievedAt = new Date().toISOString();
      const quality = assessParsedQuality(parsed);
      if (notes.length) {
        quality.status = "INFERRED";
        quality.notes.unshift(...notes);
      }
      const evidence: NewEvidence[] = [
        {
          sourceType: "official_registry",
          sourceId: this.sourceId,
          sourceName: this.sourceName,
          sourceAuthority: this.sourceAuthority,
          sourceUrl: url,
          retrievedAt,
          geographicScope: { level: "parcel", code: parsed.cadastralRef, label: parsed.address },
          excerpt: `Catastro: ${parsed.address} — ${parsed.builtAreaM2 ?? "?"} m², uso ${parsed.useLabel ?? "?"}, año ${parsed.yearBuilt ?? "?"}.${quality.notes.length ? ` ${quality.notes.join(" ")}` : ""}`,
          structuredData: {
            cadastralRef: parsed.cadastralRef,
            coordinates: parsed.coordinates,
            builtAreaM2: parsed.builtAreaM2,
            yearBuilt: parsed.yearBuilt,
            useCode: parsed.useCode,
            assetUse: catastroUseToAssetUse(parsed.useCode),
            notes: quality.notes,
          },
          confidence: quality.status === "VERIFIED" ? 0.9 : 0.6,
          verificationStatus: quality.status,
          demo: false,
        },
      ];
      const response: AdapterResponse<CatastroParcelInfo> = {
        data: parsed,
        evidence,
        retrievedAt,
        mode: "public",
      };
      return ok(response);
    } catch (e) {
      logger.warn("catastro.public.query_failed", { error: e instanceof Error ? e.message : String(e) });
      return err(
        appError(
          "SOURCE_UNAVAILABLE",
          "No hemos podido consultar el Catastro en este momento.",
          undefined,
          e,
        ),
      );
    }
  }
}

/** OVC error code for "EL NUMERO NO EXISTE". */
export const OVC_NUMBER_NOT_FOUND = "43";
/** How far (in street numbers) the nearest-number fallback may go. */
const MAX_NUMBER_DISTANCE = 6;

/** Structured error envelope of the OVC JSON services (`control.cuerr` + `lerr[]`). */
export function ovcError(json: unknown): { code: string; message: string } | undefined {
  const root = (get(json, "consulta_dnprcResult") ??
    get(json, "consulta_dnplocResult") ??
    get(json, "Consulta_RCCOORResult") ??
    get(json, "Consulta_CPMRCResult") ??
    get(json, "consulta_numereroResult") ??
    json) as Obj;
  const cuerr = num(get(root, "control", "cuerr"));
  if (!cuerr) return undefined;
  const list = get(root, "lerr") as unknown;
  const first = Array.isArray(list) ? list[0] : list;
  return { code: str(get(first, "cod")) ?? "?", message: str(get(first, "des")) ?? "error del Catastro" };
}

export function buildNumereroUrl(q: Extract<CatastroQuery, { kind: "address" }>): string {
  const p = new URLSearchParams();
  p.set("Provincia", q.province);
  p.set("Municipio", q.municipality);
  p.set("TipoVia", q.streetType ?? "CL");
  p.set("NomVia", q.street);
  p.set("Numero", q.number);
  return `${OVC_BASE}/COVCCallejero.svc/json/ObtenerNumerero?${p.toString()}`;
}

/** Parse `ObtenerNumerero`: `nump[]` entries with `num.pnp` and `pc.pc1/pc2`. */
export function parseNumerero(json: unknown): Array<{ number: number; cadastralRef: string }> {
  const root = (get(json, "consulta_numereroResult") ?? json) as Obj;
  const raw = get(root, "nump") as unknown;
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? ((get(raw, "nump") as unknown[]) ?? [raw])
      : [];
  return (Array.isArray(list) ? list : [])
    .map((item) => {
      const number = num(get(item, "num", "pnp"));
      const rc = `${str(get(item, "pc", "pc1")) ?? ""}${str(get(item, "pc", "pc2")) ?? ""}`;
      return number !== undefined && rc.length >= 14 ? { number, cadastralRef: rc } : null;
    })
    .filter((x): x is { number: number; cadastralRef: string } => x !== null);
}

export function buildCoordinatesUrl(cadastralRef: string, province: string, municipality: string): string {
  const p = new URLSearchParams();
  p.set("Provincia", province);
  p.set("Municipio", municipality);
  p.set("SRS", "EPSG:4326");
  p.set("RC", cadastralRef.slice(0, 14).toUpperCase());
  return `${OVC_BASE}/COVCCoordenadas.svc/json/Consulta_CPMRC?${p.toString()}`;
}

/** Parse `Consulta_CPMRC`: `coordenadas.coord[0].geo.{xcen,ycen}` in the requested SRS (lon/lat for EPSG:4326). */
export function parseCoordinates(json: unknown): { lat: number; lng: number } | undefined {
  const root = (get(json, "Consulta_CPMRCResult") ?? get(json, "consulta_coordenadasResult") ?? json) as Obj;
  const list = get(root, "coordenadas", "coord") as unknown;
  const coord = Array.isArray(list) ? list[0] : list;
  const lng = num(get(coord, "geo", "xcen"));
  const lat = num(get(coord, "geo", "ycen"));
  if (lng === undefined || lat === undefined) return undefined;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  return { lat, lng };
}

export function buildUrl(q: CatastroQuery): string | null {
  const p = new URLSearchParams();
  if (q.kind === "cadastralRef") {
    p.set("Provincia", q.province ?? "");
    p.set("Municipio", q.municipality ?? "");
    p.set("RC", q.cadastralRef);
    return `${OVC_BASE}/COVCCallejero.svc/json/Consulta_DNPRC?${p.toString()}`;
  }
  if (q.kind === "address") {
    p.set("Provincia", q.province);
    p.set("Municipio", q.municipality);
    p.set("TipoVia", q.streetType ?? "CL");
    p.set("NombreVia", q.street);
    p.set("Numero", q.number);
    return `${OVC_BASE}/COVCCallejero.svc/json/Consulta_DNPLOC?${p.toString()}`;
  }
  if (q.kind === "point") {
    p.set("SRS", "EPSG:4326");
    p.set("Coordenada_X", String(q.point.lng));
    p.set("Coordenada_Y", String(q.point.lat));
    return `${OVC_BASE}/COVCCoordenadas.svc/json/Consulta_RCCOOR?${p.toString()}`;
  }
  return null;
}

type Obj = Record<string, unknown>;
const get = (o: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Obj)[k] : undefined), o);
const str = (v: unknown) =>
  typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : undefined;
const num = (v: unknown) => {
  const n = Number(str(v));
  return Number.isFinite(n) ? n : undefined;
};

/** Parse the OVC JSON. Defensive: the structure differs slightly between endpoints. */
export function parseOvc(json: unknown, q: CatastroQuery): CatastroParcelInfo | null {
  const root = (get(json, "consulta_dnprcResult") ??
    get(json, "consulta_dnplocResult") ??
    get(json, "Consulta_RCCOORResult") ??
    json) as Obj;
  const bico = get(root, "bico");
  const list = (get(bico, "bi") ??
    get(root, "lrcdnp", "rcdnp") ??
    get(root, "coordenadas", "coord")) as unknown;
  const items = Array.isArray(list) ? list : list ? [list] : [];
  if (items.length === 0) return null;
  const units: CatastroUnit[] = items.map((bi) => {
    const rc = get(bi, "idbi", "rc") ?? get(bi, "rc") ?? get(bi, "pc");
    const ref = ["pc1", "pc2", "car", "cc1", "cc2"].map((k) => str(get(rc, k)) ?? "").join("");
    const dir = get(bi, "dt", "locs", "lous", "lourb", "dir") ?? get(bi, "dt", "locs", "lous", "lourb");
    const address =
      [str(get(dir, "tv")), str(get(dir, "nv")), str(get(dir, "pnp"))].filter(Boolean).join(" ") ||
      str(get(bi, "ldt")) ||
      "";
    const loint = get(bi, "dt", "locs", "lous", "lourb", "loint");
    const luso = str(get(bi, "debi", "luso"));
    const useCode = resolveCatastroUseCode(luso);
    return {
      cadastralRef: ref,
      address,
      useCode,
      useLabel: (useCode && CATASTRO_USE_LABELS[useCode]) || luso || "",
      builtAreaM2: num(get(bi, "debi", "sfc")) ?? 0,
      yearBuilt: num(get(bi, "debi", "ant")),
      floor: str(get(loint, "pt")),
      door: str(get(loint, "pu")),
    };
  });
  const first = units[0]!;
  return {
    cadastralRef: q.kind === "cadastralRef" ? q.cadastralRef.toUpperCase() : first.cadastralRef,
    address: first.address,
    municipality:
      str(get(root, "bico", "bi", "dt", "nm")) ?? (q.kind === "address" ? q.municipality : "SEVILLA"),
    province: str(get(root, "bico", "bi", "dt", "np")) ?? "SEVILLA",
    coordinates: q.kind === "point" ? q.point : undefined,
    builtAreaM2: first.builtAreaM2 || undefined,
    yearBuilt: first.yearBuilt,
    useCode: first.useCode || undefined,
    useLabel: first.useLabel || undefined,
    units,
    cadastralValue: null,
    landValue: null,
    accessLevel: "public",
  };
}

/**
 * Quality of a public record. The OVC free services sometimes omit the built
 * area (`sfc`) or return a use label we cannot map; in that case the record is
 * still useful but must not be presented as fully verified.
 */
export function assessParsedQuality(parsed: CatastroParcelInfo): { status: EvidenceStatus; notes: string[] } {
  const notes: string[] = [];
  if (!parsed.builtAreaM2 || parsed.builtAreaM2 <= 0)
    notes.push("Superficie construida no informada por el Catastro; se estimará por otras vías.");
  if (!parsed.useCode)
    notes.push(
      parsed.useLabel
        ? `Uso catastral "${parsed.useLabel}" no reconocido; requiere revisión.`
        : "Uso catastral no informado por el Catastro.",
    );
  return { status: notes.length ? "INFERRED" : "VERIFIED", notes };
}

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Label patterns (accent/case-insensitive) → canonical Catastro use code. In the
 * OVC JSON `luso` is a descriptive label ("Residencial", "Almacén-Estacionamiento"…),
 * not the single-letter code used in the cadastral reference/cartography, so we
 * normalise both forms to the code that `CATASTRO_USE_LABELS` and the specialists use.
 */
const USE_LABEL_PATTERNS: Array<[RegExp, string]> = [
  [/\bresidencial\b|\bvivienda/, "V"],
  [/\bcomercial\b|\bcomercio\b/, "C"],
  [/\boficinas?\b/, "O"],
  [/\bindustrial\b/, "I"],
  [/\balmacen|\bestacionamiento\b|\baparcamiento\b|\bgaraje\b/, "A"],
  [/\breligioso\b/, "R"],
  [/\bocio\b|\bhosteleria\b/, "G"],
  [/\bdeportivo\b/, "K"],
  [/\bcultural\b/, "E"],
  [/\bsingular\b/, "P"],
  [/\bespectaculos?\b/, "T"],
  [/\bsanidad\b|\bbeneficencia\b/, "Y"],
  [/\bsuelos? sin edif|\bsolar(?:es)?\b|\burbanizacion\b|\bjardineria\b/, "M"],
  [/\bagrario\b|\bagricola\b|\brustico\b/, "Z"],
];

/**
 * Resolve the OVC `luso` value to a canonical single-letter use code. Accepts
 * the descriptive label returned by the JSON services and, as a fallback, a
 * bare single-letter code. Returns "" when the value cannot be mapped.
 */
export function resolveCatastroUseCode(luso: string | undefined): string {
  if (!luso) return "";
  const raw = luso.trim();
  if (raw.length === 1) {
    const code = raw.toUpperCase();
    return code in CATASTRO_USE_LABELS ? code : "";
  }
  const label = strip(raw);
  for (const [re, code] of USE_LABEL_PATTERNS) if (re.test(label)) return code;
  return "";
}

const USE_CODE_TO_ASSET_USE: Record<string, AssetUse> = {
  V: "residential",
  C: "commercial",
  O: "office",
  I: "industrial",
  M: "land",
  Z: "land",
  A: "other",
  R: "other",
  G: "other",
  K: "other",
  E: "other",
  P: "other",
  T: "other",
  Y: "other",
};

/** Map a canonical Catastro use code to the engine's `AssetUse`; undefined when unknown. */
export function catastroUseToAssetUse(useCode: string | undefined): AssetUse | undefined {
  if (!useCode) return undefined;
  return USE_CODE_TO_ASSET_USE[useCode.toUpperCase()];
}
