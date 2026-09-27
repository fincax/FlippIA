"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/client";
import type { LiaAction } from "@/modules/lia/router";

const ACTIONS = [
  {
    label: "Analizar un inmueble",
    fill: "Analiza Calle Pureza 45, Triana, 95 m2, 3 habitaciones, para reformar por 255.000 €",
  },
  {
    label: "Encontrar oportunidad",
    fill: "Busca oportunidades en Triana y Los Remedios con menos de 250.000 €",
  },
  {
    label: "Tengo capital",
    fill: "Tengo 300.000 €. Quiero aportar máximo 120.000 €. Sevilla. Horizonte inferior a 12 meses.",
  },
  {
    label: "Buscar para un proyecto",
    fill: "Busco un local en Triana o la Alameda de hasta 200.000 € para convertirlo en vivienda",
  },
  { label: "Optimizar inversión", fill: "Optimiza mi última operación" },
];

/** FlippIACommand: the single entry point. Address, cadastral reference, listing or objective. */
export function FlippIACommand({
  size = "lg",
  autoFocus,
  initial = "",
  className,
  showActions = true,
}: {
  size?: "md" | "lg";
  autoFocus?: boolean;
  initial?: string;
  className?: string;
  showActions?: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<{ message: string; suggestions?: string[] } | null>(null);

  async function submit(value = text) {
    const q = value.trim();
    if (!q) return;
    setBusy(true);
    setReply(null);
    const r = await api<LiaAction>("/api/command", { body: { text: q } });
    setBusy(false);
    if (!r.ok) {
      if (r.error?.code === "UNAUTHORIZED")
        return router.push(`/login?next=${encodeURIComponent(`/app/analyze?q=${encodeURIComponent(q)}`)}`);
      return setReply({ message: r.error?.message ?? "No hemos podido procesar la petición." });
    }
    const a = r.data!;
    if (a.kind === "analyze") return router.push(`/app/analyze?q=${encodeURIComponent(q)}`);
    if (a.kind === "radar") return router.push(`/app/radar?q=${encodeURIComponent(q)}`);
    if (a.kind === "onboarding") return router.push("/app/onboarding");
    setReply({ message: a.message, suggestions: a.suggestions });
  }

  return (
    <div className={cn("w-full", className)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className={cn(
          "group relative flex items-center rounded-[var(--radius-lg)] border border-line-strong bg-surface shadow-[var(--shadow-soft)] focus-within:border-accent transition-colors",
          size === "lg" ? "h-16 md:h-[76px] px-4 md:px-6" : "h-12 px-4",
        )}
      >
        <span
          aria-hidden
          className={cn("mr-3 text-accent anim-pulse", size === "lg" ? "text-xl" : "text-base")}
        >
          ◆
        </span>
        <input
          aria-label="Qué quieres descubrir"
          autoFocus={autoFocus}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Dirección, referencia catastral, inmueble o dime qué inversión buscas…"
          className={cn(
            "flex-1 bg-transparent outline-none text-fg placeholder:text-fg-3 min-w-0",
            size === "lg" ? "text-base md:text-xl" : "text-sm",
          )}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={busy}
          className={cn(
            "ml-3 shrink-0 rounded-[var(--radius-md)] bg-fg text-bg font-medium disabled:opacity-60",
            size === "lg" ? "h-10 px-4 text-sm" : "h-8 px-3 text-[13px]",
          )}
        >
          {busy ? "…" : "Descubrir"}
        </button>
      </form>
      {showActions ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {ACTIONS.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => {
                setText(a.fill);
                void submit(a.fill);
              }}
              className="rounded-full border border-line px-3 py-1.5 text-[13px] text-fg-2 hover:text-fg hover:border-line-strong transition-colors"
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
      {reply ? (
        <div
          className="mt-4 rounded-[var(--radius-md)] border border-line bg-surface p-4 anim-rise"
          role="status"
        >
          <div className="text-[11px] uppercase tracking-[0.18em] text-accent mb-1">LIA</div>
          <p className="text-sm text-fg">{reply.message}</p>
          {reply.suggestions?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {reply.suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setText(s);
                    void submit(s);
                  }}
                  className="rounded-full border border-line px-3 py-1 text-[12px] text-fg-2 hover:text-fg"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
