import { newId } from "@/modules/core/ids";
import type { Evidence } from "./types";

export type NewEvidence = Omit<Evidence, "id" | "retrievedAt"> & { retrievedAt?: string };

/**
 * In-memory evidence collector used during a single analysis run. Persisted
 * evidence lives in the `evidence` table; the analysis service copies these
 * records there at the end of the run, with the deal id.
 */
export class EvidenceCollector {
  private items = new Map<string, Evidence>();

  add(input: NewEvidence): Evidence {
    const ev: Evidence = { ...input, id: newId("ev"), retrievedAt: input.retrievedAt ?? new Date().toISOString() };
    this.items.set(ev.id, ev);
    return ev;
  }

  addMany(inputs: NewEvidence[]): Evidence[] {
    return inputs.map((i) => this.add(i));
  }

  attach(evidence: Evidence[]): void {
    for (const e of evidence) this.items.set(e.id, e);
  }

  get(id: string): Evidence | undefined {
    return this.items.get(id);
  }

  all(): Evidence[] {
    return [...this.items.values()];
  }

  byIds(ids: string[]): Evidence[] {
    return ids.map((id) => this.items.get(id)).filter((e): e is Evidence => Boolean(e));
  }
}
