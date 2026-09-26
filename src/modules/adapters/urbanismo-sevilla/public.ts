import { defaultCity, microzoneFromPoint, microzoneFromText } from "@/modules/city/registry";
import type { CityProfile, LatLng } from "@/modules/city/types";
import type { EvidenceStatus } from "@/modules/core/evidence-status";
import { logger } from "@/modules/core/logger";
import { appError, err, ok } from "@/modules/core/result";
import type { NewEvidence } from "@/modules/evidence/store";
import { queryLayer, type FeatureRecord, type GeoQuery } from "../geoservices";
import type { AdapterResponse, DataSourceAdapter } from "../types";
import {
  mergePlanningConfig,
  parsePlanningConfigOverride,
  PLANNING_LAYER_ROLES,
  type PlanningLayer,
  type PlanningLayerRole,
  type PublicPlanningConfig,
} from "./public-config";
import type { PlanningInfo, ProtectionLevel, UrbanismQuery } from "./types";

const TIMEOUT_MS = 10_000;

interface LayerOutcome {
  role: PlanningLayerRole;
  layer: PlanningLayer;
  features: FeatureRecord[];
  url?: string;
  error?: string;
}

/**
 * Public planning connector: reads the free geoservices that a Gerencia de
 * Urbanismo publishes (ArcGIS REST / WFS) and turns the layers that intersect
 * the parcel into a `PlanningInfo` with one evidence record per layer. Nothing
 * is fabricated: layers that are not configured or do not answer are reported
 * as such and lower the evidence status.
 */
export class UrbanismoPublicConnector implements DataSourceAdapter<UrbanismQuery, PlanningInfo> {
  sourceId = "urbanismo-sevilla";
  sourceType = "official_planning" as const;
  sourceName: string;
  sourceAuthority: string;
  mode = "public" as const;
  readonly config: PublicPlanningConfig;

