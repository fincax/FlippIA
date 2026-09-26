import { Badge, Empty, SectionTitle, Surface } from "@/components/ds";
import { AlertList } from "@/components/flippia/alert-list";
import { WatchActions } from "@/components/flippia/watch-actions";
import { formatDate, formatNumber } from "@/lib/format";
import { labelWatchStatus } from "@/lib/labels";
import { tenantContext } from "@/server/auth/current";
import { listAlerts } from "@/server/services/alerts";
import { listWatches } from "@/server/services/watch";

export const dynamic = "force-dynamic";

const RULE_LABEL: Record<string, string> = {
  price_below: "precio por debajo de",
  price_drop_pct: "bajada de precio ≥",
  regulation_change: "cambio normativo",
  days_on_market: "días en mercado ≥",
  meets_criteria: "vuelve a cumplir criterios",
  new_comparable: "nuevo comparable",
};

export default async function WatchPage() {
  const { ctx } = await tenantContext();
  const [watches, alerts] = await Promise.all([listWatches(ctx), listAlerts(ctx, 30)]);
  return (
    <div className="space-y-8">
      <div>
        <SectionTitle kicker="Vigilancia inteligente" right={<WatchActions />}>
          Vigilancia
        </SectionTitle>
        <p className="text-sm text-fg-2 max-w-3xl">
          FlippIA vigila precio, disponibilidad, normativa, mercado y comparables de lo que descartaste o te
          interesa. Cuando una condición cambia: «Oportunidad activada» o «Riesgo nuevo detectado».
        </p>
      </div>
      {watches.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {watches.map((w) => (
            <Surface key={w.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm text-fg">{w.label}</div>
                <Badge
                  tone={w.status === "triggered" ? "success" : w.status === "paused" ? "neutral" : "accent"}
                >
                  {labelWatchStatus(w.status)}
                </Badge>
              </div>
              <ul className="mt-2 text-[12px] text-fg-2">
                {w.rules.map((r, i) => (
                  <li key={i}>
                    • {RULE_LABEL[r.kind] ?? r.kind}
                    {r.value !== undefined
                      ? ` ${r.kind === "price_drop_pct" ? `${Math.round(r.value * 100)} %` : formatNumber(r.value)}`
                      : ""}
                  </li>
                ))}
              </ul>
              <div className="mt-2 text-[11px] text-fg-3">
                Creada {formatDate(w.createdAt)}
                {w.lastEvaluatedAt ? ` · evaluada ${formatDate(w.lastEvaluatedAt)}` : ""}
              </div>
              <WatchActions watchId={w.id} />
            </Surface>
          ))}
        </div>
      ) : (
        <Empty
          title="Todavía no estás vigilando ninguna zona ni activo."
          body="Dime cuánto quieres invertir y qué buscas. LIA puede crear tu primer radar y vigilar lo que hoy no cumple tus criterios."
        />
      )}
      <div>
        <SectionTitle kicker="Alertas">Historial</SectionTitle>
        <AlertList
          alerts={alerts.map((a) => ({
            id: a.id,
            title: a.title,
            body: a.body,
            severity: a.severity,
            dealId: a.dealId,
            read: Boolean(a.readAt),
            createdAt: a.createdAt.toISOString(),
            payload: a.payload,
          }))}
        />
      </div>
    </div>
  );
}
