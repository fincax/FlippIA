import { annualize, round2, round4 } from "@/modules/core/math";
import {
  computeAcquisitionTaxes,
  computeExitTaxes,
  computeWorksTaxes,
  resolveTaxRules,
  type TaxRuleSet,
} from "@/modules/tax";
import { buildSchedule, normalizeInstrument, sizeInstrument, type InstrumentSchedule } from "./financing";
import { irr, monthlyToAnnual } from "./irr";
import { worstStatus, type EvidenceStatus } from "@/modules/core/evidence-status";
import type {
  CashflowPoint,
  ConceptBreakdown,
  CostLine,
  FinancialInputs,
  FinancialResult,
  MetricKey,
  MetricValue,
  TaxComponent,
  TaxRecoverability,
  TaxSummary,
} from "./types";

export class FinancialEngineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

/**
 * Deterministic financial engine. Given explicit inputs and a resolved tax
 * rule set, produces the full cost breakdown, monthly cash flows and metrics.
 * No LLM is ever involved here.
 */
export function computeFinancials(inputs: FinancialInputs, rulesOverride?: TaxRuleSet): FinancialResult {
  const rules = rulesOverride ?? resolveTaxRules(inputs.jurisdiction, inputs.analysisDate);
  if (!rules) {
    throw new FinancialEngineError(
      `No tax rule set found for ${JSON.stringify(inputs.jurisdiction)} on ${inputs.analysisDate}`,
      "TAX_RULES_NOT_FOUND",
    );
  }
  validate(inputs);

  const warnings: string[] = [];
  const reviewItems: string[] = [];
  const lines: CostLine[] = [];
  const { acquisition, holding, exit } = inputs;
  const duration = holding.durationMonths;
  // Works with a budget but no calendar cannot be executed: give them one month and say so.
  const rawWorksMonths = inputs.transformation.worksMonths;
  let worksMonthsEff = Math.min(Math.max(0, rawWorksMonths), duration);
  if (inputs.transformation.renovationBudget > 0 && worksMonthsEff < 1) {
    worksMonthsEff = 1;
    warnings.push(
      `Presupuesto de obra positivo con ${rawWorksMonths} meses de obra: se asume 1 mes de ejecución.`,
    );
  } else if (worksMonthsEff !== rawWorksMonths)
    warnings.push(
      `Meses de obra (${rawWorksMonths}) superan la duración del proyecto; ajustados a ${worksMonthsEff}.`,
    );
  const transformation = { ...inputs.transformation, worksMonths: worksMonthsEff };

  // ── Tax treatment the engine cannot decide ─────────────────────────────────
  // Input VAT recoverability is never assumed: absent → UNKNOWN, treated as a
  // cost and flagged for review. A professional states it (0..1) when known.
  const vatRatio = inputs.tax?.vatRecoverabilityRatio;
  const vatRecoverability: TaxRecoverability =
    vatRatio === undefined ? "unknown" : vatRatio >= 1 ? "full" : vatRatio <= 0 ? "none" : "partial";
  const vatRecoverStatus: EvidenceStatus = vatRatio === undefined ? "REVIEW_REQUIRED" : "INFERRED";
  const recoverable = (amount: number) => (vatRatio === undefined ? 0 : round2(amount * vatRatio));
  const taxComponents: TaxComponent[] = [];
  const addTax = (
    c: Omit<TaxComponent, "recoverableAmount" | "nonRecoverableAmount" | "recoverability"> & {
      recoverable?: boolean;
    },
  ) => {
    const rec = c.recoverable ? recoverable(c.amount) : 0;
    const { recoverable: _r, ...rest } = c;
    void _r;
    taxComponents.push({
      ...rest,
      recoverableAmount: rec,
      nonRecoverableAmount: round2(c.amount - rec),
      recoverability: c.recoverable ? vatRecoverability : "none",
    });
  };

  // ── Acquisition ─────────────────────────────────────────────────────────────
  const purchase = acquisition.purchasePrice;
  lines.push({
    key: "purchase",
    category: "purchase",
    label: "Precio de compra",
    amount: purchase,
    origin: "input",
  });
  const acqOpts = {
    assetUse: acquisition.assetUse === "residential" ? "residential" : "commercial",
  } as const;
  // Notary and registry scales run on the deed value (the price); the transfer tax on its taxable base,
  // which is the price unless a professional states otherwise.
  const acqFees = computeAcquisitionTaxes(purchase, acquisition.transferTaxMode, rules, acqOpts);
  const taxableBase = acquisition.taxableBase ?? purchase;
  const acqOnBase =
    taxableBase === purchase
      ? acqFees
      : computeAcquisitionTaxes(taxableBase, acquisition.transferTaxMode, rules, acqOpts);
  const transferTaxRule = acqOnBase.transferTax;
  const transferTax = acquisition.transferTaxManual ?? transferTaxRule;
  const acqTax = {
    mode: acqOnBase.mode,
    transferTax,
    ajd: acqOnBase.ajd,
    notary: acqFees.notary,
    registry: acqFees.registry,
    total: round2(transferTax + acqOnBase.ajd + acqFees.notary + acqFees.registry),
  };
  const transferIsVat = acqTax.mode !== "ITP";
  lines.push({
    key: "transfer_tax",
    category: "acquisition_taxes",
    label: transferIsVat ? "IVA" : "ITP",
    amount: acqTax.transferTax,
    origin: acquisition.transferTaxManual !== undefined ? "input" : "rule",
    ruleRef: rules.id,
    note:
      acquisition.transferTaxManual !== undefined
        ? `Liquidación indicada por un profesional; la regla estimaba ${transferTaxRule}.`
        : acquisition.taxableBase !== undefined
          ? `Base imponible ${taxableBase}, distinta del precio.`
          : undefined,
  });
  addTax({
    key: "transfer_tax",
    type: transferIsVat ? "IVA" : "ITP",
    label: transferIsVat ? "IVA de adquisición" : "ITP",
    concept: "acquisition",
    taxableBase,
    rate:
      acquisition.transferTaxManual !== undefined
        ? undefined
        : transferIsVat
          ? acqOpts.assetUse === "commercial"
            ? rules.acquisition.ivaCommercial
            : rules.acquisition.ivaResidentialNew
          : rules.acquisition.itpRate,
    amount: acqTax.transferTax,
    settlement: "normal",
    source: acquisition.transferTaxManual !== undefined ? "professional" : "rule",
    ruleRef: rules.id,
    status: acquisition.transferTaxManual !== undefined ? "INFERRED" : rules.status,
    estimatedAmount: acquisition.transferTaxManual !== undefined ? transferTaxRule : undefined,
    recoverable: transferIsVat,
    note: transferIsVat
      ? "IVA soportado en la compra: recuperable solo si procede."
      : "ITP: nunca recuperable.",
  });
  if (acqTax.ajd > 0) {
    lines.push({
      key: "ajd",
      category: "acquisition_taxes",
      label: "AJD",
      amount: acqTax.ajd,
      origin: "rule",
      ruleRef: rules.id,
    });
    addTax({
      key: "ajd",
      type: "AJD",
      label: "AJD",
      concept: "acquisition",
      taxableBase,
      rate: rules.acquisition.ajdRate,
      amount: acqTax.ajd,
      settlement: "normal",
      source: "rule",
      ruleRef: rules.id,
      status: rules.status,
    });
  }
  lines.push({
    key: "notary",
    category: "notary",
    label: "Notaría (estimación arancel)",
    amount: acqTax.notary,
    origin: "rule",
    ruleRef: rules.id,
    note: "Estimación sobre escala base.",
  });
  lines.push({
    key: "registry",
    category: "registry",
    label: "Registro (estimación arancel)",
    amount: acqTax.registry,
    origin: "rule",
    ruleRef: rules.id,
  });
  if (acquisition.agencyFee > 0)
    lines.push({
      key: "agency_buy",
      category: "agency",
      label: "Agencia (compra)",
      amount: acquisition.agencyFee,
      origin: "input",
    });
  if (acquisition.dueDiligence > 0)
    lines.push({
      key: "due_diligence",
      category: "professional_fees",
      label: "Due diligence técnica y legal",
      amount: acquisition.dueDiligence,
      origin: "input",
    });
  const acquisitionCosts = round2(acqTax.total + acquisition.agencyFee + acquisition.dueDiligence);

  // ── Transformation ──────────────────────────────────────────────────────────
  const worksVat = transformation.worksVatReduced
    ? rules.works.ivaWorksReducedRate
    : rules.works.ivaWorksRate;
  const construction = round2(transformation.renovationBudget * (1 + worksVat));
  const contingency = round2(transformation.renovationBudget * transformation.contingencyRate);
  const worksTax = computeWorksTaxes(transformation.renovationBudget, rules);
  const constructionVat = round2(construction - transformation.renovationBudget);
  if (transformation.renovationBudget > 0) {
    lines.push({
      key: "construction",
      category: "construction",
      label: `Obra (PEM + IVA ${Math.round(worksVat * 100)} %)`,
      amount: construction,
      origin: "computed",
      note: transformation.worksVatReduced
        ? "IVA reducido aplicado: requiere cumplir requisitos de rehabilitación."
        : undefined,
    });
    addTax({
      key: "construction_vat",
      type: "IVA",
      label: `IVA de obra (${Math.round(worksVat * 100)} %)`,
      concept: "construction",
      taxableBase: transformation.renovationBudget,
      rate: worksVat,
      amount: constructionVat,
      settlement: "normal",
      source: "rule",
      ruleRef: rules.id,
      status: transformation.worksVatReduced ? "REVIEW_REQUIRED" : rules.status,
      recoverable: true,
      note: "Incluido en la línea de obra; recuperable solo según la deducibilidad indicada.",
    });
    addTax({
      key: "icio",
      type: "ICIO",
      label: "ICIO",
      concept: "construction",
      taxableBase: transformation.renovationBudget,
      rate: rules.works.icioRate,
      amount: worksTax.icio,
      settlement: "normal",
      source: "rule",
      ruleRef: rules.id,
      status: rules.status,
    });
    addTax({
      key: "licence_fee",
      type: "TASA",
      label: "Tasa de licencia",
      concept: "construction",
      taxableBase: transformation.renovationBudget,
      rate: rules.works.licenceFeeRate,
      amount: worksTax.licenceFee,
      settlement: "normal",
      source: "rule",
      ruleRef: rules.id,
      status: rules.status,
    });
    lines.push({
      key: "contingency",
      category: "contingency",
      label: `Contingencia (${Math.round(transformation.contingencyRate * 100)} %)`,
      amount: contingency,
      origin: "computed",
    });
    lines.push({
      key: "icio",
      category: "licences",
      label: "ICIO",
      amount: worksTax.icio,
      origin: "rule",
      ruleRef: rules.id,
    });
    lines.push({
      key: "licence_fee",
      category: "licences",
      label: "Tasa de licencia / declaración responsable",
      amount: worksTax.licenceFee,
      origin: "rule",
      ruleRef: rules.id,
    });
    if (transformation.worksVatReduced)
      reviewItems.push(
        "IVA reducido en obra: verificar requisitos (destino vivienda, >50 % del valor, etc.).",
      );
  }
  if (transformation.professionalFees > 0)
    lines.push({
      key: "architecture",
      category: "architecture",
      label: "Honorarios técnicos",
      amount: transformation.professionalFees,
      origin: "input",
    });
  if (transformation.otherLicenceCosts > 0)
    lines.push({
      key: "licence_other",
      category: "licences",
      label: "Otros costes de licencia",
      amount: transformation.otherLicenceCosts,
      origin: "input",
    });
  const transformationTotal = round2(
    construction +
      contingency +
      worksTax.total +
      transformation.professionalFees +
      transformation.otherLicenceCosts,
  );

  // ── Holding ────────────────────────────────────────────────────────────────
  const monthlyHolding =
    holding.monthlyCommunityFees +
    holding.monthlyInsurance +
    holding.monthlyUtilities +
    holding.otherMonthly +
    holding.annualPropertyTax / 12;
  const holdingTotal = round2(monthlyHolding * duration);
  if (holding.monthlyCommunityFees > 0)
    lines.push({
      key: "community",
      category: "community",
      label: "Comunidad",
      amount: round2(holding.monthlyCommunityFees * duration),
      origin: "computed",
    });
  if (holding.monthlyInsurance > 0)
    lines.push({
      key: "insurance",
      category: "insurance",
      label: "Seguro",
      amount: round2(holding.monthlyInsurance * duration),
      origin: "computed",
    });
  if (holding.monthlyUtilities > 0)
    lines.push({
      key: "utilities",
      category: "utilities",
      label: "Suministros",
      amount: round2(holding.monthlyUtilities * duration),
      origin: "computed",
    });
  if (holding.annualPropertyTax > 0) {
    lines.push({
      key: "ibi",
      category: "taxes",
      label: "IBI",
      amount: round2((holding.annualPropertyTax / 12) * duration),
      origin: "computed",
    });
    addTax({
      key: "ibi",
      type: "IBI",
      label: "IBI",
      concept: "holding",
      taxableBase: holding.annualPropertyTax,
      amount: round2((holding.annualPropertyTax / 12) * duration),
      settlement: "normal",
      source: "input",
      status: "INFERRED",
    });
  }
  if (holding.otherMonthly > 0)
    lines.push({
      key: "holding_other",
      category: "holding",
      label: "Otros costes de tenencia",
      amount: round2(holding.otherMonthly * duration),
      origin: "computed",
    });

  // ── Financing ──────────────────────────────────────────────────────────────
  const costBeforeFinancing = round2(purchase + acquisitionCosts + transformationTotal + holdingTotal);
  const normalizedFinancing = inputs.financing.map((f) => {
    const n = normalizeInstrument(f, duration);
    warnings.push(...n.warnings);
    return n.instrument;
  });
  const schedules: InstrumentSchedule[] = normalizedFinancing
    .filter((f) => f.kind !== "partner_equity" && f.kind !== "co_investment")
    .map((f) =>
      buildSchedule(
        f,
        sizeInstrument(f, { purchasePrice: purchase, totalCostBeforeFinancing: costBeforeFinancing }),
        duration,
      ),
    );
  const equityPartners = normalizedFinancing.filter(
    (f) => f.kind === "partner_equity" || f.kind === "co_investment",
  );
  const partnerCapital = equityPartners.map((f) => ({
    f,
    amount: sizeInstrument(f, { purchasePrice: purchase, totalCostBeforeFinancing: costBeforeFinancing }),
  }));

  const arrangementFees = round2(schedules.reduce((a, s) => a + s.arrangementFee, 0));
  const interestTotal = round2(schedules.reduce((a, s) => a + s.interestTotal, 0));
  if (arrangementFees > 0)
    lines.push({
      key: "financing_fees",
      category: "financing_fees",
      label: "Comisiones de financiación",
      amount: arrangementFees,
      origin: "computed",
    });
  if (interestTotal > 0)
    lines.push({
      key: "interest",
      category: "interest",
      label: "Intereses",
      amount: interestTotal,
      origin: "computed",
    });
  const financingTotal = round2(arrangementFees + interestTotal);
  const totalDebt = round2(schedules.reduce((a, s) => a + s.principal, 0));
  if (totalDebt > costBeforeFinancing) warnings.push("La deuda supera el coste total antes de financiación.");

  // ── Exit ───────────────────────────────────────────────────────────────────
  let saleCosts = 0;
  let exitTaxes = 0;
  let grossRevenue = 0;
  let rentNet = 0;
  let plusvaliaUnknown = false;
  const totalProjectCost = round2(costBeforeFinancing + financingTotal);
  // Economic cost vs cash: recoverable input VAT is financed but not borne.
  const recoverableTotal = round2(taxComponents.reduce((a, c) => a + c.recoverableAmount, 0));
  const effectiveProjectCost = round2(totalProjectCost - recoverableTotal);

  if (exit.kind === "sale") {
    const agency = round2(exit.salePrice * exit.agencyRate);
    saleCosts = round2(agency + exit.otherSaleCosts);
    if (agency > 0)
      lines.push({
        key: "agency_sell",
        category: "sales_costs",
        label: "Agencia (venta)",
        amount: agency,
        origin: "computed",
      });
    if (exit.otherSaleCosts > 0)
      lines.push({
        key: "sale_other",
        category: "sales_costs",
        label: "Otros costes de venta",
        amount: exit.otherSaleCosts,
        origin: "input",
      });
    grossRevenue = exit.salePrice;
    const gain = exit.salePrice - saleCosts - effectiveProjectCost;
    const exitTax = computeExitTaxes(gain, exit.sellerProfile, rules, exit.plusvaliaMunicipal);
    exitTaxes = exitTax.total;
    plusvaliaUnknown = exit.plusvaliaMunicipal === null;
    if (exitTax.incomeTax > 0) {
      lines.push({
        key: "exit_income_tax",
        category: "exit_taxes",
        label: exit.sellerProfile === "individual" ? "IRPF ganancia patrimonial" : "Impuesto de Sociedades",
        amount: exitTax.incomeTax,
        origin: "rule",
        ruleRef: rules.id,
      });
      addTax({
        key: "exit_income_tax",
        type: exit.sellerProfile === "individual" ? "IRPF" : "IS",
        label: exit.sellerProfile === "individual" ? "IRPF ganancia patrimonial" : "Impuesto de Sociedades",
        concept: "exit",
        taxableBase: exitTax.taxableGain,
        rate: exit.sellerProfile === "company" ? rules.exit.corporateTaxRate : undefined,
        amount: exitTax.incomeTax,
        settlement: "normal",
        source: "rule",
        ruleRef: rules.id,
        status: "INFERRED",
        note: "Fiscalidad directa del inversor: fuera del beneficio del proyecto, estimada con el perfil indicado.",
      });
    }
    if (exit.plusvaliaMunicipal) {
      lines.push({
        key: "plusvalia",
        category: "exit_taxes",
        label: "Plusvalía municipal",
        amount: exit.plusvaliaMunicipal,
        origin: "input",
      });
      addTax({
        key: "plusvalia",
        type: "IIVTNU",
        label: "Plusvalía municipal",
        concept: "exit",
        taxableBase: 0,
        amount: exit.plusvaliaMunicipal,
        settlement: "normal",
        source: "input",
        status: "INFERRED",
      });
    }
    if (plusvaliaUnknown)
      reviewItems.push(
        "Plusvalía municipal (IIVTNU) no calculada: requiere valor catastral del suelo y fecha de adquisición.",
      );
  } else {
    const worksEnd = Math.min(transformation.worksMonths, duration);
    const rentMonths = Math.max(0, duration - worksEnd);
    const gross = exit.monthlyRent * rentMonths;
    const effective = gross * (1 - exit.vacancyRate);
    const opex = effective * exit.opexRate;
    rentNet = round2(effective - opex);
    grossRevenue = round2(effective);
    const terminalAgency = round2(exit.terminalValue * exit.terminalAgencyRate);
    saleCosts = terminalAgency;
    if (terminalAgency > 0)
      lines.push({
        key: "agency_sell",
        category: "sales_costs",
        label: "Agencia (venta terminal)",
        amount: terminalAgency,
        origin: "computed",
      });
    reviewItems.push(
      "Fiscalidad de rentas de alquiler no incluida en el resultado neto (IRPF/IS sobre rendimientos); revisar con asesor.",
    );
  }

  // ── Cash flows (monthly) ───────────────────────────────────────────────────
  const cash: CashflowPoint[] = [];
  const push = (month: number, inflow: number, outflow: number, label?: string, funding = 0) => {
    const existing = cash.find((c) => c.month === month);
    if (existing) {
      existing.inflow = round2(existing.inflow + inflow);
      existing.outflow = round2(existing.outflow + outflow);
      existing.funding = round2(existing.funding + funding);
      if (label) existing.label = existing.label ? `${existing.label}, ${label}` : label;
    } else
      cash.push({
        month,
        inflow: round2(inflow),
        outflow: round2(outflow),
        funding: round2(funding),
        net: 0,
        cumulative: 0,
        label,
      });
  };
  push(
    0,
    0,
    purchase +
      acquisitionCosts +
      transformation.professionalFees +
      transformation.otherLicenceCosts +
      worksTax.total,
    "Adquisición",
  );
  const worksMonths = Math.max(1, transformation.worksMonths);
  const worksPerMonth = (construction + contingency) / worksMonths;
  for (let m = 1; m <= duration; m++) {
    const out =
      monthlyHolding + (m <= worksMonths && transformation.renovationBudget > 0 ? worksPerMonth : 0);
    push(m, 0, out);
  }
  for (const s of schedules) {
    push(
      s.instrument.drawMonth,
      s.principal,
      s.arrangementFee,
      `Disposición ${s.instrument.label}`,
      s.principal,
    );
    for (const sm of s.months) push(sm.month, 0, sm.payment);
    if (s.outstandingAtExit > 0) push(duration, 0, s.outstandingAtExit, `Cancelación ${s.instrument.label}`);
  }
  // Recoverable input VAT comes back at the exit month (prudent: no recovery calendar is modelled),
  // so the equity requirement is sized on gross cash.
  if (recoverableTotal > 0) push(duration, recoverableTotal, 0, "Recuperación de IVA");
  // Partner capital comes in at draw and goes back at exit together with the agreed profit share.
  const provisionalNet =
    exit.kind === "sale"
      ? exit.salePrice - saleCosts - effectiveProjectCost
      : rentNet + exit.terminalValue - saleCosts - effectiveProjectCost;
  for (const p of partnerCapital) {
    push(p.f.drawMonth, p.amount, 0, `Aportación ${p.f.label}`, p.amount);
    const share = round2(Math.max(0, provisionalNet) * (p.f.profitShare ?? 0));
    push(duration, 0, round2(p.amount + share), `Devolución ${p.f.label}`);
  }
  if (exit.kind === "sale") {
    push(duration, exit.salePrice, saleCosts + exitTaxes, "Venta");
  } else {
    const worksEnd = Math.min(transformation.worksMonths, duration);
    const rentMonths = Math.max(0, duration - worksEnd);
    const monthlyNet = rentMonths > 0 ? rentNet / rentMonths : 0;
    for (let m = worksEnd + 1; m <= duration; m++) push(m, monthlyNet, 0);
    push(duration, exit.terminalValue, saleCosts, "Valor terminal");
  }
  cash.sort((a, b) => a.month - b.month);
  let cum = 0;
  let peakNeed = 0;
  for (const c of cash) {
    c.net = round2(c.inflow - c.outflow);
    // Within a month: financing draws arrive first, then outflows are paid,
    // then operating/exit inflows arrive (conservative for equity sizing).
    // At the exit month everything settles at closing: proceeds cover costs.
    const intraMonthLow = c.month === duration ? round2(cum + c.net) : round2(cum + c.funding - c.outflow);
    if (intraMonthLow < peakNeed) peakNeed = intraMonthLow;
    cum = round2(cum + c.net);
    c.cumulative = cum;
  }
  const equityRequired = round2(-peakNeed);
  const partnerCapitalTotal = round2(partnerCapital.reduce((a, p) => a + p.amount, 0));
  const ownEquity = round2(Math.max(0, equityRequired));

  // ── Profit & metrics ───────────────────────────────────────────────────────
  let grossProfit: number;
  let netProfit: number;
  let partnerShare = 0;
  // Profit is economic: on the effective cost (recoverable VAT excluded), before the investor's own tax.
  const effectiveCostBeforeFinancing = round2(costBeforeFinancing - recoverableTotal);
  if (exit.kind === "sale") {
    grossProfit = round2(exit.salePrice - saleCosts - effectiveCostBeforeFinancing);
    netProfit = round2(exit.salePrice - saleCosts - effectiveProjectCost);
  } else {
    grossProfit = round2(rentNet + exit.terminalValue - saleCosts - effectiveCostBeforeFinancing);
    netProfit = round2(rentNet + exit.terminalValue - saleCosts - effectiveProjectCost);
  }
  for (const p of partnerCapital) partnerShare += Math.max(0, netProfit) * (p.f.profitShare ?? 0);
  partnerShare = round2(partnerShare);
  const netProfitOwner = round2(netProfit - partnerShare);
  const netProfitAfterTax = round2(netProfitOwner - exitTaxes);
  const totalCashOut = round2(totalProjectCost + saleCosts + exitTaxes);

  const monthlyIrr = irr(cash.map((c) => c.net));
  const annualIrr = monthlyIrr === null ? null : round4(monthlyToAnnual(monthlyIrr));
  const roi = effectiveProjectCost > 0 ? round4(netProfitOwner / effectiveProjectCost) : null;
  const roe = ownEquity > 0 ? round4(netProfitOwner / ownEquity) : null;
  const annualizedRoe = roe === null ? null : round4(annualize(roe, duration));
  const margin = exit.kind === "sale" && exit.salePrice > 0 ? round4(netProfitOwner / exit.salePrice) : null;

  // Rent-specific
  let capRate: number | null = null;
  let grossYield: number | null = null;
  let netYield: number | null = null;
  let dscr: number | null = null;
  let cashOnCash: number | null = null;
  let breakEvenRent: number | null = null;
  if (exit.kind === "rent") {
    const annualGross = exit.monthlyRent * 12;
    const annualNoi = annualGross * (1 - exit.vacancyRate) * (1 - exit.opexRate);
    const basis = round2(costBeforeFinancing - holdingTotal); // all-in acquisition + transformation
    capRate = basis > 0 ? round4(annualNoi / basis) : null;
    grossYield = basis > 0 ? round4(annualGross / basis) : null;
    const annualHolding = monthlyHolding * 12;
    netYield = basis > 0 ? round4((annualNoi - annualHolding) / basis) : null;
    const annualDebtService = round2(schedules.reduce((a, s) => a + (s.months[0]?.payment ?? 0) * 12, 0));
    dscr = annualDebtService > 0 ? round4(annualNoi / annualDebtService) : null;
    cashOnCash = ownEquity > 0 ? round4((annualNoi - annualHolding - annualDebtService) / ownEquity) : null;
    const monthlyDebtService = annualDebtService / 12;
    breakEvenRent = round2(
      (monthlyHolding + monthlyDebtService) / ((1 - exit.vacancyRate) * (1 - exit.opexRate)),
    );
  }

  const breakEvenPrice =
    exit.kind === "sale"
      ? round2(effectiveProjectCost / (1 - exit.agencyRate) + exit.otherSaleCosts / (1 - exit.agencyRate))
      : null;
  const ltv = purchase > 0 ? round4(totalDebt / purchase) : null;
  const ltc = costBeforeFinancing > 0 ? round4(totalDebt / costBeforeFinancing) : null;

  const metric = (
    key: MetricKey,
    value: number | null,
    unit: MetricValue["unit"],
    formula: string,
    explanation: string,
    inp: Record<string, number | null>,
  ): MetricValue => ({ key, value, unit, formula, explanation, inputs: inp });

  const metrics: Record<MetricKey, MetricValue> = {
    totalProjectCost: metric(
      "totalProjectCost",
      totalProjectCost,
      "currency",
      "compra + impuestos + gastos + transformación + tenencia + financiación",
      "Todo lo que cuesta llevar el activo hasta la salida, sin costes de venta ni impuestos de salida.",
      { purchase, acquisitionCosts, transformationTotal, holdingTotal, financingTotal },
    ),
    totalCashOut: metric(
      "totalCashOut",
      totalCashOut,
      "currency",
      "coste total + costes de venta + impuestos de salida",
      "Salida total de caja del proyecto.",
      { totalProjectCost, saleCosts, exitTaxes },
    ),
    equityRequired: metric(
      "equityRequired",
      ownEquity,
      "currency",
      "máximo déficit acumulado de caja",
      "Capital propio necesario en el peor momento del proyecto, tras deuda y aportaciones de socios.",
      { peakNeed, partnerCapitalTotal },
    ),
    debt: metric(
      "debt",
      totalDebt,
      "currency",
      "Σ principal de instrumentos de deuda",
      "Deuda total dispuesta.",
      { totalDebt },
    ),
    ltv: metric("ltv", ltv, "ratio", "deuda / precio de compra", "Loan-to-Value.", { totalDebt, purchase }),
    ltc: metric("ltc", ltc, "ratio", "deuda / coste antes de financiación", "Loan-to-Cost.", {
      totalDebt,
      costBeforeFinancing,
    }),
    grossProfit: metric(
      "grossProfit",
      grossProfit,
      "currency",
      "ingresos − costes de venta − coste efectivo antes de financiación",
      "Beneficio antes de financiación y antes de la fiscalidad directa del inversor (IRPF/IS).",
      { grossRevenue, saleCosts, effectiveCostBeforeFinancing },
    ),
    netProfit: metric(
      "netProfit",
      netProfitOwner,
      "currency",
      "ingresos − costes de venta − coste efectivo − participación de socios",
      "Beneficio operativo del proyecto: coste efectivo (IVA recuperable descontado), antes de IRPF/IS del inversor.",
      { grossRevenue, saleCosts, effectiveProjectCost, partnerShare },
    ),
    netProfitAfterTax: metric(
      "netProfitAfterTax",
      netProfitAfterTax,
      "currency",
      "beneficio neto − impuestos de salida",
      "Beneficio después de IRPF/IS sobre la ganancia (plusvalía municipal solo si se conoce).",
      { netProfitOwner, exitTaxes },
    ),
    margin: metric("margin", margin, "ratio", "beneficio neto / precio de venta", "Margen sobre ventas.", {
      netProfitOwner,
      salePrice: exit.kind === "sale" ? exit.salePrice : null,
    }),
    roi: metric(
      "roi",
      roi,
      "ratio",
      "beneficio neto / coste efectivo",
      "Retorno sobre el coste económico efectivo del proyecto, antes de IRPF/IS del inversor.",
      { netProfitOwner, effectiveProjectCost },
    ),
    roe: metric(
      "roe",
      roe,
      "ratio",
      "beneficio neto / capital propio",
      "Retorno sobre el capital propio aportado, antes de IRPF/IS del inversor.",
      { netProfitOwner, ownEquity },
    ),
    annualizedRoe: metric(
      "annualizedRoe",
      annualizedRoe,
      "ratio",
      "(1 + ROE)^(12 / meses) − 1",
      "ROE anualizado según la duración.",
      { roe, duration },
    ),
    irr: metric(
      "irr",
      annualIrr,
      "ratio",
      "TIR de los flujos mensuales, anualizada",
      "Tasa interna de retorno de los flujos de caja del proyecto.",
      { months: duration },
    ),
    cashOnCash: metric(
      "cashOnCash",
      cashOnCash,
      "ratio",
      "(NOI − tenencia − servicio de deuda) / capital propio",
      "Rentabilidad anual de caja sobre capital propio (alquiler).",
      { ownEquity },
    ),
    capRate: metric(
      "capRate",
      capRate,
      "ratio",
      "NOI anual / coste de adquisición + transformación",
      "Rentabilidad neta de explotación sobre la inversión.",
      {},
    ),
    grossYield: metric(
      "grossYield",
      grossYield,
      "ratio",
      "renta bruta anual / inversión",
      "Rentabilidad bruta.",
      {},
    ),
    netYield: metric("netYield", netYield, "ratio", "(NOI − tenencia) / inversión", "Rentabilidad neta.", {}),
    dscr: metric(
      "dscr",
      dscr,
      "number",
      "NOI anual / servicio de deuda anual",
      "Cobertura del servicio de la deuda.",
      {},
    ),
    breakEvenPrice: metric(
      "breakEvenPrice",
      breakEvenPrice,
      "currency",
      "coste efectivo / (1 − comisión de venta)",
      "Precio de venta al que el beneficio neto es cero.",
      { effectiveProjectCost },
    ),
    breakEvenRent: metric(
      "breakEvenRent",
      breakEvenRent,
      "currency",
      "(tenencia mensual + servicio de deuda) / ((1 − vacancia)(1 − opex))",
      "Renta mensual mínima para cubrir costes.",
      {},
    ),
    durationMonths: metric(
      "durationMonths",
      duration,
      "months",
      "meses desde compra hasta salida",
      "Duración total del proyecto.",
      { duration },
    ),
    effectiveProjectCost: metric(
      "effectiveProjectCost",
      effectiveProjectCost,
      "currency",
      "coste total − IVA recuperable",
      "Coste económico efectivo: lo que el proyecto soporta una vez recuperado el IVA deducible. La caja necesaria sigue siendo el coste total.",
      { totalProjectCost, recoverableTotal },
    ),
    recoverableTax: metric(
      "recoverableTax",
      recoverableTotal,
      "currency",
      "Σ IVA soportado × deducibilidad",
      vatRatio === undefined
        ? "Deducibilidad del IVA no determinada: se trata como coste hasta que un profesional la indique."
        : `IVA soportado recuperable con una deducibilidad del ${Math.round(vatRatio * 100)} %.`,
      { recoverableTotal, vatRatio: vatRatio ?? null },
    ),
  };

  // ── Taxes separated from prices ─────────────────────────────────────────────
  const componentsOf = (concept: string) => taxComponents.filter((c) => c.concept === concept);
  const conceptOf = (
    key: ConceptBreakdown["key"],
    label: string,
    base: number,
    comps: TaxComponent[],
    note?: string,
    unresolved = false,
  ): ConceptBreakdown => {
    const taxAmount = round2(comps.reduce((a, c) => a + c.amount, 0));
    const rec = round2(comps.reduce((a, c) => a + c.recoverableAmount, 0));
    const gross = round2(base + taxAmount);
    return {
      key,
      label,
      base: round2(base),
      taxAmount,
      gross,
      recoverableTax: rec,
      effectiveCost: round2(gross - rec),
      cashRequirement: gross,
      taxStatus: unresolved ? "UNKNOWN" : comps.length ? worstStatus(comps.map((c) => c.status)) : "VERIFIED",
      componentKeys: comps.map((c) => c.key),
      note,
    };
  };
  const acquisitionComps = componentsOf("acquisition");
  const constructionComps = componentsOf("construction").filter((c) => c.type === "IVA");
  const concepts: ConceptBreakdown[] = [
    conceptOf(
      "acquisition",
      "Adquisición (precio e impuestos de transmisión)",
      purchase,
      acquisitionComps,
      "Notaría, registro, agencia y due diligence se muestran como gastos aparte.",
    ),
  ];
  if (transformation.renovationBudget > 0)
    concepts.push(
      conceptOf(
        "construction",
        "Obra (PEM e IVA)",
        transformation.renovationBudget,
        constructionComps,
        "ICIO y tasa de licencia son tributos propios, aparte de la obra.",
      ),
    );
  if (transformation.professionalFees > 0)
    concepts.push(
      conceptOf(
        "professional_fees",
        "Honorarios técnicos",
        transformation.professionalFees,
        [],
        "Importe sin IVA; tratamiento fiscal no determinado por el motor.",
        true,
      ),
    );
  if (saleCosts > 0)
    concepts.push(
      conceptOf(
        "sale_costs",
        exit.kind === "sale"
          ? "Costes de venta (comisión sobre el precio de venta y otros)"
          : "Costes de venta terminal",
        saleCosts,
        [],
        "Comisión calculada sobre su base contractual, sin IVA; tratamiento fiscal no determinado por el motor.",
        true,
      ),
    );
  const inputVat = taxComponents.filter((c) => c.type === "IVA" && c.concept !== "exit");
  const inputVatTotal = round2(inputVat.reduce((a, c) => a + c.amount, 0));
  if (vatRatio === undefined && inputVatTotal > 0)
    reviewItems.push(
      `Deducibilidad del IVA soportado (${inputVatTotal} €) no determinada: se trata como coste. Un profesional puede indicarla en Datos profesionales.`,
    );
  if (transformation.professionalFees > 0 || saleCosts > 0)
    reviewItems.push("Honorarios y comisiones: importes sin IVA; su tratamiento fiscal no está determinado.");
  const tax: TaxSummary = {
    components: taxComponents,
    concepts,
    recoverableTotal,
    nonRecoverableTotal: round2(taxComponents.reduce((a, c) => a + c.nonRecoverableAmount, 0)),
    effectiveProjectCost,
    cashRequirement: totalProjectCost,
    vatRecoverability: {
      ratio: vatRatio ?? 0,
      recoverability: vatRecoverability,
      status: vatRecoverStatus,
      note:
        vatRatio === undefined
          ? "No determinada: depende del sujeto, la actividad y el destino del inmueble. Tratada como coste."
          : `Indicada: ${Math.round(vatRatio * 100)} % del IVA soportado se recupera; devolución asumida en el mes de salida.`,
    },
  };

  if (exit.kind === "sale" && exit.salePrice <= (breakEvenPrice ?? 0))
    warnings.push("El precio de venta no cubre el coste total: beneficio negativo.");
  if (ownEquity === 0 && totalDebt > 0)
    warnings.push("La estructura de financiación cubre el 100 % de la necesidad de caja; revisar realismo.");

  return {
    inputs,
    taxRuleSetId: rules.id,
    costLines: lines,
    totals: {
      purchase,
      acquisitionCosts,
      transformation: transformationTotal,
      holding: holdingTotal,
      financing: financingTotal,
      saleCosts,
      exitTaxes,
      totalProjectCost,
      totalCashOut,
    },
    financing: {
      instruments: [
        ...schedules.map((s) => ({
          label: s.instrument.label,
          kind: s.instrument.kind,
          principal: s.principal,
          arrangementFee: s.arrangementFee,
          interest: s.interestTotal,
          totalCost: round2(s.arrangementFee + s.interestTotal),
          outstandingAtExit: s.outstandingAtExit,
          profitShare: 0,
        })),
        ...partnerCapital.map((p) => ({
          label: p.f.label,
          kind: p.f.kind,
          principal: round2(p.amount),
          arrangementFee: 0,
          interest: 0,
          totalCost: round2(Math.max(0, netProfit) * (p.f.profitShare ?? 0)),
          outstandingAtExit: round2(p.amount),
          profitShare: p.f.profitShare ?? 0,
        })),
      ],
      totalDebt,
      totalFinancingCost: round2(financingTotal + partnerShare),
    },
    cashflows: cash,
    metrics,
    tax,
    warnings,
    reviewItems,
  };
}

