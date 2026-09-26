import { newId } from "@/modules/core/ids";
import type { AgentContext, AgentDefinition, AgentRunRecord, AnalysisEvent, Budget, ToolCallRecord } from "./types";
import { DEFAULT_BUDGET } from "./types";

export interface RunPlan {
  agents: AgentDefinition[];
}

export interface RunOptions {
  budget?: Partial<Budget>;
  emit: (event: AnalysisEvent) => void;
  onRunRecord?: (record: AgentRunRecord) => void;
}

export interface RunOutcome {
  outputs: Map<string, unknown>;
  records: AgentRunRecord[];
  failed: string[];
  skipped: string[];
  durationMs: number;
  aborted: boolean;
}

class DependencyError extends Error {}

/**
 * Core Orchestrator execution engine.
 * - Validates the DAG (no cycles, no unknown deps).
 * - Runs every agent whose dependencies are satisfied, in parallel.
 * - Enforces budgets: agent count, per-agent timeout, total time, retries.
 * - Records AgentRuns and emits observable events. No unbounded loops.
 */
export async function executePlan(plan: RunPlan, baseCtx: Omit<AgentContext, "outputs" | "progress" | "tool" | "signal">, opts: RunOptions): Promise<RunOutcome> {
  const budget: Budget = { ...DEFAULT_BUDGET, ...opts.budget };
  const started = Date.now();
  const outputs = new Map<string, unknown>();
  const records: AgentRunRecord[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];
  /** Skipped because not needed (predicate): dependants still run. */
  const notNeeded = new Set<string>();
  const controller = new AbortController();
  const orchestratorRunId = newId("run");

  validatePlan(plan);
  if (plan.agents.length > budget.maxAgents) throw new Error(`Plan exceeds agent budget (${plan.agents.length} > ${budget.maxAgents})`);

  const at = () => new Date().toISOString();
  opts.emit({ type: "run.started", analysisId: baseCtx.analysisId, at: at(), plan: plan.agents.map((a) => ({ type: a.type, label: a.label, domain: a.domain, dependsOn: a.dependsOn })) });

  const pending = new Map(plan.agents.map((a) => [a.type, a]));
  const done = new Set<string>();
  const running = new Map<string, Promise<void>>();
  const totalTimer = setTimeout(() => controller.abort(new Error("Total time budget exceeded")), budget.maxTotalMs);

  const runAgent = async (agent: AgentDefinition): Promise<void> => {
    const deps = agent.dependsOn;
    const missingDep = deps.find((d) => failed.includes(d) || (skipped.includes(d) && !notNeeded.has(d)));
    const ctx: AgentContext = {
      ...baseCtx,
      outputs,
      signal: controller.signal,
      progress: (message) => opts.emit({ type: "task.progress", analysisId: baseCtx.analysisId, at: at(), task: agent.type, message }),
      tool: async (name, input, fn) => {
        const t0 = Date.now();
        try {
          const r = await fn();
          currentTools.push({ tool: name, input, ok: true, durationMs: Date.now() - t0 });
          return r;
        } catch (e) {
          currentTools.push({ tool: name, input, ok: false, durationMs: Date.now() - t0, note: e instanceof Error ? e.message : String(e) });
          throw e;
        }
      },
    };
    const currentTools: ToolCallRecord[] = [];
    if (missingDep) {
      skipped.push(agent.type);
      opts.emit({ type: "task.skipped", analysisId: baseCtx.analysisId, at: at(), task: agent.type, label: agent.label, reason: `Depende de ${missingDep}, que no se completó.` });
      return;
    }
    if (agent.when && !agent.when(ctx)) {
      skipped.push(agent.type);
      notNeeded.add(agent.type);
      opts.emit({ type: "task.skipped", analysisId: baseCtx.analysisId, at: at(), task: agent.type, label: agent.label, reason: "No necesario para este activo." });
      return;
    }

    const record: AgentRunRecord = {
      id: newId("arun"),
      organizationId: baseCtx.organizationId,
      userId: baseCtx.userId,
      dealId: baseCtx.dealId,
      analysisId: baseCtx.analysisId,
      agentType: agent.type,
      domain: agent.domain,
      label: agent.label,
      orchestratorRunId,
      input: { dependsOn: deps },
      structuredOutput: null,
      toolCalls: currentTools,
      evidenceIds: [],
      latencyMs: 0,
      status: "running",
      startedAt: at(),
      attempts: 0,
    };
    opts.emit({ type: "task.started", analysisId: baseCtx.analysisId, at: record.startedAt, task: agent.type, label: agent.label, domain: agent.domain });
    const evidenceBefore = new Set(baseCtx.evidence.all().map((e) => e.id));
    const t0 = Date.now();
    let lastError: unknown;
    for (let attempt = 1; attempt <= budget.maxRetries + 1; attempt++) {
      record.attempts = attempt;
      if (controller.signal.aborted) break;
      try {
        const result = await withTimeout(agent.run(ctx), agent.timeoutMs ?? budget.maxAgentMs, controller.signal);
        const parsed = agent.outputSchema ? agent.outputSchema.parse(result) : result;
        outputs.set(agent.type, parsed);
        record.structuredOutput = parsed;
        record.status = "completed";
        record.completedAt = at();
        record.latencyMs = Date.now() - t0;
        record.evidenceIds = baseCtx.evidence.all().filter((e) => !evidenceBefore.has(e.id)).map((e) => e.id);
        const summary = summarize(parsed);
        opts.emit({ type: "task.completed", analysisId: baseCtx.analysisId, at: record.completedAt, task: agent.type, label: agent.label, domain: agent.domain, latencyMs: record.latencyMs, summary, partial: parsed });
        lastError = undefined;
        break;
      } catch (e) {
        lastError = e;
        baseCtx.logger.warn("agent.failed", { agent: agent.type, attempt, error: e instanceof Error ? e.message : String(e) });
      }
    }
    if (lastError !== undefined) {
      record.status = lastError instanceof TimeoutError ? "timeout" : "failed";
      record.error = lastError instanceof Error ? lastError.message : String(lastError);
      record.completedAt = at();
      record.latencyMs = Date.now() - t0;
      failed.push(agent.type);
      opts.emit({ type: "task.failed", analysisId: baseCtx.analysisId, at: record.completedAt, task: agent.type, label: agent.label, domain: agent.domain, error: record.error, fatal: Boolean(agent.critical) });
      if (agent.critical) controller.abort(new Error(`Critical agent failed: ${agent.type}`));
    }
    records.push(record);
    opts.onRunRecord?.(record);
  };

  try {
    while (pending.size > 0 && !controller.signal.aborted) {
      const ready = [...pending.values()].filter((a) => a.dependsOn.every((d) => done.has(d)));
      if (ready.length === 0 && running.size === 0) throw new DependencyError("Deadlock: no runnable agents");
      for (const agent of ready) {
        pending.delete(agent.type);
        const p = runAgent(agent).finally(() => {
          done.add(agent.type);
          running.delete(agent.type);
        });
        running.set(agent.type, p);
      }
      if (running.size > 0) await Promise.race([...running.values()]);
    }
    await Promise.all([...running.values()]);
  } finally {
    clearTimeout(totalTimer);
  }
  const aborted = controller.signal.aborted;
  const durationMs = Date.now() - started;
  if (aborted) opts.emit({ type: "run.failed", analysisId: baseCtx.analysisId, at: at(), error: String(controller.signal.reason instanceof Error ? controller.signal.reason.message : controller.signal.reason) });
  else opts.emit({ type: "run.completed", analysisId: baseCtx.analysisId, at: at(), durationMs });
  return { outputs, records, failed, skipped, durationMs, aborted };
}

