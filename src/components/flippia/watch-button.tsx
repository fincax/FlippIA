"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ds";
import { api } from "@/lib/client";

export function WatchButton({
  dealId,
  listingId,
  label,
  price,
}: {
  dealId?: string;
  listingId?: string;
  label: string;
  price?: number;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        size="md"
        variant={state === "done" ? "secondary" : "accent"}
        loading={state === "busy"}
        disabled={state === "done"}
        onClick={async () => {
          setState("busy");
          const rules = [
            { kind: "meets_criteria" },
            { kind: "price_drop_pct", value: 0.05 },
            ...(price ? [{ kind: "price_below", value: Math.round(price * 0.95) }] : []),
            { kind: "regulation_change" },
          ];
          const r = await api("/api/watches", {
            body: { dealId, listingId, label: `Vigilar ${label}`, rules },
          });
          setState(r.ok ? "done" : "idle");
          setError(r.ok ? null : (r.error?.message ?? "No hemos podido crear la vigilancia."));
          if (r.ok) router.refresh();
        }}
      >
        {state === "done" ? "Vigilando" : "Vigilar este deal"}
      </Button>
      {error ? (
        <span role="alert" className="text-[12px] text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
