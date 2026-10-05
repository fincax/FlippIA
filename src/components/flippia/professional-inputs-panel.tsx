"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Badge,
  Button,
  EvidenceBadge,
  Field,
  Input,
  Money,
  SectionTitle,
  Select,
  Surface,
  Textarea,
} from "@/components/ds";
import { api } from "@/lib/client";
import { formatDate } from "@/lib/format";
import { PROFESSIONAL_INPUT_REGISTRY, SOURCE_TYPE_META } from "@/modules/inputs/registry";
import {
  PROFESSIONAL_SOURCE_TYPES,
  type ProfessionalInput,
  type ProfessionalSourceType,
} from "@/modules/inputs/types";
import type { ProfessionalInputItemView, ProfessionalInputsView } from "@/server/services/inputs";

const slotId = (i: ProfessionalInputItemView) => `${i.key}|${i.strategyId ?? ""}`;
const num = (s: string) => {
  const v = Number(s.replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
  return s.trim() !== "" && Number.isFinite(v) ? v : undefined;
};

/**
 * Datos profesionales: the system estimate, the professional value and the
 * value the analysis uses, side by side. Editing never deletes the estimate;
 * reverting never deletes the professional entry (it stays in the history).
 */
export function ProfessionalInputsPanel({
  dealId,
  canEdit,
  view,
}: {
  dealId: string;
  canEdit: boolean;
  view: ProfessionalInputsView;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const works = view.items.filter((i) => i.scope === "strategy");
  const [worksStrategy, setWorksStrategy] = useState(works[0]?.strategyId ?? "");
  const dealItems = view.items.filter((i) => i.scope === "deal");
  const worksItem = works.find((i) => i.strategyId === worksStrategy) ?? works[0];
  const active = view.items.filter((i) => i.active && !i.error).length;

  async function revert(item: ProfessionalInputItemView) {
    setBusy(true);
    setMsg(null);
    const r = await api(`/api/deals/${dealId}/inputs`, {
      body: { action: "revert", key: item.key, strategyId: item.strategyId },
    });
    setBusy(false);
    if (r.ok) {
      setMsg(`${item.label}: el análisis vuelve a la estimación.`);
      router.refresh();
    } else setMsg(r.error?.message ?? "No hemos podido volver a la estimación.");
  }

  if (!view.hasAnalysis) return null;
  return (
    <Surface className="p-5 no-print">
      <SectionTitle
        kicker="Datos profesionales"
        right={active ? <Badge tone="accent">{active} en uso</Badge> : null}
      >
        Estimar cuando no sabemos; usar el dato real cuando existe
      </SectionTitle>
      <p className="text-[13px] text-fg-2 max-w-3xl mb-4">
        Un precio negociado o un presupuesto de obra real sustituyen a la estimación en todos los cálculos
        dependientes. La estimación se conserva y se puede volver a ella en cualquier momento.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {dealItems.map((item) => (
          <Slot
            key={slotId(item)}
            dealId={dealId}
            item={item}
            canEdit={canEdit}
            editing={editing === slotId(item)}
            busy={busy}
            onEdit={() => setEditing(slotId(item))}
            onCancel={() => setEditing(null)}
            onRevert={() => revert(item)}
            onSaved={(text) => {
              setEditing(null);
              setMsg(text);
              router.refresh();
            }}
            setBusy={setBusy}
            extra={
              item.key === "acquisition.purchasePrice" && view.maxPrice ? (
                <div className="mt-3 text-[12px] text-fg-3">
                  Precio máximo FlippIA ({view.maxPrice.strategyLabel}):{" "}
                  <Money value={view.maxPrice.maximumPrice} /> · margen{" "}
                  <Money value={view.maxPrice.headroom} signed />. El máximo es un resultado del motor; el
                  precio en uso es un dato.
                </div>
              ) : null
            }
          />
        ))}
        {worksItem ? (
          <Slot
            key={slotId(worksItem)}
            dealId={dealId}
            item={worksItem}
            canEdit={canEdit}
            editing={editing === slotId(worksItem)}
            busy={busy}
            onEdit={() => setEditing(slotId(worksItem))}
            onCancel={() => setEditing(null)}
            onRevert={() => revert(worksItem)}
            onSaved={(text) => {
              setEditing(null);
              setMsg(text);
              router.refresh();
            }}
            setBusy={setBusy}
            selector={
              works.length > 1 ? (
                <Select
                  aria-label="Estrategia"
                  className="w-auto h-8 text-[12px]"
                  value={worksItem.strategyId}
                  onChange={(e) => {
                    setWorksStrategy(e.target.value);
                    setEditing(null);
                  }}
                >
                  {works.map((w) => (
                    <option key={w.strategyId} value={w.strategyId}>
                      {w.strategyLabel}
                    </option>
                  ))}
                </Select>
              ) : (
                <span className="text-[12px] text-fg-3">{worksItem.strategyLabel}</span>
              )
            }
          />
        ) : null}
      </div>
      {msg ? (
        <p className="mt-3 text-[12px] text-fg-2" role="status">
          {msg}
        </p>
      ) : null}
      {view.history.length ? (
        <details className="mt-4 text-[12px]">
          <summary className="cursor-pointer text-fg-3">Historial ({view.history.length})</summary>
          <ul className="mt-2 space-y-1 text-fg-2">
            {view.history.map((h) => (
              <li key={h.id}>
                <HistoryLine input={h} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Surface>
  );
}

function HistoryLine({ input }: { input: ProfessionalInput }) {
  return (
    <>
      {formatDate(input.enteredAt)} · {PROFESSIONAL_INPUT_REGISTRY[input.key].label}
      {input.strategyId ? ` (${input.strategyId})` : ""}: <Money value={input.value} /> ·{" "}
      {SOURCE_TYPE_META[input.sourceType].label.toLowerCase()} · {input.enteredByName ?? input.enteredBy} ·{" "}
      {input.state === "reverted" ? "revertido" : "sustituido"}
      {input.endedAt ? ` el ${formatDate(input.endedAt)}` : ""}
      {input.reason ? ` — ${input.reason}` : ""}
    </>
  );
}

function Slot({
  dealId,
  item,
  canEdit,
  editing,
  busy,
  onEdit,
  onCancel,
  onRevert,
  onSaved,
  setBusy,
  extra,
  selector,
}: {
  dealId: string;
  item: ProfessionalInputItemView;
  canEdit: boolean;
  editing: boolean;
  busy: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onRevert: () => void;
  onSaved: (text: string) => void;
  setBusy: (b: boolean) => void;
  extra?: React.ReactNode;
  selector?: React.ReactNode;
}) {
  const a = item.active;
  return (
    <div className="rounded-[var(--radius-md)] border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-[0.14em] text-fg-3">{item.label}</div>
        {selector}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <div className="text-[11px] text-fg-3">Estimación</div>
          <div className="num text-lg">
            <Money value={item.estimate?.value ?? null} />
          </div>
          {item.estimate ? (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-fg-3">
              <EvidenceBadge status={item.estimate.status} />
              <span title={item.estimate.note}>{item.estimate.label}</span>
            </div>
          ) : null}
        </div>
        <div>
          <div className="text-[11px] text-fg-3">Profesional</div>
          <div className="num text-lg">
            {a ? <Money value={a.value} /> : <span className="text-fg-3">—</span>}
          </div>
          {a ? (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-fg-3">
              <Badge tone="accent" title={SOURCE_TYPE_META[a.sourceType].description}>
                {SOURCE_TYPE_META[a.sourceType].badge}
              </Badge>
              <span>
                {a.enteredByName ?? a.enteredBy} · {formatDate(a.enteredAt)}
              </span>
            </div>
          ) : null}
          {a?.reason ? <div className="mt-1 text-[11px] text-fg-2">{a.reason}</div> : null}
          {a?.breakdown?.length ? (
            <ul className="mt-1 text-[11px] text-fg-3">
              {a.breakdown.map((l) => (
                <li key={l.label}>
                  {l.label}: <Money value={l.amount} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div>
          <div className="text-[11px] text-accent">Usando en el análisis</div>
          <div className="num text-lg text-fg">
            <Money value={item.effective.value} />
          </div>
          <div className="mt-1 text-[11px] text-fg-3">
            {item.effective.source === "professional"
              ? "Dato profesional"
              : item.effective.source === "manual_assumption"
                ? "Hipótesis manual (escenarios)"
                : item.effective.source === "estimate"
                  ? "Estimación FlippIA"
                  : "Sin dato"}
          </div>
        </div>
      </div>
      {item.error ? (
        <p role="alert" className="mt-2 text-[12px] text-warning">
          {item.error}
        </p>
      ) : null}
      {extra}
      {canEdit && !editing ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={onEdit} disabled={busy}>
            {a ? "Editar" : "Introducir dato profesional"}
          </Button>
          {a ? (
            <Button size="sm" variant="ghost" onClick={onRevert} loading={busy}>
              Volver a estimación
            </Button>
          ) : null}
        </div>
      ) : null}
      {editing ? (
        <InputForm
          dealId={dealId}
          item={item}
          busy={busy}
          setBusy={setBusy}
          onCancel={onCancel}
          onSaved={onSaved}
        />
      ) : null}
    </div>
  );
}

function InputForm({
  dealId,
  item,
  busy,
  setBusy,
  onCancel,
  onSaved,
}: {
  dealId: string;
  item: ProfessionalInputItemView;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onCancel: () => void;
  onSaved: (text: string) => void;
}) {
  const a = item.active;
  const isWorks = item.key === "transformation.renovationBudget";
  const [value, setValue] = useState(a ? String(a.value) : "");
  const [sourceType, setSourceType] = useState<ProfessionalSourceType>(
    a?.sourceType ?? "professional_confirmed",
  );
  const [reason, setReason] = useState(a?.reason ?? "");
  const [note, setNote] = useState(a?.note ?? "");
  const [materials, setMaterials] = useState(
    String(a?.breakdown?.find((l) => l.label === "Materiales")?.amount ?? ""),
  );
  const [labour, setLabour] = useState(
    String(a?.breakdown?.find((l) => l.label === "Mano de obra")?.amount ?? ""),
  );
  const [other, setOther] = useState(String(a?.breakdown?.find((l) => l.label === "Otros")?.amount ?? ""));
  const [error, setError] = useState<string | null>(null);
  const breakdown = isWorks
    ? (
        [
          ["Materiales", num(materials)],
          ["Mano de obra", num(labour)],
          ["Otros", num(other)],
        ] as Array<[string, number | undefined]>
      )
        .filter((l): l is [string, number] => l[1] !== undefined)
        .map(([label, amount]) => ({ label, amount }))
    : [];
  const sum = breakdown.length ? breakdown.reduce((s, l) => s + l.amount, 0) : undefined;
  const effectiveValue = sum ?? num(value);

  async function save() {
    if (effectiveValue === undefined) {
      setError("Indica un importe.");
      return;
    }
    setBusy(true);
    setError(null);
    const r = await api<{ applied: number; rejected: Array<{ reason: string }> }>(
      `/api/deals/${dealId}/inputs`,
      {
        body: {
          action: "set",
          key: item.key,
          strategyId: item.strategyId,
          value: effectiveValue,
          sourceType,
          reason: reason || undefined,
          note: note || undefined,
          breakdown: breakdown.length ? breakdown : undefined,
        },
      },
    );
    setBusy(false);
    if (r.ok && r.data) {
      onSaved(
        r.data.rejected.length
          ? `No se ha podido aplicar este dato al análisis: ${r.data.rejected[0]!.reason}`
          : `${item.label} guardado. ${r.data.applied} estrategia${r.data.applied === 1 ? "" : "s"} recalculada${r.data.applied === 1 ? "" : "s"}.`,
      );
    } else setError(r.error?.message ?? "No hemos podido guardar el dato.");
  }

  return (
    <div className="mt-3 grid gap-3 border-t border-line pt-3 anim-rise">
      {isWorks ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Materiales (€)">
            <Input inputMode="decimal" value={materials} onChange={(e) => setMaterials(e.target.value)} />
          </Field>
          <Field label="Mano de obra (€)">
            <Input inputMode="decimal" value={labour} onChange={(e) => setLabour(e.target.value)} />
          </Field>
          <Field label="Otros (€)">
            <Input inputMode="decimal" value={other} onChange={(e) => setOther(e.target.value)} />
          </Field>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={isWorks ? "Total obra (PEM + GG/BI, sin IVA)" : "Importe (€)"}
          hint={sum !== undefined ? "Suma del desglose." : undefined}
        >
          <Input
            inputMode="decimal"
            value={sum !== undefined ? String(sum) : value}
            disabled={sum !== undefined}
            onChange={(e) => setValue(e.target.value)}
            placeholder="p. ej. 218000"
          />
        </Field>
        <Field label="Tipo de dato">
          <Select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as ProfessionalSourceType)}
          >
            {PROFESSIONAL_SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {SOURCE_TYPE_META[t].label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Motivo (opcional)">
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="p. ej. precio negociado directamente con la propiedad"
          maxLength={500}
        />
      </Field>
      <Field label="Nota (opcional)">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      </Field>
      {error ? (
        <p role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button size="sm" variant="accent" onClick={save} loading={busy}>
          Guardar
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
