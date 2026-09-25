/**
 * Versioned tax rules. Nothing fiscal is hardcoded inside engines: engines ask
 * for the rule set applicable at a jurisdiction on a date and record its id in
 * the regulatory snapshot of the analysis.
 */
export interface TaxJurisdiction {
  country: string; // ISO 3166-1 alpha-2
  region?: string; // e.g. "AND" (Andalucía)
  municipalityCode?: string; // INE code, e.g. "41091" (Sevilla)
}

export interface TaxBracket {
  upTo: number; // inclusive upper bound, Infinity for last
  rate: number;
}

export interface FeeScaleStep {
  upTo: number;
  /** Fixed amount applied for the first step, or marginal rate for the following ones. */
  fixed?: number;
  marginalRate?: number;
}

export interface TaxRuleSet {
  id: string;
  label: string;
  jurisdiction: TaxJurisdiction;
  effectiveFrom: string; // ISO date
  effectiveUntil?: string;
  /** Regulation ids from the regulatory registry that back these figures. */
  regulationRefs: string[];
  status: "VERIFIED" | "INFERRED" | "REVIEW_REQUIRED";
  notes: string[];
  acquisition: {
    /** Impuesto de Transmisiones Patrimoniales (second-hand transfers). */
    itpRate: number;
    /** Actos Jurídicos Documentados (notarial deeds subject to VAT). */
    ajdRate: number;
    ivaResidentialNew: number;
    ivaCommercial: number;
    notaryScale: FeeScaleStep[];
    registryScale: FeeScaleStep[];
  };
  works: {
    /** Impuesto sobre Construcciones, Instalaciones y Obras, on the material execution budget. */
    icioRate: number;
    /** Municipal licence fee as a share of the budget (tasa). */
    licenceFeeRate: number;
    ivaWorksRate: number;
    ivaWorksReducedRate: number;
  };
  holding: {
    /** IBI as a fraction of cadastral value, used only when cadastral value is known. */
    ibiUrbanRateOnCadastral: number;
  };
  exit: {
    capitalGainsIndividual: TaxBracket[];
    corporateTaxRate: number;
    plusvaliaMunicipal: {
      method: "requires_cadastral_land_value";
      maxRate: number;
      note: string;
    };
  };
}
