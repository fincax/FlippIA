"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

interface Item {
  label: string;
  hint?: string;
  run: () => void;
}

/** ⌘K palette: navigate, analyze, ask LIA. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [open]);
  const close = () => {
    setOpen(false);
    setQ("");
    setIdx(0);
  };

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => {
      setOpen(false);
      router.push(href);
    };
    const base: Item[] = [
      {
        label: "Analizar propiedad",
        hint: "dirección, referencia o URL",
        run: () => {
          setOpen(false);
          router.push(q.trim() ? `/app/analyze?q=${encodeURIComponent(q)}` : "/");
        },
      },
      { label: "Crear oportunidad", hint: "desde texto libre", run: go("/") },
      { label: "Buscar deal", run: go("/app/deals") },
      { label: "Preguntar a LIA", run: go("/") },
      { label: "Radar de oportunidades", run: go("/app/radar") },
      { label: "Vigilancia", run: go("/app/watch") },
      { label: "Comparar escenarios", hint: "dentro de un deal", run: go("/app/deals") },
      { label: "Investor DNA", run: go("/app/onboarding") },
      { label: "Panel de agentes", run: go("/app/observability") },
    ];
    const n = q.trim().toLowerCase();
    if (!n) return base;
    const filtered = base.filter(
      (i) => i.label.toLowerCase().includes(n) || i.hint?.toLowerCase().includes(n),
    );
    return [
      {
        label: `Analizar «${q.trim()}»`,
        hint: "LIA construye el caso",
        run: () => {
          setOpen(false);
          router.push(`/app/analyze?q=${encodeURIComponent(q.trim())}`);
        },
      },
      ...filtered,
    ];
  }, [q, router]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-4 pt-[12vh]"
      onClick={close}
      role="dialog"
      aria-modal
      aria-label="Paleta de comandos"
    >
      <div
        className="mx-auto max-w-lg rounded-[var(--radius-lg)] border border-line-strong bg-surface shadow-[var(--shadow-soft)] overflow-hidden anim-rise"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 h-12 border-b border-line">
          <span className="text-accent">◆</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIdx((i) => Math.min(items.length - 1, i + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIdx((i) => Math.max(0, i - 1));
              }
              if (e.key === "Enter") {
                e.preventDefault();
                items[idx]?.run();
              }
            }}
            placeholder="Escribe una acción, dirección o pregunta…"
            className="flex-1 bg-transparent outline-none text-sm text-fg placeholder:text-fg-3"
          />
          <kbd className="text-[10px] text-fg-3 border border-line rounded px-1.5 py-0.5">esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto py-1">
          {items.map((it, i) => (
            <li key={it.label}>
              <button
                type="button"
                onMouseEnter={() => setIdx(i)}
                onClick={it.run}
                className={cn(
                  "w-full text-left px-4 py-2.5 text-sm flex items-center justify-between gap-3",
                  i === idx ? "bg-surface-raised text-fg" : "text-fg-2",
                )}
              >
                <span>{it.label}</span>
                {it.hint ? <span className="text-[11px] text-fg-3">{it.hint}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