  constructor(
    private readonly city: CityProfile = defaultCity(),
    configOverride: Partial<PublicPlanningConfig> | null = parsePlanningConfigOverride(
      process.env.URBANISMO_PUBLIC_CONFIG,
    ),
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!city.urbanism.publicSources)
      throw new Error(`City ${city.id} has no public planning sources configured`);
    this.config = mergePlanningConfig(city.urbanism.publicSources, configOverride);
    this.sourceName = `${this.config.publisher} (servicios públicos)`;
    this.sourceAuthority = city.urbanism.authority;
  }

  /** Layers configured, in role order. */
  layers(): Array<{ role: PlanningLayerRole; layer: PlanningLayer }> {
    return PLANNING_LAYER_ROLES.flatMap((role) => {
      const layer = this.config[role];
      return layer ? [{ role, layer }] : [];
    });
  }

  async isAvailable() {
    const probe = this.config.zoning ?? this.config.classification ?? this.config.parcel;
    if (!probe) return false;
    try {
      await queryLayer(probe.source, { maxFeatures: 1 }, { fetchImpl: this.fetchImpl, timeoutMs: 4_000 });
      return true;
    } catch {
      return false;
    }
  }

  async query(input: UrbanismQuery) {
    const notes: string[] = [];
    const outcomes: LayerOutcome[] = [];
    let point = input.point;
    const rc14 = input.cadastralRef?.slice(0, 14).toUpperCase();

    // 1. Parcel layer: by cadastral reference (centroid) or by point (attributes such as VUT limits).
    if (this.config.parcel) {
      const layer = this.config.parcel;
      const field = layer.fields.cadastralRef;
      const q: GeoQuery | null =
        !point && rc14 && field
          ? { equals: { field, value: rc14 }, returnGeometry: true, maxFeatures: 1 }
          : point
            ? { point, maxFeatures: 1 }
            : null;
      if (q) {
        const o = await this.run("parcel", layer, q);
        outcomes.push(o);
        if (!point) point = o.features[0]?.centroid;
        if (!point && !o.error) notes.push(`La parcela ${rc14} no aparece en el parcelario público.`);
      }
    }
    if (!point) {
      return err(
        appError(
          "UNSUPPORTED_QUERY",
          "Sin coordenadas ni referencia catastral resoluble no es posible consultar el planeamiento público.",
        ),
      );
    }

    // 2. Every thematic layer at the point, in parallel; failures are tolerated.
    const thematic = this.layers().filter((l) => l.role !== "parcel" && l.role !== "files");
    const results = await Promise.all(
      thematic.map(({ role, layer }) => this.run(role, layer, { point, maxFeatures: 5 })),
    );
    outcomes.push(...results);
    if (this.config.files && rc14 && this.config.files.fields.cadastralRef) {
      outcomes.push(
        await this.run("files", this.config.files, {
          equals: { field: this.config.files.fields.cadastralRef, value: rc14 },
          maxFeatures: 50,
        }),
      );
    }

    const data = this.toPlanningInfo(input, point, outcomes, notes);
    const retrievedAt = new Date().toISOString();
    const evidence = this.toEvidence(outcomes, point, input, retrievedAt);
    const answered = outcomes.filter((o) => !o.error).length;
    if (answered === 0) {
      return err(
        appError("SOURCE_UNAVAILABLE", "Ningún servicio público de urbanismo ha respondido.", {
          errors: outcomes.map((o) => `${o.role}: ${o.error ?? "sin datos"}`),
        }),
      );
    }
    const response: AdapterResponse<PlanningInfo> = {
      data,
      evidence,
      retrievedAt,
      freshness: this.config.lastKnownUpdate,
      mode: "public",
    };
    return ok(response);
  }

  private async run(role: PlanningLayerRole, layer: PlanningLayer, q: GeoQuery): Promise<LayerOutcome> {
    try {
      const r = await queryLayer(layer.source, q, { fetchImpl: this.fetchImpl, timeoutMs: TIMEOUT_MS });
      return { role, layer, features: r.features, url: r.url };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.warn("urbanism.public.layer_failed", { role, layer: layer.label, error: message });
      return { role, layer, features: [], error: message };
    }
  }

  private toPlanningInfo(
    input: UrbanismQuery,
    point: LatLng,
    outcomes: LayerOutcome[],
    notes: string[],
  ): PlanningInfo {
    const city = this.city;
    const by = (role: PlanningLayerRole) => outcomes.find((o) => o.role === role);
    const hit = (role: PlanningLayerRole) => (by(role)?.features.length ?? 0) > 0;
    const failed = (role: PlanningLayerRole) => Boolean(by(role)?.error);
    const missing = (role: PlanningLayerRole) => !this.config[role];
    const field = (role: PlanningLayerRole, key: string, index = 0): string | undefined => {
      const layer = this.config[role];
      const name = layer?.fields[key as keyof typeof layer.fields];
      const attrs = by(role)?.features[index]?.attributes;
      if (!name || !attrs) return undefined;
      const v = attrs[name];
      if (v === null || v === undefined || v === "") return undefined;
      return String(v).trim();
    };

    // Zoning / ordinance
    const zoningCode = field("zoning", "code") ?? "";
    const zoningLabelRaw = field("zoning", "label") ?? field("zoning", "ordinance");
    const catalogueEntry = matchZoningCatalogue(city, zoningCode, zoningLabelRaw);
    const zoningLabel = zoningLabelRaw ?? catalogueEntry?.entry.label ?? zoningCode;
    const maxFloorsRaw = field("zoning", "maxFloors");
    const maxFloorsParsed = maxFloorsRaw ? Number(maxFloorsRaw.replace(/[^\d.]/g, "")) : Number.NaN;
    const maxFloors =
      Number.isFinite(maxFloorsParsed) && maxFloorsParsed > 0
        ? maxFloorsParsed
        : (catalogueEntry?.entry.maxFloors ?? null);
    const classification = [field("classification", "class"), field("classification", "category")]
      .filter(Boolean)
      .join(" · ");

    // Historic centre: dedicated layer first, then the zoning flag, then the city microzone.
    const zoningChFlag = truthy(field("zoning", "historicCentre"));
    const microzone =
      (input.microzoneId && city.microzones.find((m) => m.id === input.microzoneId)) ||
      microzoneFromPoint(city, point) ||
      (input.address ? microzoneFromText(city, input.address) : undefined);
    const inHistoricCentre =
      !missing("historicCentre") && !failed("historicCentre")
        ? hit("historicCentre")
        : zoningChFlag !== undefined
          ? zoningChFlag
          : Boolean(microzone?.historicCentre);
    const heritageSector =
      [field("historicCentre", "sector"), field("historicCentre", "name")].filter(Boolean).join(" · ") ||
      undefined;

    // Protection: BIC layer → catalogue layer → catalogue field in the zoning polygon.
    let protectionLevel: ProtectionLevel;
    if (hit("heritageAsset")) protectionLevel = "BIC";
    else if (!missing("catalogue") && !failed("catalogue"))
      protectionLevel = normaliseProtection(field("catalogue", "level"), {
        configured: true,
        answered: true,
      });
    else if (field("zoning", "catalogue") !== undefined)
      protectionLevel = normaliseProtection(field("zoning", "catalogue"), {
        configured: true,
        answered: true,
      });
    else protectionLevel = inHistoricCentre ? "unknown" : "none";
    const catalogued = protectionLevel !== "none" && protectionLevel !== "unknown";

    // Uses
    const allowedUses: string[] = [];
    const conditionedUses: string[] = [];
    const forbiddenUses: string[] = [];
    const useRaw = field("zoning", "use");
    if (useRaw) allowedUses.push(useRaw);
    if (catalogueEntry?.entry.groundFloorResidential === "conditioned")
      conditionedUses.push("Residencial en planta baja (condiciones de la ordenanza)");
    if (catalogueEntry?.entry.groundFloorResidential === "forbidden")
      forbiddenUses.push("Residencial en planta baja");
    const touristFlag = field("touristSaturation", "flag") ?? field("parcel", "flag");
    if (hit("touristSaturation") || touristFlag) {
      const district = field("touristSaturation", "district") ?? field("touristSaturation", "name");
      conditionedUses.push(
        `Vivienda de uso turístico: ${touristFlag ?? "zona con limitación municipal"}${district ? ` (${district})` : ""}`,
      );
    }
    if (hit("heritageSurroundings"))
      conditionedUses.push(
        `Obras en entorno de BIC (${field("heritageSurroundings", "name") ?? "entorno protegido"}): informe de Cultura`,
      );
    if (hit("archaeology"))
      conditionedUses.push(
        `Protección arqueológica ${field("archaeology", "level") ?? field("archaeology", "category") ?? ""}: cautelas en obras con movimiento de tierras`.replace(
          /\s+:/,
          ":",
        ),
      );

    // Notes: classification, catalogue notes, planning in process, constraints, coverage.
    if (classification) notes.unshift(`Clasificación del suelo: ${classification}.`);
    const detail = field("zoning", "detail");
    if (detail) notes.push(`Determinaciones complementarias: ${detail}.`);
    const normsUrl = field("zoning", "normsUrl");
    if (normsUrl) notes.push(`Normas particulares de la zona: ${normsUrl}`);
    if (hit("heritageAsset"))
      notes.push(
        `Bien de Interés Cultural: ${[field("heritageAsset", "name"), field("heritageAsset", "type")].filter(Boolean).join(" · ")}.`,
      );
    const catalogueSheet = field("catalogue", "sheet") ?? field("zoning", "sheet");
    if (catalogued && catalogueSheet) notes.push(`Ficha de catálogo: ${catalogueSheet}`);
    for (const f of by("developmentPlanning")?.features.slice(0, 3) ?? []) {
      const l = this.config.developmentPlanning!;
      const g = (k: keyof typeof l.fields) => (l.fields[k] ? f.attributes[l.fields[k]!] : undefined);
      const parts = [g("instrument"), g("name"), g("status")].filter(
        (v) => v !== null && v !== undefined && v !== "",
      );
      notes.push(`Planeamiento de desarrollo sobre la parcela: ${parts.join(" · ") || "sin detalle"}.`);
    }
    for (const f of by("constraints")?.features.slice(0, 5) ?? []) {
      const l = this.config.constraints!;
      const name = l.fields.name ? f.attributes[l.fields.name] : undefined;
      if (name) notes.push(`Afección sectorial: ${String(name)}.`);
    }
    if (catalogueEntry?.entry.notes) notes.push(catalogueEntry.entry.notes);
    for (const role of PLANNING_LAYER_ROLES) {
      if (role === "parcel" || role === "files") continue;
      if (missing(role)) {
        if (CORE_ROLES.has(role))
          notes.push(`${ROLE_LABEL[role]}: capa no configurada; verificar en la Gerencia.`);
      } else if (failed(role)) notes.push(`${ROLE_LABEL[role]}: el servicio público no ha respondido.`);
    }
    if (!zoningCode && !zoningLabelRaw)
      notes.push("Calificación no obtenida: la parcela no intersecta ninguna zona de ordenanza publicada.");

    // Files
    const filesLayer = this.config.files;
    const knownFiles = (by("files")?.features ?? []).map((f) => ({
      type: String((filesLayer?.fields.type && f.attributes[filesLayer.fields.type]) ?? "Expediente"),
      reference: String((filesLayer?.fields.reference && f.attributes[filesLayer.fields.reference]) ?? ""),
      status: String((filesLayer?.fields.status && f.attributes[filesLayer.fields.status]) ?? ""),
      date: String((filesLayer?.fields.date && f.attributes[filesLayer.fields.date]) ?? ""),
    }));

    // Status: verified when the zoning layer answered with data and nothing failed.
    const zoningAnswered = Boolean(zoningCode || zoningLabelRaw);
    const anyFailed = outcomes.some((o) => o.error);
    const status: EvidenceStatus = !zoningAnswered ? "UNKNOWN" : anyFailed ? "INFERRED" : "VERIFIED";

    return {
      planningInstrument: city.urbanism.planningInstrument,
      zoningCode: zoningCode || (catalogueEntry?.key ?? ""),
      zoningLabel,
      maxFloors,
      groundFloorResidential: catalogueEntry?.entry.groundFloorResidential ?? "unknown",
      allowedUses,
      conditionedUses,
      forbiddenUses,
      protectionLevel,
      heritageSector,
      catalogued,
      inHistoricCentre,
      knownFiles,
      notes,
      status,
      freshness: this.config.lastKnownUpdate,
    };
  }

  private toEvidence(
    outcomes: LayerOutcome[],
    point: LatLng,
    input: UrbanismQuery,
    retrievedAt: string,
  ): NewEvidence[] {
    return outcomes
      .filter((o) => !o.error && o.url)
      .map((o) => ({
        sourceType: "official_planning" as const,
        sourceId: this.sourceId,
        sourceName: `${this.config.publisher} · ${o.layer.label}`,
        sourceAuthority: this.sourceAuthority,
        sourceUrl: o.url,
        retrievedAt,
        sourcePublishedAt: this.config.lastKnownUpdate,
        geographicScope: {
          level: "parcel" as const,
          code: input.cadastralRef ?? `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`,
          label: input.address ?? o.layer.label,
        },
        excerpt: o.features.length
          ? `${o.layer.label}: ${summariseAttributes(o.features[0]!.attributes)}`
          : `${o.layer.label}: sin entidades en el punto consultado.`,
        structuredData: {
          role: o.role,
          layer: o.layer.label,
          matches: o.features.length,
          attributes: o.features.slice(0, 3).map((f) => f.attributes),
          note: o.layer.note,
        },
        confidence: o.features.length ? 0.85 : 0.7,
        verificationStatus: "VERIFIED" as const,
        demo: false,
      }));
  }
}

