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

const TIMEOUT_MS = 8_000;

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

    // 1. Resolve the parcel centroid from the cadastral reference when needed.
    if (!point && input.cadastralRef && this.config.parcel) {
      const layer = this.config.parcel;
      const field = layer.fields.cadastralRef;
      if (field) {
        const o = await this.run("parcel", layer, {
          equals: { field, value: input.cadastralRef.slice(0, 14).toUpperCase() },
          returnGeometry: true,
          maxFeatures: 1,
        });
        outcomes.push(o);
        point = o.features[0]?.centroid;
        if (!point && !o.error)
          notes.push(`La parcela ${input.cadastralRef} no aparece en la capa parcelaria pública.`);
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

    // 2. Query every thematic layer at the point, in parallel; failures are tolerated.
    const thematic = this.layers().filter((l) => l.role !== "parcel" && l.role !== "files");
    const results = await Promise.all(
      thematic.map(({ role, layer }) => this.run(role, layer, { point, maxFeatures: 5 })),
    );
    outcomes.push(...results);
    if (this.config.files && input.cadastralRef && this.config.files.fields.cadastralRef) {
      outcomes.push(
        await this.run("files", this.config.files, {
          equals: {
            field: this.config.files.fields.cadastralRef,
            value: input.cadastralRef.slice(0, 14).toUpperCase(),
          },
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
    const first = (role: PlanningLayerRole) => by(role)?.features[0]?.attributes;
    const field = (role: PlanningLayerRole, key: string): string | undefined => {
      const layer = this.config[role];
      const name = layer?.fields[key as keyof typeof layer.fields];
      const attrs = first(role);
      if (!name || !attrs) return undefined;
      const v = attrs[name];
      if (v === null || v === undefined || v === "") return undefined;
      return String(v).trim();
    };
    const failed = (role: PlanningLayerRole) => Boolean(by(role)?.error);
    const missing = (role: PlanningLayerRole) => !this.config[role];

    // Zoning / ordinance
    const zoningCode = field("zoning", "code") ?? field("classification", "category") ?? "";
    const catalogueEntry =
      city.urbanism.zoningCatalogue[zoningCode] ??
      Object.entries(city.urbanism.zoningCatalogue).find(([k]) =>
        zoningCode.toUpperCase().startsWith(k),
      )?.[1];
    const zoningLabel =
      field("zoning", "label") ?? field("zoning", "ordinance") ?? catalogueEntry?.label ?? zoningCode ?? "";
    const maxFloorsRaw = field("zoning", "maxFloors");
    const maxFloors =
      maxFloorsRaw && Number.isFinite(Number(maxFloorsRaw))
        ? Number(maxFloorsRaw)
        : (catalogueEntry?.maxFloors ?? null);
    const classification = [field("classification", "class"), field("classification", "category")]
      .filter(Boolean)
      .join(" · ");

    // Protection
    const levelRaw = field("catalogue", "level");
    const protectionLevel: ProtectionLevel = normaliseProtection(levelRaw, {
      configured: !missing("catalogue"),
      answered: !failed("catalogue"),
    });
    const catalogued = protectionLevel !== "none" && protectionLevel !== "unknown";

    // Historic centre
    const historicHit = (by("historicCentre")?.features.length ?? 0) > 0;
    const microzone =
      (input.microzoneId && city.microzones.find((m) => m.id === input.microzoneId)) ||
      microzoneFromPoint(city, point) ||
      (input.address ? microzoneFromText(city, input.address) : undefined);
    const inHistoricCentre =
      !missing("historicCentre") && !failed("historicCentre")
        ? historicHit
        : Boolean(microzone?.historicCentre);
    const heritageSector = field("historicCentre", "sector") ?? field("historicCentre", "name");

    // Uses (from the ordinance catalogue of the city profile; the geoservice rarely lists uses).
    const allowedUses: string[] = [];
    const conditionedUses: string[] = [];
    const forbiddenUses: string[] = [];
    const useRaw = field("zoning", "use");
    if (useRaw) allowedUses.push(useRaw);
    if (catalogueEntry?.groundFloorResidential === "conditioned")
      conditionedUses.push("Residencial en planta baja (condiciones de la ordenanza)");
    if (catalogueEntry?.groundFloorResidential === "forbidden")
      forbiddenUses.push("Residencial en planta baja");
    const touristHit = by("touristSaturation")?.features[0];
    if (touristHit) {
      const flag = field("touristSaturation", "flag") ?? "zona saturada";
      const district = field("touristSaturation", "district") ?? field("touristSaturation", "name");
      conditionedUses.push(`Vivienda de uso turístico: ${flag}${district ? ` (${district})` : ""}`);
    }

    // Development planning in process
    const dev = by("developmentPlanning")?.features ?? [];
    for (const f of dev.slice(0, 3)) {
      const l = this.config.developmentPlanning!;
      const name = l.fields.name ? f.attributes[l.fields.name] : undefined;
      const status = l.fields.status ? f.attributes[l.fields.status] : undefined;
      const instrument = l.fields.instrument ? f.attributes[l.fields.instrument] : undefined;
      notes.push(
        `Planeamiento en tramitación sobre la parcela: ${[instrument, name, status].filter(Boolean).join(" · ") || "sin detalle"}.`,
      );
    }

    // Files
    const filesLayer = this.config.files;
    const knownFiles = (by("files")?.features ?? []).map((f) => ({
      type: String((filesLayer?.fields.type && f.attributes[filesLayer.fields.type]) ?? "Expediente"),
      reference: String((filesLayer?.fields.reference && f.attributes[filesLayer.fields.reference]) ?? ""),
      status: String((filesLayer?.fields.status && f.attributes[filesLayer.fields.status]) ?? ""),
      date: String((filesLayer?.fields.date && f.attributes[filesLayer.fields.date]) ?? ""),
    }));

    // Notes about coverage
    if (classification) notes.unshift(`Clasificación del suelo: ${classification}.`);
    if (catalogueEntry?.notes) notes.push(catalogueEntry.notes);
    for (const role of PLANNING_LAYER_ROLES) {
      if (role === "parcel" || role === "files") continue;
      if (missing(role)) notes.push(`${ROLE_LABEL[role]}: capa no configurada; verificar en la Gerencia.`);
      else if (failed(role)) notes.push(`${ROLE_LABEL[role]}: el servicio público no ha respondido.`);
    }
    if (!zoningCode)
      notes.push("Calificación no obtenida: la parcela no intersecta ninguna zona de ordenanza publicada.");

    // Status: verified when the core layers answered with data.
    const coreAnswered = Boolean(zoningCode) && !failed("classification");
    const anyFailed = outcomes.some((o) => o.error);
    const status: EvidenceStatus = !coreAnswered
      ? zoningCode
        ? "INFERRED"
        : "UNKNOWN"
      : anyFailed
        ? "INFERRED"
        : "VERIFIED";

    return {
      planningInstrument: city.urbanism.planningInstrument,
      zoningCode,
      zoningLabel,
      maxFloors,
      groundFloorResidential: catalogueEntry?.groundFloorResidential ?? "unknown",
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

const ROLE_LABEL: Record<PlanningLayerRole, string> = {
  parcel: "Parcelario",
  classification: "Clasificación del suelo",
  zoning: "Calificación (zona de ordenanza)",
  catalogue: "Catálogo de protección",
  historicCentre: "Conjunto Histórico",
  touristSaturation: "Vivienda de uso turístico",
  developmentPlanning: "Planeamiento de desarrollo",
  files: "Expedientes",
};

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
  if (/SIN PROTECCI|NO CATALOG|NINGUN/.test(v)) return "none";
  return "unknown";
}

function summariseAttributes(attrs: Record<string, unknown>): string {
  return Object.entries(attrs)
    .filter(([k, v]) => v !== null && v !== "" && !/^(objectid|shape|globalid|fid)/i.test(k))
    .slice(0, 8)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(", ");
}