export class TimeoutError extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError(`Timed out after ${ms} ms`)), ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error("Aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        clearTimeout(t);
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

export function validatePlan(plan: RunPlan) {
  const types = new Set(plan.agents.map((a) => a.type));
  if (types.size !== plan.agents.length) throw new Error("Duplicate agent types in plan");
  for (const a of plan.agents) for (const d of a.dependsOn) if (!types.has(d)) throw new Error(`Agent ${a.type} depends on unknown ${d}`);
  // cycle detection (Kahn)
  const indeg = new Map<string, number>();
  for (const a of plan.agents) indeg.set(a.type, a.dependsOn.length);
  const queue = [...indeg.entries()].filter(([, n]) => n === 0).map(([t]) => t);
  let visited = 0;
  while (queue.length) {
    const t = queue.shift()!;
    visited++;
    for (const a of plan.agents) if (a.dependsOn.includes(t)) {
      const n = (indeg.get(a.type) ?? 0) - 1;
      indeg.set(a.type, n);
      if (n === 0) queue.push(a.type);
    }
  }
  if (visited !== plan.agents.length) throw new Error("Cycle detected in agent plan");
}

function summarize(v: unknown): string | undefined {
  if (v && typeof v === "object" && "summary" in v && typeof (v as { summary: unknown }).summary === "string") return (v as { summary: string }).summary;
  return undefined;
}
