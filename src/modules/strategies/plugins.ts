import { baseInputs, check, primaryFinancing, renovationFor, rentExit, saleExit } from "./helpers";
import type { StrategyContext, StrategyEvaluation, StrategyPlugin } from "./types";

const isResidential = (ctx: StrategyContext) => ctx.property.property.assetUse === "residential";
const cond = (ctx: StrategyContext) => ctx.property.property.condition;
const area = (ctx: StrategyContext) => ctx.property.property.builtAreaM2;
const arv = (ctx: StrategyContext) => ctx.market.valuationRenovated.value.point;
const asIs = (ctx: StrategyContext) => ctx.market.valuationUnrenovated.value.point;
const protectionHeavy = (ctx: StrategyContext) => ctx.urbanism.planning.protectionLevel === "A" || ctx.urbanism.planning.protectionLevel === "B" || ctx.urbanism.planning.protectionLevel === "BIC";

function protectionChecks(ctx: StrategyContext) {
  const checks = [];
  if (ctx.urbanism.planning.inHistoricCentre) checks.push(check("heritage_catalogue", "Consultar catálogo de protección del sector", "El edificio está en el Conjunto Histórico; el nivel de protección condiciona la intervención.", "architect", protectionHeavy(ctx), "heritage"));
  return checks;
}

export const flipIntegral: StrategyPlugin = {
  id: "flip_integral",
  label: "Reforma integral + venta",
  family: "sell",
  description: "Comprar, reformar integralmente y vender al valor de mercado reformado.",
  topics: ["licence", "responsible_declaration", "building_code", "tax.acquisition", "tax.exit", "tax.works"],
  evaluate(ctx) {
    if (cond(ctx) === "renovated" || cond(ctx) === "new") return null;
    if (!isResidential(ctx)) return null;
    const estimate = renovationFor(ctx, "integral");
    const { inputs, assumptions } = baseInputs(ctx, { level: "integral", estimate, exit: saleExit(arv(ctx), ctx), financing: primaryFinancing(ctx, "mortgage") });
    return {
      applicability: { applicable: true, conditional: protectionHeavy(ctx), reasons: ["Activo residencial sin reformar con diferencial reformado/sin reformar en la microzona."], requiredChecks: [check("licence_scope", "Confirmar si basta declaración responsable o requiere licencia", "Una reforma integral sin afección estructural suele tramitarse por declaración responsable; con estructura o fachada requiere licencia.", "architect", false, "licence"), ...protectionChecks(ctx)] },
      inputs,
      assumptions,
      transformation: { level: "integral", estimate },
      exitKind: "sale",
    };
  },
};

export const flipLight: StrategyPlugin = {
  id: "flip_light",
  label: "Reforma ligera + venta",
  family: "sell",
  description: "Actualización estética y venta rápida, sin obra estructural ni instalaciones.",
  topics: ["responsible_declaration", "tax.acquisition", "tax.exit"],
  evaluate(ctx) {
    if (cond(ctx) === "renovated" || cond(ctx) === "new" || cond(ctx) === "to_rebuild") return null;
    if (!isResidential(ctx)) return null;
    const estimate = renovationFor(ctx, "cosmetic");
    const salePrice = Math.round(asIs(ctx) + (arv(ctx) - asIs(ctx)) * 0.45);
    const { inputs, assumptions } = baseInputs(ctx, { level: "cosmetic", estimate, exit: saleExit(salePrice, ctx), financing: primaryFinancing(ctx, "mortgage") });
    assumptions.push({ path: "exit.salePrice", label: "Precio de salida (reforma ligera)", value: salePrice, unit: "currency", source: "engine", evidenceIds: [], status: "INFERRED", note: "Sin reformar + 45 % del diferencial reformado/sin reformar." });
    return {
      applicability: { applicable: true, conditional: false, reasons: ["Menor capital y plazo; captura parte del diferencial de estado."], requiredChecks: [] },
      inputs,
      assumptions,
      transformation: { level: "cosmetic", estimate },
      exitKind: "sale",
    };
  },
};

