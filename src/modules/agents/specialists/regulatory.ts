import type { PropertyProfile } from "@/modules/analysis/types";
import { buildRegulatorySnapshot, type RegulatorySnapshot, type RegulatoryTopic } from "@/modules/regulatory";
import type { AgentDefinition } from "../runtime/types";
import { output } from "../runtime/types";

export function topicsForProperty(p: PropertyProfile): RegulatoryTopic[] {
  const base: RegulatoryTopic[] = ["planning", "zoning", "land_use", "building_parameters", "licence", "responsible_declaration", "building_code", "energy", "tax.acquisition", "tax.exit", "tax.local", "tax.works", "horizontal_property", "heritage", "protection", "accessibility", "habitability"];
  if (p.property.assetUse === "residential") base.push("tenancy", "housing", "tourism", "subdivision");
  else base.push("change_of_use", "fire_safety");
  return base;
}

/** Regulatory Orchestrator → Snapshot Agent. Freezes the rules used by this analysis. */
export const regulatorySnapshotAgent: AgentDefinition<RegulatorySnapshot> = {
  type: "regulatory.snapshot",
  label: "Normativa vigente identificada",
  domain: "regulatory",
  description: "Construye el Regulatory Snapshot del análisis (normas, versiones, fechas).",
  dependsOn: ["data.catastro"],
  async run(ctx) {
    const profile = output<PropertyProfile>(ctx, "data.catastro");
    const snapshot = buildRegulatorySnapshot({ jurisdictionChain: ctx.city.regulatoryChain, topics: topicsForProperty(profile), assetUse: profile.property.assetUse, analysisDate: ctx.analysisDate });
    for (const e of snapshot.entries) {
      ctx.evidence.add({
        sourceType: "official_gazette",
        sourceId: "regulatory-registry",
        sourceName: e.sourceName,
        sourceAuthority: e.jurisdiction.label,
        sourceUrl: e.sourceUrl,
        sourcePublishedAt: e.effectiveFrom,
        effectiveDate: e.effectiveFrom,
        geographicScope: { level: e.jurisdiction.level === "eu" ? "eu" : e.jurisdiction.level, code: e.jurisdiction.code, label: e.jurisdiction.label },
        documentId: e.regulationId,
        documentVersion: e.versionId,
        excerpt: e.title,
        confidence: e.verificationStatus === "VERIFIED" ? 0.95 : e.verificationStatus === "INFERRED" ? 0.7 : 0.4,
        verificationStatus: e.verificationStatus,
        demo: false,
      });
    }
    ctx.progress(`${snapshot.entries.length} normas, ${snapshot.gaps.length} lagunas`);
    return snapshot;
  },
};
