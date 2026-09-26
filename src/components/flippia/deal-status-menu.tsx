"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Select } from "@/components/ds";
import { api } from "@/lib/client";

const OPTIONS: Array<[string, string]> = [
  ["draft", "Borrador"],
  ["analyzing", "Analizando"],
  ["analyzed", "Analizado"],
  ["watching", "Vigilado"],
  ["approved", "Aprobado"],
  ["rejected", "Descartado"],
  ["acquired", "Adquirido"],
  ["project", "Proyecto (Execution mode)"],
  ["closed", "Cerrado"],
];

export function DealStatusMenu({
  dealId,
  status,
  intakeText,
}: {
  dealId: string;
  status: string;
  intakeText: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2 no-print">
      <Select
        aria-label="Estado del deal"
        value={status}
        disabled={busy}
        className="w-auto h-9"
        onChange={async (e) => {
          setBusy(true);
          setError(null);
          const r = await api(`/api/deals/${dealId}/status`, { body: { status: e.target.value } });
          setBusy(false);
          if (r.ok) router.refresh();
          else setError(r.error?.message ?? "No hemos podido cambiar el estado.");
        }}
      >
        {OPTIONS.map(([v, l]) => (
          <option key={v} value={v} disabled={v === "analyzing"}>
            {l}
          </option>
        ))}
      </Select>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => router.push(`/app/analyze?q=${encodeURIComponent(intakeText)}&deal=${dealId}`)}
      >
        Reanalizar
      </Button>
      {error ? (
        <span role="alert" className="text-[12px] text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
