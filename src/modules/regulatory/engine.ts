import { createHash } from "node:crypto";
import { newId } from "@/modules/core/ids";
import { REGULATORY_REGISTRY } from "./registry";
import type {
  Jurisdiction,
  Regulation,
  RegulationVersion,
  RegulatorySnapshot,
  RegulatorySnapshotEntry,
  RegulatoryTopic,
} from "./types";

export interface RegulatoryQuery {
  /** Jurisdiction chain from broadest to narrowest, e.g. EU → ES → ES-AN → 41091. */
  jurisdictionChain: Jurisdiction[];
  topics: RegulatoryTopic[];
  assetUse?: "residential" | "commercial" | "office" | "industrial" | "land" | "other";
  analysisDate: string;
  registry?: Regulation[];
}

/** Version in force on a date (or the most recent unverified/pending one, flagged). */
export function versionInForce(reg: Regulation, date: string): RegulationVersion | undefined {
  const candidates = reg.versions.filter(
    (v) =>
      v.status !== "repealed" && v.effectiveFrom <= date && (!v.effectiveUntil || v.effectiveUntil >= date),
  );
  candidates.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return candidates[0];
}

export function applicableRegulations(
  q: RegulatoryQuery,
): Array<{ regulation: Regulation; version: RegulationVersion; reason: string }> {
  const registry = q.registry ?? REGULATORY_REGISTRY;
  const chainCodes = new Set(q.jurisdictionChain.map((j) => j.code));
  const out: Array<{ regulation: Regulation; version: RegulationVersion; reason: string }> = [];
  for (const reg of registry) {
    if (!chainCodes.has(reg.jurisdiction.code)) continue;
    const topicHits = reg.topics.filter((t) => q.topics.includes(t));
    if (topicHits.length === 0) continue;
    if (q.assetUse && reg.assetUses.length > 0 && !reg.assetUses.includes(q.assetUse)) continue;
    const version = versionInForce(reg, q.analysisDate);
    if (!version) continue;
    out.push({
      regulation: reg,
      version,
      reason: `Ámbito ${reg.jurisdiction.label}; materias: ${topicHits.join(", ")}.`,
    });
  }
  // Narrowest jurisdiction first: what the user must check locally is the most specific.
  const order: Record<Jurisdiction["level"], number> = {
    parcel: 0,
    municipality: 1,
    province: 2,
    region: 3,
    country: 4,
    eu: 5,
  };
  out.sort((a, b) => order[a.regulation.jurisdiction.level] - order[b.regulation.jurisdiction.level]);
  return out;
}

export function buildRegulatorySnapshot(q: RegulatoryQuery, now = new Date()): RegulatorySnapshot {
  const hits = applicableRegulations(q);
  const entries: RegulatorySnapshotEntry[] = hits.map(({ regulation, version, reason }) => ({
    regulationId: regulation.id,
    versionId: version.id,
    shortName: regulation.shortName,
    title: version.title,
    jurisdiction: regulation.jurisdiction,
    topics: regulation.topics,
    effectiveFrom: version.effectiveFrom,
    effectiveUntil: version.effectiveUntil,
    status: version.status,
    verificationStatus: version.verificationStatus,
    sourceUrl: version.sourceUrl,
    sourceName: version.sourceName,
    verifiedAt: version.verifiedAt,
    reason,
  }));
  const covered = new Set(entries.flatMap((e) => e.topics));
  const gaps = q.topics
    .filter((t) => !covered.has(t))
    .map((topic) => ({
      topic,
      note: `Sin norma identificada en el registro para "${topic}" en la cadena jurisdiccional.`,
    }));
  const fingerprint = createHash("sha256")
    .update(
      entries
        .map((e) => e.versionId)
        .sort()
        .join("|"),
    )
    .digest("hex")
    .slice(0, 16);
  return {
    id: newId("rsnap"),
    createdAt: now.toISOString(),
    analysisDate: q.analysisDate,
    jurisdictionChain: q.jurisdictionChain,
    topics: q.topics,
    entries,
    fingerprint,
    gaps,
  };
}

/** Human sentence FlippIA uses instead of "la normativa dice". */
export function regulatoryPreamble(snapshot: RegulatorySnapshot): string {
  const unverified = snapshot.entries.filter((e) => e.verificationStatus !== "VERIFIED").length;
  return `Conforme a la normativa identificada como vigente a ${snapshot.analysisDate} (${snapshot.entries.length} referencias, ${unverified} pendientes de verificación documental).`;
}
