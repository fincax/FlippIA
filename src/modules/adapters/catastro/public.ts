import { err, ok, appError } from "@/modules/core/result";
import { logger } from "@/modules/core/logger";
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
      const res = await this.fetchImpl(`${OVC_BASE}/COVCCallejero.svc/json/ObtenerProvincias`, { signal: ctrl.signal });
      clearTimeout(t);
      return res.ok;
    } catch {
      return false;
    }
  }

  async query(input: CatastroQuery) {
    const url = buildUrl(input);
    if (!url) return err(appError("UNSUPPORTED_QUERY", "Consulta no soportada por el servicio público del Catastro."));
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const res = await this.fetchImpl(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
      clearTimeout(t);
      if (!res.ok) return err(appError("SOURCE_HTTP_ERROR", `Catastro respondió ${res.status}.`, { status: res.status }));
      const json = (await res.json()) as unknown;
      const parsed = parseOvc(json, input);
      if (!parsed) return err(appError("SOURCE_EMPTY", "El Catastro no devolvió inmuebles para esta consulta."));
      const retrievedAt = new Date().toISOString();
      const evidence: NewEvidence[] = [
        {
          sourceType: "official_registry",
          sourceId: this.sourceId,
          sourceName: this.sourceName,
          sourceAuthority: this.sourceAuthority,
          sourceUrl: url,
          retrievedAt,
          geographicScope: { level: "parcel", code: parsed.cadastralRef, label: parsed.address },
          excerpt: `Catastro: ${parsed.address} — ${parsed.builtAreaM2 ?? "?"} m², uso ${parsed.useLabel ?? "?"}, año ${parsed.yearBuilt ?? "?"}.`,
          structuredData: { cadastralRef: parsed.cadastralRef, builtAreaM2: parsed.builtAreaM2, yearBuilt: parsed.yearBuilt, useCode: parsed.useCode },
          confidence: 0.9,
          verificationStatus: "VERIFIED",
          demo: false,
        },
      ];
      const response: AdapterResponse<CatastroParcelInfo> = { data: parsed, evidence, retrievedAt, mode: "public" };
      return ok(response);
    } catch (e) {
      logger.warn("catastro.public.query_failed", { error: e instanceof Error ? e.message : String(e) });
      return err(appError("SOURCE_UNAVAILABLE", "No hemos podido consultar el Catastro en este momento.", undefined, e));
    }
  }
}

function buildUrl(q: CatastroQuery): string | null {
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
const get = (o: unknown, ...path: string[]): unknown => path.reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Obj)[k] : undefined), o);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : undefined);
const num = (v: unknown) => {
  const n = Number(str(v));
  return Number.isFinite(n) ? n : undefined;
};

/** Parse the OVC JSON. Defensive: the structure differs slightly between endpoints. */
export function parseOvc(json: unknown, q: CatastroQuery): CatastroParcelInfo | null {
  const root = (get(json, "consulta_dnprcResult") ?? get(json, "consulta_dnplocResult") ?? get(json, "Consulta_RCCOORResult") ?? json) as Obj;
  const bico = get(root, "bico");
  const list = (get(bico, "bi") ?? get(root, "lrcdnp", "rcdnp") ?? get(root, "coordenadas", "coord")) as unknown;
  const items = Array.isArray(list) ? list : list ? [list] : [];
  if (items.length === 0) return null;
  const units: CatastroUnit[] = items.map((bi) => {
    const rc = get(bi, "idbi", "rc") ?? get(bi, "rc") ?? get(bi, "pc");
    const ref = ["pc1", "pc2", "car", "cc1", "cc2"].map((k) => str(get(rc, k)) ?? "").join("");
    const dir = get(bi, "dt", "locs", "lous", "lourb", "dir") ?? get(bi, "dt", "locs", "lous", "lourb");
    const address = [str(get(dir, "tv")), str(get(dir, "nv")), str(get(dir, "pnp"))].filter(Boolean).join(" ") || str(get(bi, "ldt")) || "";
    const loint = get(bi, "dt", "locs", "lous", "lourb", "loint");
    const useCode = str(get(bi, "debi", "luso"))?.charAt(0);
    return {
      cadastralRef: ref,
      address,
      useCode: useCode ?? "",
      useLabel: (useCode && CATASTRO_USE_LABELS[useCode]) || str(get(bi, "debi", "luso")) || "",
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
    municipality: str(get(root, "bico", "bi", "dt", "nm")) ?? (q.kind === "address" ? q.municipality : "SEVILLA"),
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
