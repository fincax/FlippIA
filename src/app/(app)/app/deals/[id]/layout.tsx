import Link from "next/link";
import { Badge, DemoBadge, LinkTabs, VerificationBadge } from "@/components/ds";
import { DealStatusMenu } from "@/components/flippia/deal-status-menu";
import { loadDeal } from "@/server/deal-page";
import { listReviews } from "@/server/services/reviews";
import { buildPassport } from "@/modules/passport/build";

export default async function DealLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx, deal, analysis } = await loadDeal(id);
  const reviews = await listReviews(ctx, id);
  const passport = analysis
    ? buildPassport(
        analysis,
        id,
        reviews.map((r) => ({
          role: r.role,
          status: r.status,
          at: r.createdAt.toISOString(),
          by: r.reviewerUserId,
        })),
      )
    : null;
  const base = `/app/deals/${id}`;
  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/strategies`, label: "Estrategias", count: analysis?.strategies.length },
    { href: `${base}/scenarios`, label: "Escenarios" },
    { href: `${base}/finance`, label: "Finanzas" },
    {
      href: `${base}/risk`,
      label: "Riesgo",
      count: analysis?.risk.findings.filter((f) => f.severity !== "low").length,
    },
    { href: `${base}/urbanism`, label: "Urbanismo", count: analysis?.urbanism.requiredChecks.length },
    { href: `${base}/architecture`, label: "Arquitectura" },
    { href: `${base}/market`, label: "Mercado" },
    { href: `${base}/evidence`, label: "Evidencia", count: analysis?.evidence.length },
    { href: `${base}/passport`, label: "Passport" },
    { href: `${base}/activity`, label: "Actividad" },
    { href: `${base}/lia`, label: "LIA" },
  ];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] text-fg-3 flex items-center gap-2">
            <Link href="/app/deals" className="hover:text-fg">
              Deals
            </Link>
            <span>/</span>
            <span>{deal.mode === "project" ? "Modo proyecto" : "Modo deal"}</span>
          </div>
          <h1 className="font-display text-2xl md:text-3xl mt-1 truncate">{deal.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {analysis?.demo ? <DemoBadge /> : null}
            {passport ? (
              <VerificationBadge
                level={passport.verified.level}
                label={passport.verified.label}
                meaning={passport.verified.meaning}
              />
            ) : null}
            {analysis ? (
              <Badge>Análisis {analysis.analysisDate}</Badge>
            ) : (
              <Badge tone="warning">Sin análisis</Badge>
            )}
          </div>
        </div>
        <DealStatusMenu dealId={id} status={deal.status} intakeText={deal.intake.rawText} />
      </div>
      <LinkTabs tabs={tabs} />
      <div className="anim-rise">{children}</div>
    </div>
  );
}