export const redistributionSale: StrategyPlugin = {
  id: "redistribution_sale",
  label: "Redistribución + venta",
  family: "transform",
  description: "Optimizar el programa (una habitación adicional, baño en suite, cocina abierta) para vender por encima del reformado estándar.",
  topics: ["licence", "habitability", "building_code", "tax.acquisition", "tax.exit"],
  evaluate(ctx) {
    if (!isResidential(ctx) || cond(ctx) === "new") return null;
    const alt = ctx.architecture.alternatives.find((a) => a.id === "redistribution");
    if (!alt) return null;
    const salePrice = Math.round(arv(ctx) * (1 + alt.valueUplift));
    const { inputs, assumptions } = baseInputs(ctx, { level: alt.renovationLevel, estimate: alt.estimate, exit: saleExit(salePrice, ctx), financing: primaryFinancing(ctx, "mortgage") });
    assumptions.push({ path: "exit.salePrice", label: "Precio de salida con programa optimizado", value: salePrice, unit: "currency", source: "engine", evidenceIds: [], status: "INFERRED", note: `ARV reformado + ${Math.round(alt.valueUplift * 100)} % por programa optimizado (${alt.program.bedrooms} dormitorios).` });
    return {
      applicability: { applicable: true, conditional: alt.feasibility === "conditional", reasons: [alt.description], requiredChecks: [...alt.requiredChecks, ...protectionChecks(ctx)] },
      inputs,
      assumptions,
      transformation: { level: alt.renovationLevel, estimate: alt.estimate, alternativeId: alt.id },
      exitKind: "sale",
    };
  },
};

export const renovateRent: StrategyPlugin = {
  id: "renovate_rent",
  label: "Reforma + alquiler",
  family: "hold",
  description: "Reformar y explotar en alquiler de larga duración; salida a valor reformado a cinco años.",
  topics: ["tenancy", "housing", "energy", "tax.acquisition"],
  evaluate(ctx) {
    if (!isResidential(ctx) || cond(ctx) === "new") return null;
    const level = cond(ctx) === "renovated" ? "cosmetic" : "medium";
    const estimate = renovationFor(ctx, level);
    const rent = Math.round(ctx.market.rent.monthly.point);
    const { inputs, assumptions } = baseInputs(ctx, { level, estimate, exit: rentExit(rent, arv(ctx), ctx), financing: primaryFinancing(ctx, "mortgage") });
    return {
      applicability: { applicable: true, conditional: false, reasons: ["Demanda de alquiler en la microzona; el activo reformado alcanza la renta de mercado."], requiredChecks: [check("cee", "Certificado de eficiencia energética", "Obligatorio para alquilar; condiciona la renta y las ayudas.", "technician", false, "energy"), check("tenancy_zone", "Comprobar declaración de zona tensionada", "Andalucía no ha declarado zonas tensionadas a fecha de análisis; un cambio limitaría la renta.", "lawyer", false, "housing")] },
      inputs,
      assumptions,
      transformation: { level, estimate },
      exitKind: "rent",
    };
  },
};

export const buyHold: StrategyPlugin = {
  id: "buy_hold",
  label: "Compra + alquiler sin reforma",
  family: "hold",
  description: "Explotar el activo en su estado actual.",
  topics: ["tenancy", "housing", "tax.acquisition"],
  evaluate(ctx) {
    if (!isResidential(ctx)) return null;
    if (cond(ctx) === "to_rebuild") return null;
    const factor = cond(ctx) === "renovated" || cond(ctx) === "good" || cond(ctx) === "new" ? 1 : 0.82;
    const rent = Math.round(ctx.market.rent.monthly.point * factor);
    const { inputs, assumptions } = baseInputs(ctx, { level: "none", exit: rentExit(rent, asIs(ctx), ctx, { opexRate: 0.15 }), financing: primaryFinancing(ctx, "mortgage") });
    assumptions.push({ path: "exit.monthlyRent", label: "Renta sin reformar", value: rent, unit: "currency", source: "engine", evidenceIds: [], status: "INFERRED", note: `Renta de mercado × ${factor} por estado.` });
    return {
      applicability: { applicable: true, conditional: false, reasons: ["Sin obra ni licencia: mínima complejidad de ejecución."], requiredChecks: [check("cee", "Certificado de eficiencia energética", "Obligatorio para alquilar.", "technician", false, "energy")] },
      inputs,
      assumptions,
      transformation: { level: "none" },
      exitKind: "rent",
    };
  },
};

