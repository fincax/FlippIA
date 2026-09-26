import { describe, expect, it } from "vitest";
import { adapters } from "@/modules/adapters/registry";
import { aiProvider } from "@/modules/ai/provider";
import { defaultCity } from "@/modules/city/registry";
import { createLogger } from "@/modules/core/logger";
import { EvidenceCollector } from "@/modules/evidence/store";
import { executePlan, validatePlan } from "./runner";
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
});
