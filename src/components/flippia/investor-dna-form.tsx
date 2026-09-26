"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input, Select, Surface, Textarea } from "@/components/ds";
import { api } from "@/lib/client";
import type { InvestorDNA } from "@/modules/investor/types";

const PROFILES: Array<[InvestorDNA["profileType"], string]> = [
  ["private_investor", "Inversor particular"],
  ["professional_investor", "Inversor profesional"],
  ["developer", "Promotor"],
  ["family_office", "Family office"],
  ["fund", "Fondo"],
  ["foreign_investor", "Inversor extranjero"],
  ["real_estate_company", "Empresa inmobiliaria"],
  ["architect_partner", "Arquitecto / partner"],
  ["broker_partner", "Broker / partner financiero"],
  ["agent_partner", "Agente / partner de oportunidades"],
];

export function InvestorDnaForm({
  initial,
  zones,
  strategies,
}: {
  initial: InvestorDNA;
  zones: Array<{ id: string; name: string }>;
  strategies: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const [dna, setDna] = useState<InvestorDNA>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const set = <K extends keyof InvestorDNA>(k: K, v: InvestorDNA[K]) => setDna((d) => ({ ...d, [k]: v }));
  const num = (v: string) => Number(v.replace(/[^\d.]/g, "")) || 0;
  const toggle = (k: "zones" | "strategies", id: string) =>
    set(k, dna[k].includes(id) ? dna[k].filter((x) => x !== id) : [...dna[k], id]);
  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-1 text-[12px] ${active ? "border-accent text-accent bg-accent-soft" : "border-line text-fg-2"}`;
  return (
    <form
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await api("/api/investor", { body: dna });
        setBusy(false);
        setMsg(r.ok ? "Investor DNA guardado." : (r.error?.message ?? "Error"));
        if (r.ok) {
          router.refresh();
          setTimeout(() => router.push("/app"), 600);
        }
      }}
    >
      <Surface className="p-5 grid gap-4 sm:grid-cols-2">
        <Field label="Perfil">
          <Select
            value={dna.profileType}
            onChange={(e) => set("profileType", e.target.value as InvestorDNA["profileType"])}
          >
            {PROFILES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Experiencia">
          <Select
            value={dna.experience}
            onChange={(e) => set("experience", e.target.value as InvestorDNA["experience"])}
          >
            <option value="none">Ninguna</option>
            <option value="some">Alguna operación</option>
            <option value="experienced">Experimentado</option>
            <option value="professional">Profesional</option>
          </Select>
        </Field>
        <Field label="Capital disponible (€)">
          <Input
            inputMode="decimal"
            value={dna.capitalAvailable}
            onChange={(e) => set("capitalAvailable", num(e.target.value))}
          />
        </Field>
        <Field label="Aportación máxima por operación (€)">
          <Input
            inputMode="decimal"
            value={dna.maxEquityPerDeal}
            onChange={(e) => set("maxEquityPerDeal", num(e.target.value))}
          />
        </Field>
        <Field label="Ticket mínimo (€)">
          <Input
            inputMode="decimal"
            value={dna.ticketMin}
            onChange={(e) => set("ticketMin", num(e.target.value))}
          />
        </Field>
        <Field label="Ticket máximo (€)">
          <Input
            inputMode="decimal"
            value={dna.ticketMax}
            onChange={(e) => set("ticketMax", num(e.target.value))}
          />
        </Field>
        <Field label="Horizonte (meses)">
          <Input
            inputMode="decimal"
            value={dna.horizonMonths}
            onChange={(e) => set("horizonMonths", Math.max(1, Math.round(num(e.target.value))))}
          />
        </Field>
        <Field label="Objetivo">
          <Select
            value={dna.objective}
            onChange={(e) => set("objective", e.target.value as InvestorDNA["objective"])}
          >
            <option value="capital_gain">Plusvalía</option>
            <option value="income">Rentas</option>
            <option value="mixed">Mixto</option>
          </Select>
        </Field>
        <Field label="ROE objetivo (%)">
          <Input
            inputMode="decimal"
            value={Math.round(dna.targetRoe * 100)}
            onChange={(e) => set("targetRoe", num(e.target.value) / 100)}
          />
        </Field>
        <Field label="Beneficio objetivo por operación (€)">
          <Input
            inputMode="decimal"
            value={dna.targetProfit}
            onChange={(e) => set("targetProfit", num(e.target.value))}
          />
        </Field>
        <Field label="Tolerancia al riesgo">
          <Select
            value={dna.riskTolerance}
            onChange={(e) => set("riskTolerance", e.target.value as InvestorDNA["riskTolerance"])}
          >
            <option value="low">Baja</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
          </Select>
        </Field>
        <Field label="Necesidad de liquidez">
          <Select
            value={dna.liquidityNeeds}
            onChange={(e) => set("liquidityNeeds", e.target.value as InvestorDNA["liquidityNeeds"])}
          >
            <option value="low">Baja</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
          </Select>
        </Field>
        <Field label="Financiación">
          <Select
            value={dna.usesFinancing ? "yes" : "no"}
            onChange={(e) => set("usesFinancing", e.target.value === "yes")}
          >
            <option value="yes">Uso financiación</option>
            <option value="no">Solo capital propio</option>
          </Select>
        </Field>
        <Field label="Tributación como">
          <Select
            value={dna.sellerProfile}
            onChange={(e) => set("sellerProfile", e.target.value as InvestorDNA["sellerProfile"])}
          >
            <option value="individual">Persona física (IRPF)</option>
            <option value="company">Sociedad (IS)</option>
          </Select>
        </Field>
        <Field label="Disponibilidad (h/semana)">
          <Input
            inputMode="decimal"
            value={dna.availabilityHoursPerWeek}
            onChange={(e) => set("availabilityHoursPerWeek", num(e.target.value))}
          />
        </Field>
      </Surface>
      <Surface className="p-5">
        <div className="text-[12px] text-fg-2 mb-2">Zonas (vacío = toda Sevilla)</div>
        <div className="flex flex-wrap gap-1.5">
          {zones.map((z) => (
            <button
              key={z.id}
              type="button"
              onClick={() => toggle("zones", z.id)}
              className={chip(dna.zones.includes(z.id))}
            >
              {z.name}
            </button>
          ))}
        </div>
        <div className="text-[12px] text-fg-2 mb-2 mt-4">Estrategias preferidas (vacío = todas)</div>
        <div className="flex flex-wrap gap-1.5">
          {strategies.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle("strategies", s.id)}
              className={chip(dna.strategies.includes(s.id))}
            >
              {s.label}
            </button>
          ))}
        </div>
        <Field label="Notas para LIA" className="mt-4">
          <Textarea
            value={dna.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="p. ej. prefiero edificios antiguos con patio; no quiero obra estructural"
          />
        </Field>
      </Surface>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="accent" size="lg" loading={busy}>
          Guardar Investor DNA
        </Button>
        {msg ? (
          <span className="text-sm text-fg-2" role="status">
            {msg}
          </span>
        ) : null}
      </div>
    </form>
  );
}
