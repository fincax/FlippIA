import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Surface({
  className,
  raised,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { raised?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-line",
        raised ? "frame bg-surface-raised" : "bg-surface",
        className,
      )}
      {...rest}
    />
  );
}

export function SectionTitle({
  children,
  kicker,
  right,
  className,
}: {
  children: ReactNode;
  kicker?: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-4 mb-4", className)}>
      <div>
        {kicker ? <div className="kicker mb-1.5">{kicker}</div> : null}
        <h2 className="font-display text-xl md:text-2xl text-fg">{children}</h2>
      </div>
      {right}
    </div>
  );
}

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("kicker", className)}>{children}</div>;
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="frame rounded-[var(--radius-lg)] border border-dashed border-line p-8 text-center">
      <div className="font-display text-lg text-fg">{title}</div>
      <p className="text-sm text-fg-2 mt-2 max-w-md mx-auto">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
