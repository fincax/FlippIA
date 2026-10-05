# Auditoría — Datos profesionales y capa económica con impuestos separados

Fecha: 2026-10-05. Precede a cualquier cambio de código. Complementa `docs/MANUAL_INPUT_AUDIT.md` (capacidad A, ya entregada) con la capacidad B (impuestos separados, recuperabilidad, coste efectivo frente a caja).

## Veredicto por capacidad

| Capacidad                                                                           | Estado                                                                                             | Caso |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---- |
| Dato profesional con procedencia, precedencia, reversión, recálculo                 | Existe y funciona (`src/modules/inputs`, ADR-021)                                                  | A    |
| Dato profesional con "impuestos incluidos / excluidos"                              | No existe: todo dato se asume neto                                                                 | H    |
| Honorarios, base imponible, liquidación fiscal, deducibilidad como dato profesional | No existe                                                                                          | H    |
| Reglas fiscales versionadas por jurisdicción y fecha                                | Existe (`src/modules/tax`, `TaxRuleSet`, `resolveTaxRules`)                                        | A    |
| ITP / IVA + AJD según operación                                                     | Existe (`transferTaxMode`, elegido por estado del inmueble)                                        | A    |
| ICIO y tasa como componentes propios (no IVA)                                       | Existe (líneas `icio`, `licence_fee`, categoría `licences`)                                        | A    |
| Notaría y registro como gastos, no impuestos                                        | Existe (categorías `notary`, `registry`)                                                           | A    |
| IVA de obra visible como componente separado                                        | **Embebido** en la línea `construction` («Obra (PEM + IVA 21 %)»)                                  | F    |
| Recuperabilidad del IVA soportado                                                   | **No existe**: todo IVA se trata como coste; no hay deducibilidad ni prorrata                      | G    |
| Base imponible ≠ precio                                                             | **No existe**: ITP/IVA/AJD siempre sobre `purchasePrice`                                           | H    |
| Liquidación fiscal manual (asesor) conservando la estimación                        | No existe                                                                                          | H    |
| Coste económico efectivo ≠ necesidad de caja                                        | **No existe**: `totalProjectCost` es bruto y es también el coste económico                         | H    |
| Beneficio del proyecto separado de IRPF/IS del inversor                             | Existe (`netProfit` antes de impuestos de salida, `netProfitAfterTax`, línea `exit_income_tax`)    | A    |
| Nivel de cada métrica indicado (antes/después de impuestos)                         | Parcial: la explicación de `netProfit` dice «antes de impuestos de salida»; ROE/ROI no lo dicen    | B    |
| Comisión con base e impuestos                                                       | Parcial: `agencyRate` sobre precio de venta (base conocida); sin componente fiscal                 | F    |
| Honorarios técnicos con impuestos                                                   | Parcial: importe de entrada sin componente fiscal ni aviso                                         | F    |
| IVA repercutido en la venta                                                         | No modelado (venta de segunda mano: sujeta a ITP del comprador); sin aviso para locales/obra nueva | B    |

## Modelo monetario actual

- `FinancialInputs` (`src/modules/engines/financial/types.ts`): `acquisition { purchasePrice, transferTaxMode, assetUse, agencyFee, dueDiligence }`, `transformation { renovationBudget (PEM sin IVA), contingencyRate, professionalFees, otherLicenceCosts, worksMonths, worksVatReduced }`, `holding`, `financing[]`, `exit`, `analysisDate`, `jurisdiction`.
- `FinancialResult`: `costLines[] { key, category, label, amount, origin: input | rule | computed, ruleRef }`, `totals { purchase, acquisitionCosts, transformation, holding, financing, saleCosts, exitTaxes, totalProjectCost, totalCashOut }`, `cashflows[]`, `metrics` (fórmula + explicación + inputs), `warnings`, `reviewItems`.
- Dinero: números EUR, `round2` en `src/modules/core/math.ts`; formateo solo en UI.

## Modelo fiscal actual

- `TaxRuleSet { id, jurisdiction, effectiveFrom, effectiveUntil?, regulationRefs[], status, acquisition { itpRate, ajdRate, ivaResidentialNew, ivaCommercial, notaryScale, registryScale }, works { icioRate, licenceFeeRate, ivaWorksRate, ivaWorksReducedRate }, holding { ibi… }, exit { capitalGainsIndividual[], corporateTaxRate, plusvaliaMunicipal } }`. Una regla vigente: `tax.es.and.sevilla.2025` (Ley 5/2021 Andalucía, Ley 37/1992 IVA, ordenanza ICIO Sevilla…), `status: INFERRED`.
- `computeAcquisitionTaxes(price, mode, rules, { assetUse })`: ITP = precio × tipo, o IVA (10 % / 21 %) + AJD; notaría y registro por escala.
- `computeWorksTaxes(pem, rules)`: ICIO + tasa.
- `computeExitTaxes(gain, sellerProfile, rules, plusvalía)`: IRPF por tramos o IS.
- Motor: `construction = PEM × (1 + IVA)` en una sola línea; ICIO y tasa en líneas propias; honorarios, agencia y otros sin componente fiscal; IBI como coste de tenencia (categoría `taxes`); IRPF/IS como `exit_taxes`, fuera de `netProfit` y dentro de `netProfitAfterTax` y `totalCashOut`.

## Precedencia actual

- Precio e inputs: `resolveEffectiveValue` (`src/modules/inputs/resolve.ts`): dato profesional por rango › hipótesis del twin › estimación › UNKNOWN.
- Impuestos: no hay precedencia; solo la regla automática. No existe dato fiscal profesional.

## Inputs y recálculo actuales