const CORE_ROLES = new Set<PlanningLayerRole>(["classification", "zoning", "catalogue", "historicCentre"]);

const ROLE_LABEL: Record<PlanningLayerRole, string> = {
  parcel: "Parcelario",
  classification: "Clasificación del suelo",
  zoning: "Calificación (zona de ordenanza)",
  catalogue: "Catálogo de protección",
  historicCentre: "Conjunto Histórico",
  heritageAsset: "Bienes de Interés Cultural",
  heritageSurroundings: "Entornos BIC",
  archaeology: "Catálogo arqueológico",
  constraints: "Afecciones sectoriales",
  touristSaturation: "Vivienda de uso turístico",
  developmentPlanning: "Planeamiento de desarrollo",
  files: "Expedientes",
};

const strip = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** Interpret yes/no style attributes ("SI", "1", "true", "CH"…); undefined when absent. */
export function truthy(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  const s = strip(v);
  if (["", "no", "0", "false", "n", "-"].includes(s)) return false;
  return true;
}

/** Match a published ordinance code/label against the city's zoning catalogue (exact key, prefix or label words). */
export function matchZoningCatalogue(
  city: CityProfile,
  code: string,
  label: string | undefined,
): { key: string; entry: CityProfile["urbanism"]["zoningCatalogue"][string] } | undefined {
  const catalogue = city.urbanism.zoningCatalogue;
  const c = code.toUpperCase().trim();
  if (c && catalogue[c]) return { key: c, entry: catalogue[c]! };
  for (const [key, entry] of Object.entries(catalogue)) {
    if (c && (c.startsWith(key) || c.split(/[\s\-_/]/)[0] === key)) return { key, entry };
  }
  const text = strip(`${label ?? ""} ${code}`);
  if (!text) return undefined;
  for (const [key, entry] of Object.entries(catalogue)) {
    const l = strip(entry.label);
    if (text.includes(l) || (l.length > 6 && l.split(" ").every((w) => text.includes(w))))
      return { key, entry };
  }
  return undefined;
}

