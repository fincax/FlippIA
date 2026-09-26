"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  BarList,
  Button,
  CashCurve,
  Field,
  FinancialMetric,
  Input,
  Kicker,
  Money,
  Pct,
  SectionTitle,
  Select,
  Surface,
} from "@/components/ds";
import { cn } from "@/lib/cn";
import { api } from "@/lib/client";
import { formatMoney } from "@/lib/format";
import type { FinancialResult, MetricKey } from "@/modules/engines/financial";
import type { ScenarioSet } from "@/modules/engines/scenario/types";

const COMPARE: Array<[MetricKey, string]> = [
  ["netProfit", "Beneficio neto"],
  ["roe", "ROE"],
  ["annualizedRoe", "ROE anual."],
  ["irr", "TIR"],
  ["equityRequired", "Capital"],
  ["totalProjectCost", "Coste total"],
  ["breakEvenPrice", "Precio equilibrio"],
  ["durationMonths", "Meses"],
];

/** ScenarioSwitcher + ScenarioComparison + What-if + Digital Twin base updates. */
export function ScenarioPanel({
  dealId,
  items,
}: {
  dealId: string;
  items: Array<{ strategy: { id: string; label: string; rank: number }; set: ScenarioSet }>;
}) {
  const router = useRouter();
  const [strategyId, setStrategyId] = useState(items[0]?.strategy.id ?? "");
  const item = items.find((i) => i.strategy.id === strategyId) ?? items[0];
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const set = item?.set;
  const scenario = set?.scenarios.find((s) => s.id === scenarioId) ?? set?.scenarios[0];
  const [whatIfPath, setWhatIfPath] = useState("transformation.renovationBudget");
  const [whatIfValue, setWhatIfValue] = useState("");
  const [whatIf, setWhatIf] = useState<{ metrics: FinancialResult["metrics"] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const costItems = useMemo(() => {
    if (!scenario?.result) return [];
    const byCat = new Map<string, number>();
    for (const l of scenario.result.costLines)
      if (l.category !== "purchase") byCat.set(l.label, (byCat.get(l.label) ?? 0) + l.amount);
    return [...byCat.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [scenario]);

  if (!set || !scenario?.result) return <Surface className="p-6 text-sm text-fg-2">Sin escenarios.</Surface>;
  const r = scenario.result;

  async function runWhatIf() {
    const v = Number(whatIfValue.replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(v)) return;
    setBusy(true);
    const res = await api<{ metrics: FinancialResult["metrics"] }>(`/api/deals/${dealId}/scenarios`, {
      body: { action: "what_if", strategyId, overrides: { [whatIfPath]: v }, fromScenarioId: scenario!.id },
    });
    setBusy(false);
    if (res.ok && res.data) setWhatIf(res.data);
  }
  async function commitBase() {
    const v = Number(whatIfValue.replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(v)) return;
    setBusy(true);
    const res = await api<{ report: { recomputed: unknown[]; skipped: unknown[] } }>(
      `/api/deals/${dealId}/scenarios`,
      { body: { action: "update_base", strategyId, overrides: { [whatIfPath]: v } } },
    );
    setBusy(false);
    if (res.ok && res.data) {
      setMsg(
        `Base actualizada. ${res.data.report.recomputed.length} escenarios recalculados, ${res.data.report.skipped.length} sin cambios.`,
      );
      setWhatIf(null);
      router.refresh();
    } else setMsg(res.error?.message ?? "Error");
  }
  async function saveCustom() {
    const v = Number(whatIfValue.replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(v)) return;
    setBusy(true);
    const res = await api(`/api/deals/${dealId}/scenarios`, {
      body: {
        action: "custom",
        strategyId,
        name: `${labelFor(whatIfPath)} ${formatMoney(v)}`,
        overrides: { [whatIfPath]: v },
      },
    });
    setBusy(false);
    if (res.ok) {
      setMsg("Escenario personalizado guardado.");
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          aria-label="Estrategia"
          className="w-auto"
          value={strategyId}
          onChange={(e) => {
            setStrategyId(e.target.value);
            setScenarioId(null);
            setWhatIf(null);
          }}
        >
          {items.map((i) => (
            <option key={i.strategy.id} value={i.strategy.id}>
              {String(i.strategy.rank).padStart(2, "0")} · {i.strategy.label}
            </option>
          ))}
        </Select>
        <div
          className="flex gap-1 rounded-[var(--radius-md)] border border-line p-1"
          role="tablist"
          aria-label="Escenario"
        >
          {set.scenarios.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={s.id === scenario.id}
              onClick={() => {
                setScenarioId(s.id);
                setWhatIf(null);
              }}
              className={cn(
                "px-3 py-1.5 text-[13px] rounded-[var(--radius-sm)]",
                s.id === scenario.id ? "bg-surface-raised text-fg" : "text-fg-2 hover:text-fg",
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-fg-3">
          v{set.version} · {scenario.description}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        {COMPARE.map(([k, label]) => (
          <FinancialMetric key={k} label={label} metric={r.metrics[k]} size="sm" />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Surface className="p-5">
          <SectionTitle kicker="Comparación">Cada estrategia, cada escenario</SectionTitle>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-fg-3">
                  <th className="px-2 py-1 font-normal">Escenario</th>
                  {COMPARE.slice(0, 6).map(([k, l]) => (
                    <th key={k} className="px-2 py-1 font-normal text-right">
                      {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {set.scenarios.map((s) => (
                  <tr
                    key={s.id}
                    className={cn("border-t border-line", s.id === scenario.id && "bg-surface-raised")}
                  >
                    <td className="px-2 py-1.5">{s.name}</td>
                    {COMPARE.slice(0, 6).map(([k]) => {
                      const m = s.result?.metrics[k];
                      return (
                        <td key={k} className="px-2 py-1.5 text-right num">
                          {m?.unit === "ratio" ? (
                            <Pct value={m.value} />
                          ) : m?.unit === "currency" ? (
                            <Money value={m.value} />
                          ) : (
                            (m?.value ?? "–")
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>
        <Surface className="p-5">
          <SectionTitle kicker="Caja">¿Cuándo está el capital en riesgo?</SectionTitle>
          <CashCurve points={r.cashflows} />
          <div className="mt-3 text-[12px] text-fg-3">
            Déficit máximo (capital propio): <Money value={r.metrics.equityRequired.value} /> · Cierre:{" "}
            <Money value={r.cashflows.at(-1)?.cumulative ?? null} />
          </div>
        </Surface>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Surface className="p-5">
          <SectionTitle kicker="Costes">¿Dónde se va el dinero?</SectionTitle>
          <BarList items={costItems} format={(v) => formatMoney(v)} />
          {r.reviewItems.length ? (
            <ul className="mt-3 text-[11px] text-warning list-disc pl-4">
              {r.reviewItems.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          ) : null}
        </Surface>
        <Surface className="p-5 no-print">
          <SectionTitle kicker="What if?">Cambia una variable</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
            <Field label="Variable">
              <Select value={whatIfPath} onChange={(e) => setWhatIfPath(e.target.value)}>
                <option value="acquisition.purchasePrice">Precio de compra</option>
                <option value="transformation.renovationBudget">Presupuesto de obra</option>
                <option value="holding.durationMonths">Duración (meses)</option>
                {r.inputs.exit.kind === "sale" ? (
                  <option value="exit.salePrice">Precio de venta</option>
                ) : (
                  <option value="exit.monthlyRent">Renta mensual</option>
                )}
              </Select>
            </Field>
            <Field label="Nuevo valor" hint={`Actual: ${currentValue(r, whatIfPath)}`}>
              <Input
                inputMode="decimal"
                value={whatIfValue}
                onChange={(e) => setWhatIfValue(e.target.value)}
                placeholder="p. ej. 55000"
              />
            </Field>
            <Button variant="accent" loading={busy} onClick={runWhatIf}>
              Simular
            </Button>
          </div>
          {whatIf ? (
            <div className="mt-4 anim-rise">
              <Kicker>Resultado temporal (no altera la base)</Kicker>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-3">
                {(["netProfit", "roe", "equityRequired", "irr"] as MetricKey[]).map((k) => (
                  <div key={k}>
                    <div className="text-[11px] text-fg-3">{COMPARE.find(([kk]) => kk === k)?.[1]}</div>
                    <div className="num text-lg">
                      {r.metrics[k].unit === "ratio" ? (
                        <Pct value={whatIf.metrics[k].value} />
                      ) : (
                        <Money value={whatIf.metrics[k].value} />
                      )}
                      <span className="text-[11px] text-fg-3 ml-1">
                        (
                        {r.metrics[k].unit === "ratio" ? (
                          <Pct value={(whatIf.metrics[k].value ?? 0) - (r.metrics[k].value ?? 0)} signed />
                        ) : (
                          <Money value={(whatIf.metrics[k].value ?? 0) - (r.metrics[k].value ?? 0)} signed />
                        )}
                        )
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={commitBase} loading={busy}>
                  Aplicar a la base
                </Button>
                <Button size="sm" variant="ghost" onClick={saveCustom} loading={busy}>
                  Guardar como escenario
                </Button>
              </div>
            </div>
          ) : null}
          {msg ? (
            <p className="mt-3 text-[12px] text-fg-2" role="status">
              {msg}
            </p>
          ) : null}
        </Surface>
      </div>
    </div>
  );
}

function labelFor(path: string): string {
  return (
    {
      "acquisition.purchasePrice": "Compra",
      "transformation.renovationBudget": "Obra",
      "holding.durationMonths": "Plazo",
      "exit.salePrice": "Venta",
      "exit.monthlyRent": "Renta",
    }[path] ?? path
  );
}

function currentValue(r: FinancialResult, path: string): string {
  const i = r.inputs;
  switch (path) {
    case "acquisition.purchasePrice":
      return formatMoney(i.acquisition.purchasePrice);
    case "transformation.renovationBudget":
      return formatMoney(i.transformation.renovationBudget);
    case "holding.durationMonths":
      return `${i.holding.durationMonths} meses`;
    case "exit.salePrice":
      return i.exit.kind === "sale" ? formatMoney(i.exit.salePrice) : "–";
    case "exit.monthlyRent":
      return i.exit.kind === "rent" ? formatMoney(i.exit.monthlyRent) : "–";
    default:
      return "–";
  }
}
