"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Surface } from "@/components/ds";
import { cn } from "@/lib/cn";
import { api } from "@/lib/client";
import { formatRelative } from "@/lib/format";

export interface AlertItem {
  id: string;
  title: string;
  body: string;
  severity: "info" | "opportunity" | "risk";
  dealId: string | null;
  read: boolean;
  createdAt: string;
  payload: Record<string, unknown>;
}

export function AlertList({ alerts }: { alerts: AlertItem[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!alerts.length)
    return (
      <Surface className="p-6 text-sm text-fg-2">
        Nada requiere tu atención ahora mismo. Cuando una propiedad vigilada cambie de precio, una norma
        cambie o un riesgo aparezca, lo verás aquí con su motivo.
      </Surface>
    );
  return (
    <>
      <ul className="space-y-2">
        {alerts.map((a) => {
          const href = a.dealId
            ? `/app/deals/${a.dealId}`
            : a.payload.listingId
              ? `/app/radar?listing=${String(a.payload.listingId)}`
              : "/app/watch";
          return (
            <li key={a.id}>
              <Surface className={cn("p-4", a.read && "opacity-70")}>
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1.5 size-2 rounded-full shrink-0",
                      a.severity === "opportunity"
                        ? "bg-success"
                        : a.severity === "risk"
                          ? "bg-danger"
                          : "bg-fg-3",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-fg">{a.title}</div>
                    <p className="text-[13px] text-fg-2 mt-0.5">{a.body}</p>
                    <div className="mt-2 flex items-center gap-3 text-[12px]">
                      <Link href={href} className="text-accent">
                        Ver motivo →
                      </Link>
                      {!a.read ? (
                        <button
                          type="button"
                          className="text-fg-3 hover:text-fg"
                          disabled={pending === a.id}
                          onClick={async () => {
                            setPending(a.id);
                            const r = await api(`/api/alerts/${a.id}/read`, { method: "POST" });
                            setPending(null);
                            if (r.ok) router.refresh();
                            else setError(r.error?.message ?? "No hemos podido marcar la alerta.");
                          }}
                        >
                          Marcar leído
                        </button>
                      ) : null}
                      <span className="text-fg-3 ml-auto">{formatRelative(a.createdAt)}</span>
                    </div>
                  </div>
                </div>
              </Surface>
            </li>
          );
        })}
      </ul>
      {error ? (
        <p role="alert" className="mt-2 text-[12px] text-danger">
          {error}
        </p>
      ) : null}
    </>
  );
}