/** Map the catalogue attribute to the canonical protection level. */
export function normaliseProtection(
  raw: string | undefined,
  coverage: { configured: boolean; answered: boolean },
): ProtectionLevel {
  if (!coverage.configured || !coverage.answered) return "unknown";
  if (!raw) return "none";
  const v = raw.toUpperCase().replace(/\s+/g, " ").trim();
  if (/\bBIC\b|INTER[EÉ]S CULTURAL|MONUMENT/.test(v)) return "BIC";
  const m = v.match(/(?:NIVEL|GRADO|PROTECCI[OÓ]N|CAT(?:EGOR[IÍ]A)?\.?)?\s*[:\-]?\s*\b([ABCD])\b/);
  if (m) return m[1] as ProtectionLevel;
  if (/INTEGRAL/.test(v)) return "A";
  if (/GLOBAL/.test(v)) return "B";
  if (/PARCIAL/.test(v)) return "C";
  if (/AMBIENTAL/.test(v)) return "D";
  if (/SIN PROTECCI|NO CATALOG|NINGUN|^NO$|^N$/.test(v)) return "none";
  return "unknown";
}

function summariseAttributes(attrs: Record<string, unknown>): string {
  return Object.entries(attrs)
    .filter(
      ([k, v]) =>
        v !== null &&
        v !== "" &&
        !/^(objectid|shape|globalid|fid|st_area|st_perimeter|created_|last_edited_)/i.test(k),
    )
    .slice(0, 10)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(", ");
}
