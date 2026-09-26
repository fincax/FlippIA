import { SectionTitle } from "@/components/ds";
import { InvestorDnaForm } from "@/components/flippia/investor-dna-form";
import { SEVILLA } from "@/modules/city/sevilla";
import { STRATEGY_PLUGINS } from "@/modules/strategies/plugins";
import { tenantContext } from "@/server/auth/current";
import { getInvestorDNA } from "@/server/services/investor";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { ctx } = await tenantContext();
  const { dna, completed } = await getInvestorDNA(ctx);
  return (
    <div className="max-w-3xl">
      <SectionTitle kicker="Investor DNA">
        {completed ? "Tu perfil de inversión" : "Cuéntame cómo inviertes"}
      </SectionTitle>
      <p className="text-sm text-fg-2 mb-6">
        Con esto LIA filtra el radar, ordena las estrategias, calcula tu precio máximo y decide cuándo
        avisarte. Puedes cambiarlo cuando quieras.
      </p>
      <InvestorDnaForm
        initial={dna}
        zones={SEVILLA.microzones.map((m) => ({ id: m.id, name: m.name }))}
        strategies={STRATEGY_PLUGINS.map((s) => ({ id: s.id, label: s.label }))}
      />
    </div>
  );
}
