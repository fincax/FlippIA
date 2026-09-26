"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Select } from "@/components/ds";
import { api } from "@/lib/client";

const OPTIONS: Array<[string, string]> = [
  ["draft", "Borrador"],
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
  return (
    <div className="flex items-center gap-2 no-print">
      <Select
        aria-label="Estado del deal"
        value={status}
        disabled={busy}
        className="w-auto h-9"
        onChange={async (e) => {
          setBusy(true);
          await api(`/api/deals/${dealId}/status`, { body: { status: e.target.value } });
          setBusy(false);
          router.refresh();
        }}
      >
        {OPTIONS.map(([v, l]) => (
          <option key={v} value={v}>
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
    </div>
  );
}
