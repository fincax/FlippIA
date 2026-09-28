import { cn } from "@/lib/cn";

/**
 * LIA is a presence, not a face. A point, a halo, a rhythm.
 *
 * Purely presentational: the state is a prop, never derived from agent logic.
 *   idle        — a still point.
 *   listening   — the halo breathes.
 *   processing  — a dashed orbit turns while the halo breathes faster.
 *   revealing   — the halo expands once and settles.
 *   alert       — the point hardens and blinks in the danger colour.
 */
export type LiaState = "idle" | "listening" | "processing" | "revealing" | "alert";

export function LIAPulse({
  state = "idle",
  size = 14,
  className,
  label,
}: {
  state?: LiaState;
  size?: number;
  className?: string;
  /** Accessible text. Defaults to a Spanish description of the state. */
  label?: string;
}) {
  const box = size * 3;
  const c = box / 2;
  const color = state === "alert" ? "var(--color-danger)" : "var(--color-accent)";
  const text =
    label ??
    {
      idle: "LIA en espera",
      listening: "LIA escuchando",
      processing: "LIA procesando",
      revealing: "LIA ha encontrado algo",
      alert: "LIA alerta",
    }[state];
  return (
    <span
      role="img"
      aria-label={text}
      className={cn("inline-grid place-items-center shrink-0", className)}
      style={{ width: box, height: box }}
      data-lia-state={state}
    >
      <svg viewBox={`0 0 ${box} ${box}`} width={box} height={box} aria-hidden className="overflow-visible">
        {state !== "idle" ? (
          <circle
            cx={c}
            cy={c}
            r={size * 0.9}
            fill={color}
            className={cn(
              state === "revealing" ? "anim-verify" : "anim-breathe",
              state === "processing" && "[animation-duration:1.4s]",
            )}
            style={{ transformOrigin: `${c}px ${c}px`, opacity: state === "revealing" ? 0.18 : undefined }}
          />
        ) : null}
        {state === "processing" ? (
          <circle
            cx={c}
            cy={c}
            r={size * 1.25}
            fill="none"
            stroke={color}
            strokeWidth={1}
            strokeDasharray="3 5"
            strokeOpacity={0.7}
            className="anim-rotate [animation-duration:6s]"
            style={{ transformOrigin: `${c}px ${c}px` }}
          />
        ) : null}
        {state === "revealing" ? (
          <circle
            cx={c}
            cy={c}
            r={size * 1.3}
            fill="none"
            stroke={color}
            strokeWidth={1}
            strokeOpacity={0.6}
            className="anim-verify"
            style={{ transformOrigin: `${c}px ${c}px` }}
          />
        ) : null}
        <circle
          cx={c}
          cy={c}
          r={size * 0.36}
          fill={color}
          className={cn(state === "alert" && "anim-alert")}
        />
      </svg>
    </span>
  );
}
