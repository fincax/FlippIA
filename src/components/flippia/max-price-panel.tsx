"use client";

import { useState } from "react";
import { Button, Field, Input, Money, SectionTitle, Select, Surface } from "@/components/ds";
import { api } from "@/lib/client";
import type { MaxPriceResult } from "@/modules/engines/financial";
import { labelConstraint } from "@/modules/lia/ask";

/** ¿Hasta cuánto puedo pagar? — deterministic maximum acquisition price. */
export function MaxPricePanel({
  dealId,
  strategies,
  investor,
}: {
  dealId: string;
  strategies: Array<{ id: string; label: string; rank: number; asking: number }>;
  investor: { targetRoe: number; targetProfit: number; maxEquity: number; horizonMonths: number };
}) {
  const [strategyId, setStrategyId] = useState(strategies[0]?.id ?? "");
  const [roe, setRoe] = useState(String(Math.round(investor.targetRoe * 100)));
  const [profit, setProfit] = useState(String(investor.targetProfit));
  const [capital, setCapital] = useState(String(investor.maxEquity));
  const [ltc, setLtc] = useState("");
  const [duration, setDuration] = useState(String(investor.horizonMonths));
  const [result, setResult] = useState<MaxPriceResult | null>(null);
  const [busy, setBusy] = useState(false);
  const num = (s: string) => {
    const v = Number(s.replace(/[^\d.]/g, ""));
    return Number.isFinite(v) && s.trim() !== "" ? v : undefined;
  };
  return (
    <Surface className="p-5">
      <SectionTitle kicker="Maximum acquisition price">¿Hasta cuánto puedo pagar?</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 items-end">
        <Field label="Estrategia" className="lg:col-span-2">
          <Select value={strategyId} onChange={(e) => setStrategyId(e.target.value)}>
            {strategies.map((s) => (
              <option key={s.id} value={s.id}>
                {String(s.rank).padStart(2, "0")} · {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ROE mínimo (%)">
          <Input inputMode="decimal" value={roe} onChange={(e) => setRoe(e.target.value)} />
        </Field>
        <Field label="Beneficio mínimo (€)">
          <Input inputMode="decimal" value={profit} onChange={(e) => setProfit(e.target.value)} />
        </Field>
        <Field label="Capital máximo (€)">
          <Input inputMode="decimal" value={capital} onChange={(e) => setCapital(e.target.value)} />
        </Field>
        <Field label="LTC máximo (%)">
          <Input
            inputMode="decimal"
            value={ltc}
            onChange={(e) => setLtc(e.target.value)}
            placeholder="opcional"
          />
        </Field>
        <Field label="Duración máx. (meses)">
          <Input inputMode="decimal" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </Field>
        <Button
          variant="accent"
          loading={busy}
          className="lg:col-span-1"
          onClick={async () => {
            setBusy(true);
            const constraints = {
              minimumRoe: num(roe) !== undefined ? num(roe)! / 100 : undefined,
              minimumProfit: num(profit),
              maximumCapital: num(capital),
              maximumLtc: num(ltc) !== undefined ? num(ltc)! / 100 : undefined,
              maximumDuration: num(duration),
            };
            const r = await api<MaxPriceResult>(`/api/deals/${dealId}/max-price`, {
              body: { strategyId, constraints },
            });
            setBusy(false);
            if (r.ok && r.data) setResult(r.data);
          }}
        >
          Calcular
        </Button>
      </div>
      {result ? (
        <div className="mt-5 anim-rise grid gap-4 md:grid-cols-[auto_1fr] items-start">
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-fg-3">Precio máximo</div>
            <div className="font-display text-4xl num text-accent">
              <Money value={result.maximumPrice} />
            </div>
            <div className="text-[12px] text-fg-2 mt-1">
              Frente a <Money value={result.askingPrice} /> solicitados:{" "}
              <Money value={result.headroom} signed />
            </div>
            <div className="text-[12px] text-fg-3">
              Límite: {labelConstraint(result.bindingConstraint)} · {result.iterations} iteraciones
            </div>
          </div>
          <ul className="text-[12px] space-y-1">
            {result.checks.map((c) => (
              <li key={c.constraint} className="flex justify-between gap-3 border-b border-line py-1">
                <span className="text-fg-2">
                  {labelConstraint(c.constraint)} ({c.limit})
                </span>
                <span className={c.satisfied ? "text-success" : "text-danger"}>
                  {c.valueAtMax === null ? "n/d" : Math.round(c.valueAtMax * 100) / 100}{" "}
                  {c.satisfied ? "✓" : "✗"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Surface>
  );
}