export const changeOfUse: StrategyPlugin = {
  id: "change_of_use",
  label: "Cambio de uso a vivienda",
  family: "transform",
  description: "Convertir un local en vivienda cuando el planeamiento y la habitabilidad lo permiten.",
  topics: ["change_of_use", "zoning", "habitability", "licence", "horizontal_property", "building_code", "accessibility", "tax.acquisition", "tax.exit"],
  evaluate(ctx) {
    if (isResidential(ctx)) return null;
    if (ctx.property.property.typology !== "premises" && ctx.property.property.typology !== "office") return null;
    const gf = ctx.urbanism.planning.groundFloorResidential;
    if (gf === "forbidden") return null;
    const alt = ctx.architecture.alternatives.find((a) => a.id === "change_of_use") ?? ctx.architecture.alternatives[0]!;
    const residentialArv = Math.round(ctx.market.valuationRenovated.pricePerM2.point * area(ctx) * 0.92);
    const { inputs, assumptions } = baseInputs(ctx, { level: "change_of_use", estimate: alt.estimate, exit: saleExit(residentialArv, ctx), financing: primaryFinancing(ctx, "bridge") });
    assumptions.push({ path: "exit.salePrice", label: "Valor como vivienda en planta baja", value: residentialArv, unit: "currency", source: "engine", evidenceIds: [], status: "INFERRED", note: "€/m² residencial reformado de la microzona × 0,92 por planta baja." });
    return {
      applicability: {
        applicable: true,
        conditional: true,
        reasons: [`Se ha detectado potencial de cambio de uso: la ordenanza ${ctx.urbanism.planning.zoningLabel} ${gf === "allowed" ? "admite" : "condiciona"} el uso residencial en planta baja.`, "La viabilidad queda condicionada a las comprobaciones indicadas."],
        requiredChecks: [
          check("pgou_compatibility", "Compatibilidad del uso residencial en planta baja según PGOU", "La ordenanza de zona y las condiciones particulares determinan si el uso es admisible.", "architect", true, "zoning"),
          check("habitability", "Condiciones de habitabilidad (ventilación, iluminación, altura libre, patio)", "Los locales suelen incumplir altura o ventilación; sin ellas no hay licencia de ocupación.", "architect", true, "habitability"),
          check("lph_statutes", "Estatutos y acuerdo de la comunidad de propietarios", "Los estatutos pueden prohibir el cambio; el título constitutivo debe modificarse.", "lawyer", true, "horizontal_property"),
          check("licence_project", "Licencia de obras con proyecto y cambio de uso", "Requiere proyecto técnico y licencia municipal, no declaración responsable.", "municipality", true, "licence"),
          check("accessibility", "Accesibilidad y CTE DB-SUA/SI", "Intervención sujeta a exigencias del CTE en cambio de uso.", "architect", false, "accessibility"),
        ],
      },
      inputs,
      assumptions,
      transformation: { level: "change_of_use", estimate: alt.estimate, alternativeId: alt.id },
      exitKind: "sale",
    };
  },
};

