import { labelReviewRole, labelReviewStatus } from "@/lib/labels";
import { NoAnalysis } from "@/components/flippia/no-analysis";
import { Badge, EvidenceBadge, SectionTitle, Surface, VerificationBadge } from "@/components/ds";
import { PrintButton } from "@/components/flippia/print-button";
import { ReviewForm } from "@/components/flippia/review-form";
import { formatDate } from "@/lib/format";
import { buildPassport } from "@/modules/passport/build";
import { loadDeal } from "@/server/deal-page";
import { listReviews } from "@/server/services/reviews";

export default async function PassportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, deal, analysis } = await loadDeal(id);
  if (!analysis) return <NoAnalysis deal={deal} />;
  const reviews = await listReviews(ctx, id);
  const passport = buildPassport(
    analysis,
    id,
    reviews.map((r) => ({
      role: r.role,
      status: r.status,
      at: r.createdAt.toISOString(),
      by: r.reviewerUserId,
    })),
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-fg-3">
            Deal Passport · documento vivo
          </div>
          <h2 className="font-display text-2xl">{passport.title}</h2>
          <div className="mt-2 flex flex-wrap gap-2 items-center">
            <VerificationBadge
              level={passport.verified.level}
              label={passport.verified.label}
              meaning={passport.verified.meaning}
            />
            <span className="text-[12px] text-fg-3">{passport.verified.meaning}</span>
          </div>
          <div className="text-[12px] text-fg-3 mt-1">
            Análisis {passport.analysisDate} · generado {formatDate(passport.generatedAt)} ·{" "}
            {passport.evidenceCount} evidencias · snapshot normativo {passport.regulatoryFingerprint}
            {passport.demo ? " · DEMO" : ""}
          </div>
        </div>
        <PrintButton />
      </div>
      {passport.sections.map((s) => (
        <Surface key={s.key} className="p-5 break-inside-avoid">
          <SectionTitle right={s.status ? <EvidenceBadge status={s.status} /> : null}>{s.title}</SectionTitle>
          {s.rows.length ? (
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 text-[13px]">
              {s.rows.map((r, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[minmax(0,40%)_minmax(0,60%)] gap-2 border-b border-line pb-1.5"
                >
                  <dt className="text-fg-3">{r.label}</dt>
                  <dd className="text-fg">
                    {r.value}
                    {r.note ? <div className="text-[11px] text-fg-3">{r.note}</div> : null}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          {s.bullets?.length ? (
            <ul className="mt-3 text-[13px] text-fg-2 list-disc pl-4 space-y-0.5">
              {s.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : null}
        </Surface>
      ))}
      <Surface className="p-5 no-print">
        <SectionTitle kicker="Human in the loop" right={<Badge>{reviews.length} revisiones</Badge>}>
          Registrar revisión
        </SectionTitle>
        <ReviewForm dealId={id} analysisId={analysis.id} />
        {reviews.length ? (
          <ul className="mt-4 text-[12px] text-fg-2 space-y-1">
            {reviews.map((r) => (
              <li key={r.id}>
                {formatDate(r.createdAt)} · {labelReviewRole(r.role)} v{r.version} ·{" "}
                {labelReviewStatus(r.status)} · {r.scope}
                {r.comments ? ` — ${r.comments}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </Surface>
      <p className="text-[11px] text-fg-3">
        Este documento reúne estimaciones con fecha, fuente y estado de evidencia. No es una licencia,
        resolución administrativa, certificado profesional, asesoramiento jurídico vinculante ni tasación
        oficial.
      </p>
    </div>
  );
}
