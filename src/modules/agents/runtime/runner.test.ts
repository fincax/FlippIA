import { describe, expect, it } from "vitest";
import { z } from "zod";
import { adapters } from "@/modules/adapters/registry";
import { aiProvider } from "@/modules/ai/provider";
import { defaultCity } from "@/modules/city/registry";
import { createLogger } from "@/modules/core/logger";
import { EvidenceCollector } from "@/modules/evidence/store";
import { executePlan, isRetryableFailure, validatePlan } from "./runner";
import type { AgentDefinition, AnalysisEvent } from "./types";

const base = () => ({
  analysisId: "an_test",
  organizationId: "org_test",
  userId: "usr_test",
  analysisDate: "2026-01-15",
  city: defaultCity(),
  adapters: adapters(),
  evidence: new EvidenceCollector(),
  ai: aiProvider(),
  logger: createLogger({ test: true }),
});

const agent = (
  type: string,
  deps: string[],
  run: AgentDefinition["run"],
  extra: Partial<AgentDefinition> = {},
): AgentDefinition => ({
  type,
  label: type,
  domain: "core",
  description: type,
  dependsOn: deps,
  run,
  ...extra,
});

describe("executePlan", () => {
  it("runs agents in dependency order and in parallel where possible", async () => {
    const order: string[] = [];
    const plan = {
      agents: [
        agent("a", [], async () => {
          order.push("a");
          return { v: 1 };
        }),
        agent("b", ["a"], async (ctx) => {
          order.push("b");
          return { v: (ctx.outputs.get("a") as { v: number }).v + 1 };
        }),
        agent("c", ["a"], async () => {
          order.push("c");
          return { v: 3 };
        }),
        agent("d", ["b", "c"], async () => {
          order.push("d");
          return { v: 4 };
        }),
      ],
    };
    const events: AnalysisEvent[] = [];
    const out = await executePlan(plan, base(), { emit: (e) => events.push(e) });
    expect(order[0]).toBe("a");
    expect(order[3]).toBe("d");
    expect(out.failed).toEqual([]);
    expect((out.outputs.get("b") as { v: number }).v).toBe(2);
    expect(events.at(-1)?.type).toBe("run.completed");
    expect(out.records).toHaveLength(4);
  });
  it("skips dependants of a failed agent and continues the rest", async () => {
    const plan = {
      agents: [
        agent("ok", [], async () => ({ ok: true })),
        agent("boom", [], async () => {
          throw new Error("nope");
        }),
        agent("child", ["boom"], async () => ({})),
      ],
    };
    const events: AnalysisEvent[] = [];
    const out = await executePlan(plan, base(), { emit: (e) => events.push(e), budget: { maxRetries: 0 } });
    expect(out.failed).toEqual(["boom"]);
    expect(out.skipped).toEqual(["child"]);
    expect(out.aborted).toBe(false);
    expect(events.some((e) => e.type === "task.skipped")).toBe(true);
  });
  it("retries once then fails; records attempts", async () => {
    let calls = 0;
    const plan = {
      agents: [
        agent("flaky", [], async () => {
          calls++;
          if (calls < 2) throw new Error("first");
          return { calls };
        }),
      ],
    };
    const out = await executePlan(plan, base(), { emit: () => {} });
    expect(out.failed).toEqual([]);
    expect(out.records[0]?.attempts).toBe(2);
  });
  it("times out a slow agent", async () => {
    const plan = {
      agents: [agent("slow", [], () => new Promise((r) => setTimeout(() => r({}), 200)), { timeoutMs: 20 })],
    };
    const out = await executePlan(plan, base(), { emit: () => {}, budget: { maxRetries: 0 } });
    expect(out.records[0]?.status).toBe("timeout");
  });
  it("aborts the run when a critical agent fails", async () => {
    const plan = {
      agents: [
        agent(
          "crit",
          [],
          async () => {
            throw new Error("x");
          },
          { critical: true },
        ),
        agent("after", ["crit"], async () => ({})),
      ],
    };
    const out = await executePlan(plan, base(), { emit: () => {}, budget: { maxRetries: 0 } });
    expect(out.aborted).toBe(true);
  });
  it("rejects cycles and unknown dependencies", () => {
    expect(() =>
      validatePlan({ agents: [agent("a", ["b"], async () => ({})), agent("b", ["a"], async () => ({}))] }),
    ).toThrow(/Cycle/);
    expect(() => validatePlan({ agents: [agent("a", ["zzz"], async () => ({}))] })).toThrow(/unknown/);
  });
  it("an agent skipped by predicate does not block its dependants", async () => {
    const plan = {
      agents: [
        agent("root", [], async () => ({})),
        agent("optional", ["root"], async () => ({ ran: true }), { when: () => false }),
        agent("final", ["optional"], async (ctx) => ({ sawOptional: ctx.outputs.has("optional") })),
      ],
    };
    const out = await executePlan(plan, base(), { emit: () => {} });
    expect(out.skipped).toEqual(["optional"]);
    expect((out.outputs.get("final") as { sawOptional: boolean }).sawOptional).toBe(false);
  });
  it("records tool calls", async () => {
    const plan = {
      agents: [agent("t", [], async (ctx) => ctx.tool("adapter.demo", { q: 1 }, async () => ({ r: 1 })))],
    };
    const out = await executePlan(plan, base(), { emit: () => {} });
    expect(out.records[0]?.toolCalls[0]?.tool).toBe("adapter.demo");
    expect(out.records[0]?.toolCalls[0]?.ok).toBe(true);
  });
});