- `purchasePrice` → línea `purchase`, ITP/IVA/AJD, notaría, registro → `acquisitionCosts` → `costBeforeFinancing` → dimensionado LTV/LTC → intereses → `totalProjectCost` → `netProfit`, `roi`, `roe`, `irr`, `margin`, `breakEvenPrice`, estrés, precio máximo.
- `renovationBudget` → `construction` (PEM + IVA), `contingency`, `icio`, `licence_fee` → `transformationTotal` → misma cadena.
- Caja: compra, gastos, honorarios, ICIO/tasa en el mes 0; obra + contingencia (brutas, con IVA) repartidas en los meses de obra; `equityRequired` = déficit máximo. No hay devolución de IVA.
- `roi = netProfitOwner / totalProjectCost` (bruto); `roe = netProfitOwner / ownEquity`.

## UI, procedencia y auditoría actuales

- Finanzas: tabla de líneas de coste con «Origen» (dato / regla / cálculo) y todas las métricas con fórmula. Panel «Datos profesionales» con estimación · profesional · en uso, impuesto aplicable y total con impuestos (leídos de las líneas).
- Procedencia: `Assumption.source`, `costLine.origin` + `ruleRef`, `taxRuleSetId` en el resultado; snapshot normativo del análisis referencia las normas.
- Auditoría: `activities` (`input.professional_set` / `_reverted`); eventos `DealInputUpdated`.

## Carencias (lo que esta intervención debe cubrir)

1. Separar visiblemente base e impuestos en cada concepto con impuesto (adquisición, obra) sin cambiar los totales de los deals existentes.
2. Recuperabilidad del IVA soportado: `FULL | PARTIAL | NONE | UNKNOWN` con porcentaje; por defecto desconocida (se trata como no recuperable, `REVIEW_REQUIRED`), nunca asumida.
3. Coste económico efectivo (= bruto − impuestos recuperables) distinto de necesidad de caja (= bruto). Beneficio, ROI y precio de equilibrio sobre el coste efectivo; capital necesario sobre caja.
4. Base imponible de adquisición independiente del precio; liquidación fiscal manual con procedencia conservando la estimada.
5. Dato profesional con modo «impuestos incluidos / excluidos»; normalización a base cuando el tratamiento es resoluble, «desglose pendiente» cuando no.
6. Honorarios técnicos como dato profesional.
7. Nivel de cada métrica explícito (antes de IRPF/IS del inversor).
8. Componentes fiscales con procedencia (tipo, base, tipo impositivo, importe, regla, estado, recuperabilidad, mecanismo de liquidación).

## Implementación mínima

- **Motor financiero** (aditivo): entradas opcionales `acquisition.taxableBase`, `acquisition.transferTaxManual`, `tax.vatRecoverabilityRatio`; salida nueva `tax { components[], concepts[], recoverableTotal, nonRecoverableTotal, effectiveProjectCost, cashRequirement, vatRecoverability }` y métricas `effectiveProjectCost`, `recoverableTax`. Beneficio neto, ROI y precio de equilibrio pasan a usar el coste efectivo; con recuperabilidad desconocida (todos los deals existentes) el coste efectivo es igual al bruto y **ningún número cambia**. Devolución del IVA recuperable como entrada de caja en el mes de salida (hipótesis prudente, documentada): el capital necesario no baja.
- **Datos profesionales**: `taxMode` en el dato; claves nuevas en el registro: `acquisition.taxableBase`, `acquisition.transferTaxManual`, `transformation.professionalFees`, `tax.vatRecoverabilityRatio`; claves opcionales con estimación derivada del resultado base.
- **UI**: desglose por concepto (Base · Impuestos · Total · Recuperable · Coste efectivo) en Finanzas; sección «Fiscalidad» en el panel; métricas con su nivel; Passport con coste efectivo y necesidad de caja.
- **Sin migración**: todo cabe en los JSONB existentes (`professional_inputs`, `scenario_sets.set`, `analyses.result`).

## Archivos previstos

Modificar: `src/modules/engines/financial/{types,engine}.ts`, `src/modules/inputs/{types,registry,resolve,apply,schema}.ts`, `src/server/services/inputs.ts`, `src/components/flippia/professional-inputs-panel.tsx`, `src/app/(app)/app/deals/[id]/finance/page.tsx`, `src/modules/passport/build.ts`, `src/modules/lia/ask.ts`, tests de inputs e integración, `docs/FINANCIAL_ENGINE.md`, `docs/DECISIONS.md`, `docs/API.md`, `docs/MANUAL_INPUT_IMPLEMENTATION.md`.
Nuevos: `src/modules/engines/financial/tax-layer.test.ts`, `docs/PROFESSIONAL_INPUTS_TAX_IMPLEMENTATION.md`.

## Archivos protegidos

`src/modules/tax/*` (reglas y cálculo: se consumen, no se reescriben), `engines/scenario`, `engines/construction`, `engines/valuation`, `strategies`, `agents`, `analysis`, `adapters`, `regulatory`, `city`, `radar`, `watch`, `investor`, `auth`, `components/ds`, navegación, `analyze`, `engine.test.ts` existente (no se modifica: los tests nuevos van en archivo propio), esquema de base de datos.

## Cambios matemáticos identificados y decisión

- `netProfit`, `roi`, `breakEvenPrice`: pasan de coste bruto a coste efectivo. Con recuperabilidad desconocida o nula coinciden: sin impacto en deals existentes. Documentado en `docs/PROFESSIONAL_INPUTS_TAX_IMPLEMENTATION.md`.
- Honorarios técnicos y comisiones sin IVA: se identifica como componente fiscal **no determinado** (`REVIEW_REQUIRED`) y se avisa; no se añade un IVA inventado, de modo que los números no cambian. Resolverlo requiere un tipo de IVA de servicios en el `TaxRuleSet` (fuera de alcance: no se tocan las reglas).