function validateNumericLeaves(value: unknown, path: string) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new FinancialEngineError(`${path} must be finite`, "INVALID_INPUT");
    if (value < 0) throw new FinancialEngineError(`${path} must be non-negative`, "INVALID_INPUT");
    const leaf = path.split(".").at(-1) ?? "";
    if (/(Rate|Share|vacancy|opex)$/i.test(leaf) && value >= 1 && !/^annualRate$/.test(leaf))
      throw new FinancialEngineError(`${path} must be below 1 (100 %)`, "INVALID_INPUT");
    return;
  }
  if (Array.isArray(value)) value.forEach((v, idx) => validateNumericLeaves(v, `${path}.${idx}`));
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) validateNumericLeaves(v, path ? `${path}.${k}` : k);
}

function validate(i: FinancialInputs) {
  validateNumericLeaves(
    {
      acquisition: i.acquisition,
      transformation: i.transformation,
      holding: i.holding,
      financing: i.financing,
      exit: i.exit,
    },
    "",
  );
  const nonNeg: Array<[string, number]> = [
    ["purchasePrice", i.acquisition.purchasePrice],
    ["renovationBudget", i.transformation.renovationBudget],
    ["durationMonths", i.holding.durationMonths],
  ];
  for (const [k, v] of nonNeg) {
    if (!Number.isFinite(v) || v < 0)
      throw new FinancialEngineError(`${k} must be a finite non-negative number`, "INVALID_INPUT");
  }
  if (i.holding.durationMonths < 1)
    throw new FinancialEngineError("durationMonths must be ≥ 1", "INVALID_INPUT");
  if (i.holding.durationMonths > 480)
    throw new FinancialEngineError("durationMonths must be ≤ 480", "INVALID_INPUT");
  const ratio = i.tax?.vatRecoverabilityRatio;
  if (ratio !== undefined && (!Number.isFinite(ratio) || ratio < 0 || ratio > 1))
    throw new FinancialEngineError("tax.vatRecoverabilityRatio must be between 0 and 1", "INVALID_INPUT");
}