const sampleEvidence = (label: string) => ({
  sourceType: "internal_model" as const,
  sourceId: "test",
  sourceName: "test",
  sourceAuthority: "test",
  geographicScope: { level: "point" as const, label },
  confidence: 0.5,
  verificationStatus: "INFERRED" as const,
  demo: true,
});

const terminalEvents = (events: AnalysisEvent[]) =>
  events.filter((e) => e.type === "task.completed" || e.type === "task.failed" || e.type === "task.skipped");

describe("executePlan — external cancellation", () => {
  it("aborts when the caller's signal fires", async () => {
    const ctrl = new AbortController();
    const plan = {
      agents: [
        agent("slow", [], () => new Promise((r) => setTimeout(() => r({}), 500)), { timeoutMs: 5_000 }),
      ],
    };
    setTimeout(() => ctrl.abort(new Error("client gone")), 20);
    const out = await executePlan(plan, base(), {
      emit: () => {},
      budget: { maxRetries: 0 },
      signal: ctrl.signal,
    });
    expect(out.aborted).toBe(true);
  });
  it("emits task.skipped 'Cancelado' for every agent still pending or in flight", async () => {
    const ctrl = new AbortController();
    const plan = {
      agents: [
        agent("slow", [], () => new Promise((r) => setTimeout(() => r({}), 500)), { timeoutMs: 5_000 }),
        agent("after", ["slow"], async () => ({})),
        agent("later", ["after"], async () => ({})),
      ],
    };
    const events: AnalysisEvent[] = [];
    setTimeout(() => ctrl.abort(new Error("client gone")), 20);
    const out = await executePlan(plan, base(), {
      emit: (e) => events.push(e),
      budget: { maxRetries: 1 },
      signal: ctrl.signal,
    });
    expect(out.aborted).toBe(true);
    const skippedEvents = events.filter((e) => e.type === "task.skipped");
    expect(skippedEvents.map((e) => e.task).sort()).toEqual(["after", "later", "slow"]);
    expect(skippedEvents.every((e) => e.reason === "Cancelado")).toBe(true);
    expect(out.skipped.sort()).toEqual(["after", "later", "slow"]);
    expect(out.failed).toEqual([]);
    expect(out.records.find((r) => r.agentType === "slow")?.status).toBe("skipped");
    // Every planned task reached a terminal event: nothing stays "running" in the UI.
    expect(new Set(terminalEvents(events).map((e) => e.task)).size).toBe(plan.agents.length);
    expect(events.at(-1)?.type).toBe("run.failed");
  });
  it("emits task.skipped 'Cancelado' when the total time budget runs out", async () => {
    const plan = {
      agents: [
        agent("slow", [], () => new Promise((r) => setTimeout(() => r({}), 300)), { timeoutMs: 5_000 }),
        agent("after", ["slow"], async () => ({})),
      ],
    };
    const events: AnalysisEvent[] = [];
    const out = await executePlan(plan, base(), {
      emit: (e) => events.push(e),
      budget: { maxRetries: 0, maxTotalMs: 30 },
    });
    expect(out.aborted).toBe(true);
    expect(
      events.some((e) => e.type === "task.skipped" && e.task === "after" && e.reason === "Cancelado"),
    ).toBe(true);
    expect(new Set(terminalEvents(events).map((e) => e.task)).size).toBe(2);
  });
});

