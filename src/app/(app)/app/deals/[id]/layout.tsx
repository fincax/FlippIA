import Link from "next/link";
import { DemoBadge, LinkTabs, VerificationBadge } from "@/components/ds";
import { DealStatusMenu } from "@/components/flippia/deal-status-menu";
import { LIAPulse } from "@/components/flippia/visual/lia-pulse";
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
  const p = analysis?.property;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="kicker flex items-center gap-2">
            <Link href="/app/deals" className="hover:text-fg">
              Deals
            </Link>
            <span aria-hidden>/</span>
            <span>{deal.mode === "project" ? "Modo proyecto" : "Modo deal"}</span>
            {analysis ? (
              <>
                <span aria-hidden>/</span>
                <span className="num">análisis {analysis.analysisDate}</span>
              </>
            ) : null}
          </div>
          <h1 className="display-xl text-2xl md:text-4xl mt-2 truncate max-w-4xl">{deal.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {analysis?.demo ? <DemoBadge /> : null}
            {passport ? (
              <VerificationBadge
                level={passport.verified.level}
                label={passport.verified.label}
                meaning={passport.verified.meaning}
              />
            ) : null}
            {p ? (
              <span className="kicker">
                {p.microzone.name} · {p.property.builtAreaM2} m²
                {p.cadastral.cadastralRef ? ` · RC ${p.cadastral.cadastralRef}` : ""}
              </span>
            ) : null}
            {!analysis ? (
              <span className="kicker text-warning flex items-center gap-1.5">
                <LIAPulse state="idle" size={5} /> Sin análisis
              </span>
            ) : null}
          </div>
        </div>
        <DealStatusMenu dealId={id} status={deal.status} intakeText={deal.intake.rawText} />
      </div>
      <LinkTabs tabs={tabs} />
      <div className="anim-rise">{children}</div>
    </div>
  );
}
