"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ds";
import { api } from "@/lib/client";

export function WatchActions({ watchId }: { watchId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (watchId) {
    return (
      <div className="mt-2">
        <Button
          size="sm"
          variant="ghost"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            await api(`/api/watches/${watchId}`, { method: "DELETE" });
            setBusy(false);
            router.refresh();
          }}
        >
          Dejar de vigilar
        </Button>
      </div>
    );
  }
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        await api("/api/watches/evaluate", { method: "POST" });
        setBusy(false);
        router.refresh();
      }}
    >
      Evaluar ahora
    </Button>
  );
}