export const subdivision: StrategyPlugin = {
  id: "subdivision",
  label: "División en dos viviendas",
  family: "transform",
  description: "Dividir una vivienda grande en dos unidades de mayor valor unitario.",
  topics: ["subdivision", "habitability", "horizontal_property", "licence", "building_parameters", "tax.acquisition", "tax.exit"],
  evaluate(ctx) {
    if (!isResidential(ctx) || area(ctx) < 120) return null;
    const alt = ctx.architecture.alternatives.find((a) => a.id === "subdivision");
    if (!alt) return null;
    const salePrice = Math.round(arv(ctx) * (1 + alt.valueUplift));
    const { inputs, assumptions } = baseInputs(ctx, { level: "integral", estimate: alt.estimate, exit: saleExit(salePrice, ctx), extraMonths: 3, financing: primaryFinancing(ctx, "bridge") });
    assumptions.push({ path: "exit.salePrice", label: "Valor conjunto de dos unidades", value: salePrice, unit: "currency", source: "engine", evidenceIds: [], status: "INFERRED", note: `ARV + ${Math.round(alt.valueUplift * 100)} % por prima de unidades pequeñas.` });
    return {
      applicability: {
        applicable: true,
        conditional: true,
        reasons: [`Superficie ${area(ctx)} m²: potencial de dos unidades de ~${Math.round(area(ctx) / 2)} m².`],
        requiredChecks: [
          check("min_dwelling_area", "Superficie mínima de vivienda y condiciones de habitabilidad", "El PGOU y la normativa de habitabilidad fijan mínimos por vivienda y por estancia.", "architect", true, "habitability"),
          check("lph_division", "Acuerdo de la comunidad (3/5) y autorización administrativa (LPH art. 10.3.b)", "La división material requiere licencia y acuerdo de la junta.", "lawyer", true, "horizontal_property"),
          check("licence_project", "Licencia de obras con proyecto", "Modificación de configuración: requiere proyecto (LOE art. 2).", "municipality", true, "licence"),
          ...protectionChecks(ctx),
        ],
      },
      inputs,
      assumptions,
      transformation: { level: "integral", estimate: alt.estimate, alternativeId: alt.id },
      exitKind: "sale",
    };
  },
};

export const energyRetrofitSale: StrategyPlugin = {
  id: "energy_retrofit_sale",
  label: "Rehabilitación energética + venta",
  family: "transform",
  description: "Reforma media con mejora de envolvente y ventanas; salto de calificación energética y prima de venta.",
  topics: ["energy", "licence", "tax.acquisition", "tax.exit", "tax.works"],
  evaluate(ctx) {
    if (!isResidential(ctx) || cond(ctx) === "new" || cond(ctx) === "renovated") return null;
    const year = ctx.property.property.yearBuilt ?? 1970;
    if (year >= 2007) return null;
    const estimate = renovationFor(ctx, "medium", { energyRetrofit: true });
    const salePrice = Math.round(arv(ctx) * 1.03);
    const { inputs, assumptions } = baseInputs(ctx, { level: "medium", estimate, exit: saleExit(salePrice, ctx), financing: primaryFinancing(ctx, "mortgage") });
    assumptions.push({ path: "exit.salePrice", label: "Precio con mejora energética", value: salePrice, unit: "currency", source: "engine", evidenceIds: [], status: "INFERRED", note: "ARV + 3 % por salto de calificación energética (hipótesis conservadora)." });
    return {
      applicability: { applicable: true, conditional: true, reasons: [`Edificio de ${year}: envolvente previsiblemente ineficiente; la EPBD 2024 empuja la demanda de eficiencia.`], requiredChecks: [check("cee_before", "Certificado energético actual y simulación de mejora", "Cuantifica el salto de letra y las ayudas aplicables.", "technician", false, "energy"), check("icio_bonus", "Bonificación ICIO por eficiencia energética", "La ordenanza fiscal puede bonificar; verificar.", "tax_advisor", false, "tax.works")] },
      inputs,
      assumptions,
      transformation: { level: "medium", estimate },
      exitKind: "sale",
    };
  },
};

