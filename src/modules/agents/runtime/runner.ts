import { ZodError } from "zod";
import { newId } from "@/modules/core/ids";
import { EvidenceCollector } from "@/modules/evidence/store";
import type { Evidence } from "@/modules/evidence/types";
import type { NewEvidence } from "@/modules/evidence/store";
import type {
  AgentContext,
  AgentDefinition,
  AgentRunRecord,
  AnalysisEvent,
  Budget,
  ToolCallRecord,
} from "./types";
import { DEFAULT_BUDGET } from "./types";

export interface RunPlan {
  agents: AgentDefinition[];
}

export interface RunOptions {
  budget?: Partial<Budget>;
  emit: (event: AnalysisEvent) => void;
  onRunRecord?: (record: AgentRunRecord) => void;
  /** External cancellation (e.g. the HTTP client disconnected). Aborts the whole plan. */
  signal?: AbortSignal;
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
 * Evidence written by one attempt of one agent. Reads see the shared
 * collector plus this attempt's own records; writes stay local until the
 * attempt succeeds, when they are promoted to the shared collector. An attempt
 * that timed out (or failed) can keep running in the background and keep
 * adding evidence here, but nothing of it ever reaches the shared collector,
 * so a retry never double-counts it.
 */
class AttemptEvidence extends EvidenceCollector {
  constructor(private readonly shared: EvidenceCollector) {
    super();
  }
  override get(id: string): Evidence | undefined {
    return super.get(id) ?? this.shared.get(id);
  }
  override all(): Evidence[] {
    const mine = super.all();
    const own = new Set(mine.map((e) => e.id));
    return [...this.shared.all().filter((e) => !own.has(e.id)), ...mine];
  }
  override byIds(ids: string[]): Evidence[] {
    return ids.map((id) => this.get(id)).filter((e): e is Evidence => Boolean(e));
  }
  override addMany(inputs: NewEvidence[]): Evidence[] {
    return inputs.map((i) => this.add(i));
  }
  /** Records written by this attempt only. */
  staged(): Evidence[] {
    return super.all();
  }
  /** Promote this attempt's records to the shared collector (on success). */
  commit(): Evidence[] {
    const mine = this.staged();
    this.shared.attach(mine);
    return mine;
  }
}

/**
 * Deterministic failures are not retried: the same input produces the same
 * output, so a second attempt only burns budget. Today that is output-schema
 * validation (zod); transport errors, timeouts and generic errors are retried.
 */
export function isRetryableFailure(e: unknown): boolean {
  if (e instanceof ZodError) return false;
  return true;
}

/**
 * Core Orchestrator execution engine.
 * - Validates the DAG (no cycles, no unknown deps).
 * - Runs every agent whose dependencies are satisfied, in parallel.
 * - Enforces budgets: agent count, per-agent timeout, total time, retries.
 * - Records AgentRuns and emits observable events. No unbounded loops.
 */
export async function executePlan(
  plan: RunPlan,
  baseCtx: Omit<AgentContext, "outputs" | "progress" | "tool" | "signal">,
  opts: RunOptions,
): Promise<RunOutcome> {
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
  const onExternalAbort = () => controller.abort(opts.signal?.reason ?? new Error("Analysis cancelled"));
  if (opts.signal?.aborted) onExternalAbort();
  else opts.signal?.addEventListener("abort", onExternalAbort, { once: true });

  validatePlan(plan);
  if (plan.agents.length > budget.maxAgents)
    throw new Error(`Plan exceeds agent budget (${plan.agents.length} > ${budget.maxAgents})`);

  const at = () => new Date().toISOString();
  opts.emit({
    type: "run.started",
    analysisId: baseCtx.analysisId,
    at: at(),
    plan: plan.agents.map((a) => ({
      type: a.type,
      label: a.label,
      domain: a.domain,
      dependsOn: a.dependsOn,
    })),
  });

  const pending = new Map(plan.agents.map((a) => [a.type, a]));
  const done = new Set<string>();
  const running = new Map<string, Promise<void>>();
  const totalTimer = setTimeout(
    () => controller.abort(new Error("Total time budget exceeded")),
    budget.maxTotalMs,
  );

  const runAgent = async (agent: AgentDefinition): Promise<void> => {
    const deps = agent.dependsOn;
    const missingDep = deps.find((d) => failed.includes(d) || (skipped.includes(d) && !notNeeded.has(d)));
    const ctx: AgentContext = {
      ...baseCtx,
      outputs,
      signal: controller.signal,
      progress: (message) =>
        opts.emit({
          type: "task.progress",
          analysisId: baseCtx.analysisId,
          at: at(),
          task: agent.type,
          message,
        }),
      tool: async (name, input, fn) => {
        const t0 = Date.now();
        try {
          const r = await fn();
          currentTools.push({ tool: name, input, ok: true, durationMs: Date.now() - t0 });
          return r;
        } catch (e) {
          currentTools.push({
            tool: name,
            input,
            ok: false,
            durationMs: Date.now() - t0,
            note: e instanceof Error ? e.message : String(e),
          });
          throw e;
        }
      },
    };
    const currentTools: ToolCallRecord[] = [];
    if (missingDep) {
      skipped.push(agent.type);
      opts.emit({
        type: "task.skipped",
        analysisId: baseCtx.analysisId,
        at: at(),
        task: agent.type,
        label: agent.label,
        reason: `Depende de ${missingDep}, que no se completó.`,
      });
      return;
    }
    if (agent.when && !agent.when(ctx)) {
      skipped.push(agent.type);
      notNeeded.add(agent.type);
      opts.emit({
        type: "task.skipped",
        analysisId: baseCtx.analysisId,
        at: at(),
        task: agent.type,
        label: agent.label,
        reason: "No necesario para este activo.",
      });
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
    opts.emit({
      type: "task.started",
      analysisId: baseCtx.analysisId,
      at: record.startedAt,
      task: agent.type,
      label: agent.label,
      domain: agent.domain,
    });
    const t0 = Date.now();
    let lastError: unknown;
    let completed = false;
    for (let attempt = 1; attempt <= budget.maxRetries + 1; attempt++) {
      record.attempts = attempt;
      if (controller.signal.aborted) break;
      // Each attempt gets its own signal (aborted on timeout or run abort) and
      // its own evidence staging area, so a late-completing timed-out attempt
      // can neither pollute the shared collector nor be counted twice.
      const attemptCtrl = new AbortController();
      const onRunAbort = () => attemptCtrl.abort(controller.signal.reason);
      controller.signal.addEventListener("abort", onRunAbort, { once: true });
      const staging = new AttemptEvidence(baseCtx.evidence);
      const attemptCtx: AgentContext = { ...ctx, signal: attemptCtrl.signal, evidence: staging };
      try {
        const result = await withTimeout(
          agent.run(attemptCtx),
          agent.timeoutMs ?? budget.maxAgentMs,
          controller.signal,
        );
        const parsed = agent.outputSchema ? agent.outputSchema.parse(result) : result;
        outputs.set(agent.type, parsed);
        record.structuredOutput = parsed;
        record.status = "completed";
        record.completedAt = at();
        record.latencyMs = Date.now() - t0;
        record.evidenceIds = staging.commit().map((e) => e.id);
        completed = true;
        const summary = summarize(parsed);
        opts.emit({
          type: "task.completed",
          analysisId: baseCtx.analysisId,
          at: record.completedAt,
          task: agent.type,
          label: agent.label,
          domain: agent.domain,
          latencyMs: record.latencyMs,
          summary,
          partial: parsed,
        });
        lastError = undefined;
        break;
      } catch (e) {
        lastError = e;
        // Stop whatever the attempt is still doing; its staged evidence is discarded.
        attemptCtrl.abort(e instanceof Error ? e : new Error(String(e)));
        baseCtx.logger.warn("agent.failed", {
          agent: agent.type,
          attempt,
          error: e instanceof Error ? e.message : String(e),
        });
        if (!isRetryableFailure(e)) break;
      } finally {
        controller.signal.removeEventListener("abort", onRunAbort);
      }
    }
    const cancelled =
      !completed &&
      controller.signal.aborted &&
      (lastError === undefined || lastError instanceof AbortedError);
    if (cancelled) {
      // Cancelled by the run (external signal or total time budget), not a failure of its own.
      record.status = "skipped";
      record.completedAt = at();
      record.latencyMs = Date.now() - t0;
      skipped.push(agent.type);
      opts.emit({
        type: "task.skipped",
        analysisId: baseCtx.analysisId,
        at: record.completedAt,
        task: agent.type,
        label: agent.label,
        reason: "Cancelado",
      });
    } else if (lastError !== undefined) {
      record.status = lastError instanceof TimeoutError ? "timeout" : "failed";
      record.error = lastError instanceof Error ? lastError.message : String(lastError);
      record.completedAt = at();
      record.latencyMs = Date.now() - t0;
      failed.push(agent.type);
      opts.emit({
        type: "task.failed",
        analysisId: baseCtx.analysisId,
        at: record.completedAt,
        task: agent.type,
        label: agent.label,
        domain: agent.domain,
        error: record.error,
        fatal: Boolean(agent.critical),
      });
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
  if (aborted) {
    // Agents never scheduled: tell the UI so no task stays "pending" forever.
    for (const agent of pending.values()) {
      skipped.push(agent.type);
      opts.emit({
        type: "task.skipped",
        analysisId: baseCtx.analysisId,
        at: at(),
        task: agent.type,
        label: agent.label,
        reason: "Cancelado",
      });
    }
    pending.clear();
  }
  const durationMs = Date.now() - started;
  if (aborted)
    opts.emit({
      type: "run.failed",
      analysisId: baseCtx.analysisId,
      at: at(),
      error: String(
        controller.signal.reason instanceof Error
          ? controller.signal.reason.message
          : controller.signal.reason,
      ),
    });
  else opts.emit({ type: "run.completed", analysisId: baseCtx.analysisId, at: at(), durationMs });
  return { outputs, records, failed, skipped, durationMs, aborted };
}

export class TimeoutError extends Error {}
/** The run was cancelled while the attempt was in flight. */
export class AbortedError extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      reject(new TimeoutError(`Timed out after ${ms} ms`));
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new AbortedError("Aborted"));
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
  for (const a of plan.agents)
    for (const d of a.dependsOn)
      if (!types.has(d)) throw new Error(`Agent ${a.type} depends on unknown ${d}`);
  // cycle detection (Kahn)
  const indeg = new Map<string, number>();
  for (const a of plan.agents) indeg.set(a.type, a.dependsOn.length);
  const queue = [...indeg.entries()].filter(([, n]) => n === 0).map(([t]) => t);
  let visited = 0;
  while (queue.length) {
    const t = queue.shift()!;
    visited++;
    for (const a of plan.agents)
      if (a.dependsOn.includes(t)) {
        const n = (indeg.get(a.type) ?? 0) - 1;
        indeg.set(a.type, n);
        if (n === 0) queue.push(a.type);
      }
  }
  if (visited !== plan.agents.length) throw new Error("Cycle detected in agent plan");
}

function summarize(v: unknown): string | undefined {
  if (v && typeof v === "object" && "summary" in v && typeof (v as { summary: unknown }).summary === "string")
    return (v as { summary: string }).summary;
  return undefined;
}
