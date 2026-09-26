import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { EvidenceStatus } from "@/modules/core/evidence-status";
import { EVIDENCE_STATUS_LABEL } from "@/modules/core/evidence-status";

export function Badge({
  children,
  tone = "neutral",
  className,
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger" | "info";
  className?: string;
  title?: string;
}) {
  const tones = {
    neutral: "bg-surface-raised text-fg-2 border-line",
    accent: "bg-accent-soft text-accent border-accent/30",
    success: "bg-success/12 text-success border-success/30",
    warning: "bg-warning/12 text-warning border-warning/30",
    danger: "bg-danger/12 text-danger border-danger/30",
    info: "bg-inferred/12 text-inferred border-inferred/30",
  };
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONE: Record<EvidenceStatus, "success" | "info" | "warning" | "danger" | "neutral"> = {
  VERIFIED: "success",
  INFERRED: "info",
  REVIEW_REQUIRED: "warning",
  CONFLICT: "danger",
  UNKNOWN: "neutral",
};

/** The evidence traffic light. */
export function EvidenceBadge({ status, className }: { status: EvidenceStatus; className?: string }) {
  const meta = EVIDENCE_STATUS_LABEL[status];
  return (
    <Badge tone={STATUS_TONE[status]} className={className} title={meta.description}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {meta.es}
    </Badge>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge
      tone="warning"
      className={className}
      title="Datos sintéticos de demostración. Nunca se presentan como reales."
    >
      DEMO
    </Badge>
  );
}

export function FreshnessBadge({
  lastVerified,
  lastSourceUpdate,
  className,
}: {
  lastVerified?: string;
  lastSourceUpdate?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex flex-wrap gap-x-3 text-[11px] text-fg-3", className)}>
      {lastSourceUpdate ? <span>Fuente: {lastSourceUpdate}</span> : null}
      {lastVerified ? <span>Verificado: {lastVerified}</span> : null}
    </span>
  );
}

export function VerificationBadge({
  level,
  label,
  meaning,
}: {
  level: string;
  label: string;
  meaning: string;
}) {
  return (
    <Badge
      tone={level === "verified" ? "success" : level === "ai_precheck" ? "neutral" : "accent"}
      title={meaning}
    >
      {label}
    </Badge>
  );
}