export const saleWithLicence: StrategyPlugin = {
  id: "sale_with_licence",
  label: "Venta con proyecto y licencia",
  family: "develop",
  description: "Comprar, tramitar proyecto y licencia, y vender el activo con la transformación autorizada sin ejecutar la obra.",
  topics: ["licence", "change_of_use", "planning", "tax.acquisition", "tax.exit"],
  evaluate(ctx) {
    if (cond(ctx) === "renovated" || cond(ctx) === "new") return null;
    if (isResidential(ctx) && ctx.property.property.typology !== "building") return null;
    const ref = ctx.architecture.alternatives[0];
    if (!ref) return null;
    const salePrice = Math.round(asIs(ctx) * 1.07);
    const { inputs, assumptions } = baseInputs(ctx, { level: "none", exit: saleExit(salePrice, ctx), extraMonths: 6, financing: primaryFinancing(ctx, "bridge") });
    inputs.transformation.professionalFees = Math.round(ref.estimate.contractBudget * 0.06);
    inputs.transformation.otherLicenceCosts = Math.round(ref.estimate.contractBudget * 0.0475);
    assumptions.push({ path: "exit.salePrice", label: "Valor con licencia concedida", value: salePrice, unit: "currency", source: "engine", evidenceIds: [], status: "INFERRED", note: "Valor actual + 7 % por riesgo urbanístico eliminado (hipótesis)." });
    assumptions.push({ path: "transformation.professionalFees", label: "Proyecto y dirección", value: inputs.transformation.professionalFees, unit: "currency", source: "engine", evidenceIds: [], status: "INFERRED" });
    return {
      applicability: { applicable: true, conditional: true, reasons: ["Elimina el riesgo urbanístico para el siguiente comprador; capital y plazo limitados."], requiredChecks: [check("licence_feasibility", "Consulta urbanística previa", "Confirma la viabilidad antes de invertir en proyecto.", "municipality", true, "licence")] },
      inputs,
      assumptions,
      transformation: { level: "none", alternativeId: ref.id },
      exitKind: "sale",
    };
  },
};

export const touristRental: StrategyPlugin = {
  id: "tourist_rental",
  label: "Explotación turística",
  family: "hold",
  description: "Reforma media y explotación como vivienda de uso turístico. Fuertemente condicionada por la regulación municipal y la comunidad.",
  topics: ["tourism", "horizontal_property", "licence", "tax.acquisition"],
  evaluate(ctx) {
    if (!isResidential(ctx)) return null;
    if (!ctx.urbanism.planning.inHistoricCentre && ctx.property.microzone.demoMarket.demand !== "high") return null;
    const estimate = renovationFor(ctx, "medium");
    const rent = Math.round(ctx.market.rent.monthly.point * 1.6);
    const { inputs, assumptions } = baseInputs(ctx, { level: "medium", estimate, exit: rentExit(rent, arv(ctx), ctx, { vacancyRate: 0.3, opexRate: 0.35 }), financing: primaryFinancing(ctx, "mortgage") });
    assumptions.push({ path: "exit.monthlyRent", label: "Ingreso bruto mensual turístico", value: rent, unit: "currency", source: "engine", evidenceIds: [], status: "REVIEW_REQUIRED", note: "Renta de larga duración × 1,6; vacancia 30 %; gastos 35 %." });
    return {
      applicability: {
        applicable: true,
        conditional: true,
        reasons: ["Demanda turística alta en la zona; ingresos brutos superiores al alquiler tradicional."],
        requiredChecks: [
          check("vft_saturation", "Regulación municipal de viviendas turísticas y saturación del barrio", "Sevilla limita el número de VFT por barrio; sin comprobación no puede asumirse la explotación.", "municipality", true, "tourism"),
          check("lph_tourism", "Autorización expresa de la comunidad (LPH art. 17.12)", "Desde abril de 2025 se exige aprobación previa de la junta.", "community", true, "horizontal_property"),
          check("vft_registration", "Inscripción en el Registro de Turismo de Andalucía y número de registro UE", "Obligatoria para anunciar; el Reglamento (UE) 2024/1028 aplica desde mayo de 2026.", "lawyer", true, "tourism"),
        ],
      },
      inputs,
      assumptions,
      transformation: { level: "medium", estimate },
      exitKind: "rent",
    };
  },
};

export const STRATEGY_PLUGINS: StrategyPlugin[] = [flipIntegral, flipLight, redistributionSale, renovateRent, buyHold, changeOfUse, subdivision, energyRetrofitSale, saleWithLicence, touristRental];

export function strategyById(id: string): StrategyPlugin | undefined {
  return STRATEGY_PLUGINS.find((s) => s.id === id);
}

export type { StrategyEvaluation };
