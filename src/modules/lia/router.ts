import { parseIntake, type IntakeRequest } from "@/modules/property/intake";
import { parseProjectBrief } from "@/modules/radar/brief";
import { formatMoney } from "@/lib/format";

export type LiaAction =
  | { kind: "analyze"; intake: IntakeRequest; message: string }
  | { kind: "radar"; intake: IntakeRequest; message: string }
  | { kind: "onboarding"; message: string }
  | { kind: "clarify"; message: string; suggestions: string[] };

/**
 * LIA's front door (home command bar). Deterministic: understands what the
 * user wants and decides which capability to invoke. No model call is
 * needed to start the WOW; the model, if present, is used downstream.
 */
export function routeCommand(text: string): LiaAction {
  const intake = parseIntake(text);
  switch (intake.intent) {
    case "analyze_property":
      return {
        kind: "analyze",
        intake,
        message: `Voy a construir el caso de ${intake.property?.address ?? intake.property?.cadastralRef ?? "este activo"}${intake.price ? ` a ${formatMoney(intake.price)}` : ""}.`,
      };
    case "capital_available":
    case "find_opportunity": {
      const brief = parseProjectBrief(text);
      return {
        kind: "radar",
        intake,
        message: brief.hasProject
          ? `Busco ${brief.summary} y evalúo cada activo con las vías que encajan.`
          : intake.investor?.capital
            ? `Busco oportunidades compatibles con ${formatMoney(intake.investor.capital)}${intake.investor.horizonMonths ? ` y un horizonte de ${intake.investor.horizonMonths} meses` : ""}.`
            : "Busco oportunidades compatibles con tu Investor DNA.",
      };
    }
    case "optimize_investment":
      return {
        kind: "clarify",
        message:
          "Para optimizar necesito una operación concreta. Abre un deal y pulsa «Haz magia», o dame una dirección.",
        suggestions: ["Analizar un inmueble", "Ver mis deals"],
      };
    case "what_if":
    case "question":
      return {
        kind: "clarify",
        message:
          "Esa pregunta tiene respuesta dentro de un deal: ahí conozco sus números y su normativa. ¿Sobre qué activo?",
        suggestions: ["Calle Pureza 45, Triana, 95 m2 por 285.000 €", "Tengo 250.000 €. Encuentra algo."],
      };
    default:
      return {
        kind: "clarify",
        message: "Dime una dirección, una referencia catastral o cuánto quieres invertir.",
        suggestions: [
          "Analiza este local de Triana por 285.000 €",
          "Tengo 300.000 €, quiero aportar máximo 120.000 €, horizonte 12 meses",
          "Calle Asunción 20, Los Remedios",
        ],
      };
  }
}
