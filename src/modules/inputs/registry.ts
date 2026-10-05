import type { EvidenceStatus } from "@/modules/core/evidence-status";
import {
  PROFESSIONAL_INPUT_KEYS,
  type ProfessionalInputDefinition,
  type ProfessionalInputKey,
  type ProfessionalSourceType,
} from "./types";

/** Typed registry: adding a professional input is adding an entry here (and to `PROFESSIONAL_INPUT_KEYS`). */
export const PROFESSIONAL_INPUT_REGISTRY: Record<ProfessionalInputKey, ProfessionalInputDefinition> = {
  "acquisition.purchasePrice": {
    key: "acquisition.purchasePrice",
    label: "Precio de compra",
    unit: "currency",
    scope: "deal",
    group: "price",
    description:
      "Precio negociado o firmado con la propiedad, sin impuestos. Aplica a todas las estrategias.",
  },
  "transformation.renovationBudget": {
    key: "transformation.renovationBudget",
    label: "Presupuesto de obra",
    unit: "currency",
    scope: "strategy",
    group: "works",
    taxable: "works",
    description:
      "Presupuesto de ejecución material (PEM + GG/BI) de la obra de una estrategia concreta. Puede indicarse con el IVA incluido: se normaliza a su base.",
  },
  "transformation.professionalFees": {
    key: "transformation.professionalFees",
    label: "Honorarios técnicos",
    unit: "currency",
    scope: "strategy",
    group: "works",
    description:
      "Honorarios de arquitecto, dirección de obra y certificados, sin IVA, de una estrategia concreta.",
  },
  "acquisition.taxableBase": {
    key: "acquisition.taxableBase",
    label: "Base imponible de adquisición",
    unit: "currency",
    scope: "deal",
    group: "tax",
    optional: true,
    description:
      "Base sobre la que se liquida ITP o IVA cuando no coincide con el precio (valor de referencia, liquidación del asesor).",
  },
  "acquisition.transferTaxManual": {
    key: "acquisition.transferTaxManual",
    label: "Impuesto de adquisición liquidado",
    unit: "currency",
    scope: "deal",
    group: "tax",
    optional: true,
    description:
      "ITP o IVA de la compra tal como lo liquida o confirma el asesor. La estimación de la regla se conserva.",
  },
  "tax.vatRecoverabilityRatio": {
    key: "tax.vatRecoverabilityRatio",
    label: "Deducibilidad del IVA soportado",
    unit: "ratio",
    scope: "deal",
    group: "tax",
    optional: true,
    description:
      "Parte del IVA soportado (obra, compra de obra nueva) que el proyecto recupera: 0 a 100 %. Sin dato, FlippIA lo trata como coste y lo marca para revisión.",
  },
};

/** Estimate FlippIA shows for a key whose path is absent from the base inputs, read from the base result. */
export function estimateForOptionalKey(
  key: ProfessionalInputKey,
  result: {
    inputs: { acquisition: { purchasePrice: number } };
    costLines: Array<{ key: string; amount: number }>;
  },
): number | null {
  switch (key) {
    case "acquisition.taxableBase":
      return result.inputs.acquisition.purchasePrice;
    case "acquisition.transferTaxManual":
      return result.costLines.find((l) => l.key === "transfer_tax")?.amount ?? null;
    default:
      return null;
  }
}

export function isProfessionalInputKey(path: string): path is ProfessionalInputKey {
  return (PROFESSIONAL_INPUT_KEYS as readonly string[]).includes(path);
}

export const SOURCE_TYPE_META: Record<
  ProfessionalSourceType,
  { rank: number; label: string; badge: string; status: EvidenceStatus; description: string }
> = {
  professional_confirmed: {
    rank: 1,
    label: "Dato profesional confirmado",
    badge: "Profesional",
    status: "INFERRED",
    description: "Conocido o negociado por un profesional; sin documento adjunto.",
  },
  contractor_quote: {
    rank: 2,
    label: "Presupuesto de contratista",
    badge: "Presupuesto",
    status: "INFERRED",
    description: "Oferta recibida de un contratista o industrial.",
  },
  accepted_quote: {
    rank: 3,
    label: "Presupuesto aceptado",
    badge: "Presupuesto aceptado",
    status: "VERIFIED",
    description: "Presupuesto firmado o aceptado.",
  },
  document_verified: {
    rank: 4,
    label: "Documento verificado",
    badge: "Documento",
    status: "VERIFIED",
    description: "Contrastado con un documento (oferta, contrato, escritura).",
  },
  actual: {
    rank: 5,
    label: "Dato real",
    badge: "Real",
    status: "VERIFIED",
    description: "Importe efectivamente firmado o pagado.",
  },
};

/**
 * Shown wherever a professional figure is entered or used. One text, one
 * place: panel, Passport and LIA quote it.
 */
export const PROFESSIONAL_INPUT_DISCLAIMER =
  "Los datos introducidos por el profesional o el usuario se aportan bajo su responsabilidad y determinan el resultado final. FlippIA realiza estimaciones de mercado; los presupuestos finales, si se contrata a nuestros técnicos o a otros, son responsabilidad de los técnicos que los emiten. Los importes y el margen comercial se indican sin impuestos; los impuestos aplicables se calculan aparte.";

export function issuerLabel(issuer: { kind: "self" | "technician"; name?: string }): string {
  if (issuer.kind === "technician") return issuer.name ? `técnico: ${issuer.name}` : "técnico";
  return issuer.name ? `aportado por ${issuer.name}` : "aportado por el usuario";
}
