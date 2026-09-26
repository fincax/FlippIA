"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ds";
import { api } from "@/lib/client";

export function WatchActions({ watchId }: { watchId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(path: string, method: string) {
    setBusy(true);
    setError(null);
    const r = await api(path, { method });
    setBusy(false);
    if (r.ok) router.refresh();
    else setError(r.error?.message ?? "No hemos podido completar la operación.");
  }
  const alert = error ? (
    <span role="alert" className="block text-[12px] text-danger mt-1">
      {error}
    </span>
  ) : null;
  if (watchId) {
    return (
      <div className="mt-2">
        <Button
          size="sm"
          variant="ghost"
          loading={busy}
          onClick={() => run(`/api/watches/${watchId}`, "DELETE")}
        >
          Dejar de vigilar
        </Button>
        {alert}
      </div>
    );
  }
  return (
    <span className="inline-flex flex-col">
      <Button
        size="sm"
        variant="secondary"
        loading={busy}
        onClick={() => run("/api/watches/evaluate", "POST")}
      >
        Evaluar ahora
      </Button>
      {alert}
    </span>
  );
}
