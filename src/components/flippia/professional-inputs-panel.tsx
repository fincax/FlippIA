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
import { formatDate, formatMoney } from "@/lib/format";
import {
  issuerLabel,
  PROFESSIONAL_INPUT_DISCLAIMER,
  PROFESSIONAL_INPUT_REGISTRY,
  SOURCE_TYPE_META,
} from "@/modules/inputs/registry";
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
      <p className="text-[13px] text-fg-2 max-w-3xl">
        Un precio negociado o un presupuesto de obra real sustituyen a la estimación en todos los cálculos
        dependientes. La estimación se conserva y se puede volver a ella en cualquier momento.
      </p>
      <p className="text-[12px] text-fg-3 max-w-3xl mt-2 mb-4">{PROFESSIONAL_INPUT_DISCLAIMER}</p>
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
                {a.enteredByName ?? a.enteredBy} · {formatDate(a.enteredAt)} · {issuerLabel(a.issuer)}
              </span>
            </div>
          ) : null}
          {a && a.marginAmount > 0 ? (
            <div className="mt-1 text-[11px] text-fg-3">
              Neto <Money value={a.netValue} /> + margen comercial <Money value={a.marginAmount} /> (sin
              impuestos)
            </div>
          ) : null}
          {a?.reason ? <div className="mt-1 text-[11px] text-fg-2">{a.reason}</div> : null}
          {a?.breakdown?.length ? (
            <ul className="mt-1 text-[11px] text-fg-3">
              {a.breakdown.map((l) => (
                <li key={l.label}>
                  {l.label}: <Money value={l.amount} />
                  {(l.marginRate ?? a.marginRate)
                    ? ` + ${Math.round((l.marginRate ?? a.marginRate ?? 0) * 100)} % de margen`
                    : ""}
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
            {item.effective.value !== null ? " · sin impuestos" : ""}
          </div>
          {item.tax ? (
            <div className="mt-1 text-[11px] text-fg-3">
              {item.tax.label} aparte: <Money value={item.tax.amount} /> · con impuestos{" "}
              <Money value={item.tax.totalWithTax} />
            </div>
          ) : null}
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
  const line = (label: string) => a?.breakdown?.find((l) => l.label === label);
  const pct = (l?: { marginRate?: number }) =>
    l?.marginRate !== undefined ? String(l.marginRate * 100) : "";
  const [value, setValue] = useState(a ? String(a.netValue) : "");
  const [margin, setMargin] = useState(a?.marginRate !== undefined ? String(a.marginRate * 100) : "");
  const [sourceType, setSourceType] = useState<ProfessionalSourceType>(
    a?.sourceType ?? "professional_confirmed",
  );
  const [issuerKind, setIssuerKind] = useState<"self" | "technician">(a?.issuer?.kind ?? "self");
  const [issuerName, setIssuerName] = useState(a?.issuer?.name ?? "");
  const [reason, setReason] = useState(a?.reason ?? "");
  const [note, setNote] = useState(a?.note ?? "");
  const [materials, setMaterials] = useState(String(line("Materiales")?.amount ?? ""));
  const [labour, setLabour] = useState(String(line("Mano de obra")?.amount ?? ""));
  const [other, setOther] = useState(String(line("Otros")?.amount ?? ""));
  const [materialsMargin, setMaterialsMargin] = useState(pct(line("Materiales")));
  const [labourMargin, setLabourMargin] = useState(pct(line("Mano de obra")));
  const [otherMargin, setOtherMargin] = useState(pct(line("Otros")));
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rate = (s: string) => {
    const v = num(s);
    return v === undefined ? undefined : v / 100;
  };
  const breakdown = isWorks
    ? (
        [
          ["Materiales", num(materials), rate(materialsMargin)],
          ["Mano de obra", num(labour), rate(labourMargin)],
          ["Otros", num(other), rate(otherMargin)],
        ] as Array<[string, number | undefined, number | undefined]>
      )
        .filter((l): l is [string, number, number | undefined] => l[1] !== undefined)
        .map(([label, amount, marginRate]) => ({ label, amount, marginRate }))
    : [];
  const sum = breakdown.length ? breakdown.reduce((s, l) => s + l.amount, 0) : undefined;
  const netValue = sum ?? num(value);
  const marginRate = rate(margin);
  const gross =
    netValue === undefined
      ? undefined
      : breakdown.length
        ? breakdown.reduce((s, l) => s + l.amount * (1 + (l.marginRate ?? marginRate ?? 0)), 0)
        : netValue * (1 + (marginRate ?? 0));

  async function save() {
    if (netValue === undefined) {
      setError("Indica un importe.");
      return;
    }
    if (issuerKind === "technician" && !issuerName.trim()) {
      setError("Indica el técnico o la empresa que emite el dato.");
      return;
    }
    if (!acknowledged) {
      setError("Confirma que el dato se aporta bajo tu responsabilidad.");
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
          value: netValue,
          marginRate,
          sourceType,
          issuer: { kind: issuerKind, name: issuerName.trim() || undefined },
          acknowledged,
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

  const lines: Array<[string, string, (v: string) => void, string, (v: string) => void]> = [
    ["Materiales", materials, setMaterials, materialsMargin, setMaterialsMargin],
    ["Mano de obra", labour, setLabour, labourMargin, setLabourMargin],
    ["Otros", other, setOther, otherMargin, setOtherMargin],
  ];

  return (
    <div className="mt-3 grid gap-3 border-t border-line pt-3 anim-rise">
      {isWorks ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {lines.map(([label, amount, setAmount, m, setM]) => (
            <div key={label} className="grid gap-2">
              <Field label={`${label} (€, neto sin impuestos)`}>
                <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="Margen de la partida (%)">
                <Input
                  inputMode="decimal"
                  value={m}
                  onChange={(e) => setM(e.target.value)}
                  placeholder="opcional"
                />
              </Field>
            </div>
          ))}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label={isWorks ? "Total obra neto (PEM + GG/BI, sin IVA)" : "Importe neto (€, sin impuestos)"}
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
        <Field
          label="Margen comercial (%)"
          hint={
            gross !== undefined && netValue !== undefined && gross !== netValue
              ? `En el análisis: ${formatMoney(Math.round(gross))} sin impuestos`
              : "Sobre el neto, sin impuestos; cada partida puede fijar el suyo. El IVA o ITP se calcula aparte."
          }
        >
          <Input
            inputMode="decimal"
            value={margin}
            onChange={(e) => setMargin(e.target.value)}
            placeholder="0"
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Quién emite el dato">
          <Select value={issuerKind} onChange={(e) => setIssuerKind(e.target.value as "self" | "technician")}>
            <option value="self">Yo mismo (profesional o usuario)</option>
            <option value="technician">Un técnico o empresa (presupuesto)</option>
          </Select>
        </Field>
        <Field label={issuerKind === "technician" ? "Técnico o empresa" : "Nombre (opcional)"}>
          <Input value={issuerName} onChange={(e) => setIssuerName(e.target.value)} maxLength={120} />
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
      <label className="flex items-start gap-2 text-[12px] text-fg-2">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
        />
        <span>{PROFESSIONAL_INPUT_DISCLAIMER} Confirmo que este dato se aporta bajo mi responsabilidad.</span>
      </label>
      {error ? (
        <p role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button size="sm" variant="accent" onClick={save} loading={busy} disabled={!acknowledged}>
          Guardar
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