describe("executePlan — retries", () => {
  it("classifies zod validation errors as non-retryable", () => {
    const parsed = z.object({ v: z.number() }).safeParse({ v: "x" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(isRetryableFailure(parsed.error)).toBe(false);
    expect(isRetryableFailure(new Error("network"))).toBe(true);
  });
  it("does not retry an attempt whose output fails schema validation", async () => {
    let calls = 0;
    const plan = {
      agents: [
        agent(
          "badshape",
          [],
          async () => {
            calls++;
            return { v: "not a number" };
          },
          { outputSchema: z.object({ v: z.number() }) },
        ),
      ],
    };
    const events: AnalysisEvent[] = [];
    const out = await executePlan(plan, base(), { emit: (e) => events.push(e), budget: { maxRetries: 2 } });
    expect(calls).toBe(1);
    expect(out.failed).toEqual(["badshape"]);
    expect(out.records[0]?.attempts).toBe(1);
    expect(out.records[0]?.status).toBe("failed");
    expect(events.some((e) => e.type === "task.failed" && e.task === "badshape")).toBe(true);
  });
});

describe("executePlan — evidence isolation per attempt", () => {
  it("never counts evidence from a timed-out attempt, even if it completes later", async () => {
    const ctx = base();
    let calls = 0;
    const plan = {
      agents: [
        agent(
          "flaky",
          [],
          async (c) => {
            calls++;
            if (calls === 1) {
              // Slow first attempt: adds evidence before and after the timeout fires.
              c.evidence.add(sampleEvidence("attempt-1-early"));
              await new Promise((r) => setTimeout(r, 80));
              c.evidence.add(sampleEvidence("attempt-1-late"));
              return { calls };
            }
            c.evidence.add(sampleEvidence("attempt-2"));
            return { calls };
          },
          { timeoutMs: 20 },
        ),
      ],
    };
    const out = await executePlan(plan, ctx, { emit: () => {}, budget: { maxRetries: 1 } });
    // Let the abandoned first attempt finish in the background.
    await new Promise((r) => setTimeout(r, 120));
    expect(out.failed).toEqual([]);
    expect(out.records[0]?.attempts).toBe(2);
    const all = ctx.evidence.all();
    expect(all).toHaveLength(1);
    expect(all[0]?.geographicScope.label).toBe("attempt-2");
    expect(out.records[0]?.evidenceIds).toEqual(all.map((e) => e.id));
  });
  it("discards evidence of a failed attempt and keeps a successful retry's evidence", async () => {
    const ctx = base();
    let calls = 0;
    const plan = {
      agents: [
        agent("retry", [], async (c) => {
          calls++;
          c.evidence.add(sampleEvidence(`attempt-${calls}`));
          if (calls === 1) throw new Error("first");
          return { calls };
        }),
      ],
    };
    const out = await executePlan(plan, ctx, { emit: () => {} });
    expect(out.failed).toEqual([]);
    expect(ctx.evidence.all().map((e) => e.geographicScope.label)).toEqual(["attempt-2"]);
  });
  it("exposes a running agent's own evidence and the shared evidence to it, and only its own on the record", async () => {
    const ctx = base();
    const plan = {
      agents: [
        agent("first", [], async (c) => {
          const ev = c.evidence.add(sampleEvidence("first"));
          return { id: ev.id };
        }),
        agent("second", ["first"], async (c) => {
          const firstId = (c.outputs.get("first") as { id: string }).id;
          const own = c.evidence.add(sampleEvidence("second"));
          const seesFirst = c.evidence.byIds([firstId]).length === 1 && c.evidence.get(firstId) !== undefined;
          const seesOwn = c.evidence.all().some((e) => e.id === own.id);
          const seesFirstInAll = c.evidence.all().some((e) => e.id === firstId);
          return { seesFirst, seesOwn, seesFirstInAll };
        }),
      ],
    };
    const out = await executePlan(plan, ctx, { emit: () => {} });
    expect(out.outputs.get("second")).toEqual({ seesFirst: true, seesOwn: true, seesFirstInAll: true });
    expect(ctx.evidence.all()).toHaveLength(2);
    const second = out.records.find((r) => r.agentType === "second");
    expect(second?.evidenceIds).toHaveLength(1);
    expect(ctx.evidence.get(second!.evidenceIds[0]!)?.geographicScope.label).toBe("second");
  });
});
