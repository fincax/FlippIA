import type { OpportunityListing } from "@/modules/adapters/sources/types";
import type { WatchRule } from "@/db/schema/deals";
import type { InvestorDNA } from "@/modules/investor/types";
import { quickUnderwrite } from "@/modules/radar/underwrite";

export interface WatchEvaluation {
  triggered: boolean;
  events: Array<{
    rule: WatchRule["kind"];
    title: string;
    body: string;
    severity: "opportunity" | "risk" | "info";
  }>;
}

/** Evaluate watch rules against the latest listing state and investor DNA. */
export function evaluateWatch(
  rules: WatchRule[],
  listing: OpportunityListing,
  investor: InvestorDNA,
  previousPrice?: number,
): WatchEvaluation {
  const events: WatchEvaluation["events"] = [];
  for (const rule of rules) {
    switch (rule.kind) {
      case "price_below": {
        if (rule.value !== undefined && listing.askingPrice <= rule.value)
          events.push({
            rule: rule.kind,
            title: "Oportunidad activada",
            body: `${listing.title}: el precio (${listing.askingPrice.toLocaleString("es-ES")} €) ha bajado del umbral de ${rule.value.toLocaleString("es-ES")} €.`,
            severity: "opportunity",
          });
        break;
      }
      case "price_drop_pct": {
        const ref = previousPrice ?? listing.priceHistory[0]?.price;
        if (ref && rule.value !== undefined && (ref - listing.askingPrice) / ref >= rule.value)
          events.push({
            rule: rule.kind,
            title: "Bajada de precio",
            body: `${listing.title} ha bajado un ${Math.round(((ref - listing.askingPrice) / ref) * 100)} %.`,
            severity: "opportunity",
          });
        break;
      }
      case "meets_criteria": {
        const u = quickUnderwrite(listing, investor);
        if (u?.meetsCriteria)
          events.push({
            rule: rule.kind,
            title: "Vuelve a cumplir tus criterios",
            body: `${listing.title} cumple ahora tus parámetros (ROE ${((u.roe ?? 0) * 100).toFixed(1)} %, beneficio ${u.netProfit.toLocaleString("es-ES")} €).`,
            severity: "opportunity",
          });
        break;
      }
      case "days_on_market": {
        const days = Math.round((Date.now() - new Date(listing.publishedAt).getTime()) / 86_400_000);
        if (rule.value !== undefined && days >= rule.value)
          events.push({
            rule: rule.kind,
            title: "Tiempo en mercado",
            body: `${listing.title} lleva ${days} días publicado: margen de negociación.`,
            severity: "info",
          });
        break;
      }
      case "regulation_change":
      case "new_comparable":
        break;
    }
  }
  return { triggered: events.length > 0, events };
}

export interface Autopsy {
  headline: string;
  reasons: string[];
  reentryPrice: number | null;
  suggestion: string;
}

/** Opportunity Autopsy: why a deal fails the investor's criteria and when it would work again. */
export function autopsy(listing: OpportunityListing, investor: InvestorDNA): Autopsy {
  const u = quickUnderwrite(listing, investor);
  if (!u)
    return { headline: "No se pudo evaluar el activo.", reasons: [], reentryPrice: null, suggestion: "" };
  if (u.meetsCriteria)
    return {
      headline: "Esta operación cumple actualmente tus criterios.",
      reasons: [],
      reentryPrice: u.reentryPrice,
      suggestion: "Puedes lanzar el análisis completo.",
    };
  return {
    headline: "Esta operación no cumple actualmente tus criterios.",
    reasons: u.failedCriteria,
    reentryPrice: u.reentryPrice,
    suggestion:
      u.reentryPrice > 0 && u.reentryPrice < listing.askingPrice
        ? `Volvería a cumplir tus parámetros aproximadamente por debajo de ${u.reentryPrice.toLocaleString("es-ES")} €. Puedes vigilarla.`
        : "Los criterios no se cumplen ni a precio cero: el plazo o el capital son el límite.",
  };
}
