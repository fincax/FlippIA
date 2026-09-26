"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ds";
import { api } from "@/lib/client";

export function ReviewForm({ dealId, analysisId }: { dealId: string; analysisId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const fd = new FormData(e.currentTarget);
        const r = await api("/api/reviews", {
          body: {
            dealId,
            analysisId,
            role: fd.get("role"),
            scope: fd.get("scope"),
            status: fd.get("status"),
            professionalId: fd.get("professionalId") || undefined,
            comments: fd.get("comments") ?? "",
          },
        });
        setBusy(false);
        setMsg(r.ok ? "Revisión registrada." : (r.error?.message ?? "Error"));
        if (r.ok) router.refresh();
      }}
    >
      <Field label="Rol">
        <Select name="role" defaultValue="technical">
          <option value="technical">Técnica</option>
          <option value="architect">Arquitecto</option>
          <option value="real_estate">Inmobiliaria</option>
          <option value="legal">Legal</option>
          <option value="tax">Fiscal</option>
        </Select>
      </Field>
      <Field label="Alcance">
        <Input name="scope" required placeholder="p. ej. urbanismo y distribución" />
      </Field>
      <Field label="Resultado">
        <Select name="status" defaultValue="approved">
          <option value="approved">Aprobado</option>
          <option value="changes_requested">Cambios necesarios</option>
          <option value="rejected">Rechazado</option>
        </Select>
      </Field>
      <Field label="Nº colegiado (opcional)">
        <Input name="professionalId" />
      </Field>
      <Field label="Comentario" className="sm:col-span-2 lg:col-span-3">
        <Textarea name="comments" rows={2} />
      </Field>
      <Button type="submit" variant="accent" loading={busy}>
        Registrar
      </Button>
      {msg ? (
        <p className="text-[12px] text-fg-2 sm:col-span-4" role="status">
          {msg}
        </p>
      ) : null}
    </form>
  );
}
