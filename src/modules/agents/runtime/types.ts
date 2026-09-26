import type { z } from "zod";
import type { AdapterSet } from "@/modules/adapters/registry";
import type { AIProvider } from "@/modules/ai/provider";
import type { CityProfile } from "@/modules/city/types";
import type { Logger } from "@/modules/core/logger";
import type { EvidenceCollector } from "@/modules/evidence/store";

export type AgentDomain =
  | "core"
  | "opportunity"
  | "data"
  | "market"
  | "urbanism"
  | "regulatory"
  | "architecture"
  | "construction"
  | "investment"
  | "finance"
  | "tax"
  | "legal"
  | "risk"
  | "exit"
  | "acquisition"
  | "execution"
  | "sales"
  | "learning";

export type AgentRunStatus = "pending" | "running" | "completed" | "failed" | "skipped" | "timeout";

export interface ToolCallRecord {
  tool: string;
  input: Record<string, unknown>;
  ok: boolean;
  durationMs: number;
  note?: string;
}

export interface AgentRunRecord {
  id: string;
  organizationId: string;
  userId: string;
  dealId?: string;
  analysisId: string;
  agentType: string;
  domain: AgentDomain;
  label: string;
  parentRunId?: string;
  orchestratorRunId: string;
  input: Record<string, unknown>;
  structuredOutput: unknown;
  toolCalls: ToolCallRecord[];
  evidenceIds: string[];
  model?: string;
  tokenUsage?: { inputTokens: number; outputTokens: number };
  latencyMs: number;
  status: AgentRunStatus;
  startedAt: string;
  completedAt?: string;
  error?: string;
  attempts: number;
}

export interface Budget {
  maxAgents: number;
  maxTotalMs: number;
  maxAgentMs: number;
  maxRetries: number;
}

export const DEFAULT_BUDGET: Budget = { maxAgents: 60, maxTotalMs: 90_000, maxAgentMs: 20_000, maxRetries: 1 };

export type AnalysisEvent =
  | { type: "run.started"; analysisId: string; at: string; plan: Array<{ type: string; label: string; domain: AgentDomain; dependsOn: string[] }> }
  | { type: "task.started"; analysisId: string; at: string; task: string; label: string; domain: AgentDomain }
  | { type: "task.progress"; analysisId: string; at: string; task: string; message: string }
  | { type: "task.completed"; analysisId: string; at: string; task: string; label: string; domain: AgentDomain; latencyMs: number; summary?: string; partial?: unknown }
  | { type: "task.failed"; analysisId: string; at: string; task: string; label: string; domain: AgentDomain; error: string; fatal: boolean }
  | { type: "task.skipped"; analysisId: string; at: string; task: string; label: string; reason: string }
  | { type: "run.completed"; analysisId: string; at: string; durationMs: number }
  | { type: "run.failed"; analysisId: string; at: string; error: string };

export interface AgentContext {
  analysisId: string;
  organizationId: string;
  userId: string;
  dealId?: string;
  analysisDate: string;
  city: CityProfile;
  adapters: AdapterSet;
  evidence: EvidenceCollector;
  ai: AIProvider;
  logger: Logger;
  signal: AbortSignal;
  /** Outputs of completed tasks by agent type. */
  outputs: Map<string, unknown>;
  /** Emit a progress message for the running task. */
  progress: (message: string) => void;
  /** Record a tool call for observability. */
  tool: <T>(name: string, input: Record<string, unknown>, fn: () => Promise<T>) => Promise<T>;
}

export interface AgentDefinition<TOutput = unknown> {
  type: string;
  label: string;
  domain: AgentDomain;
  description: string;
  dependsOn: string[];
  /** Optional: skip when the predicate says the agent is not needed. */
  when?: (ctx: AgentContext) => boolean;
  outputSchema?: z.ZodType<TOutput>;
  run: (ctx: AgentContext) => Promise<TOutput>;
  /** Failure of this agent aborts the whole run. */
  critical?: boolean;
  timeoutMs?: number;
}

export function output<T>(ctx: AgentContext, type: string): T {
  const v = ctx.outputs.get(type);
  if (v === undefined) throw new Error(`Missing output of ${type}`);
  return v as T;
}

export function optionalOutput<T>(ctx: AgentContext, type: string): T | undefined {
  return ctx.outputs.get(type) as T | undefined;
}
