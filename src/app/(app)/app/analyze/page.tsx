import { redirect } from "next/navigation";
import { AnalysisExperience } from "@/components/flippia/analysis-experience";

export const metadata = { title: "LIA está construyendo el caso" };

export default async function AnalyzePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; deal?: string }>;
}) {
  const { q, deal } = await searchParams;
  if (!q) redirect("/app");
  return <AnalysisExperience text={q} dealId={deal} />;
}
