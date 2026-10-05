# Datos profesionales y capa económica con impuestos separados — implementación

Fecha: 2026-10-05. Auditoría previa: `docs/PROFESSIONAL_INPUTS_TAX_AUDIT.md`. Capacidad A (datos profesionales) descrita en `docs/MANUAL_INPUT_IMPLEMENTATION.md`; este documento cubre la capacidad B y su integración con A. Decisión: ADR-022.

Mantra: _estimar cuando no sabemos; usar el dato profesional cuando existe; conservar el original; separar los impuestos; calcular el coste efectivo; seguir la caja; trazarlo todo._

## Qué existía

Datos profesionales con precedencia central, procedencia, reversión y recálculo (ADR-021). Reglas fiscales versionadas (`TaxRuleSet`, `resolveTaxRules`), ITP / IVA + AJD según operación, ICIO y tasa como tributos propios, notaría y registro como gastos, IRPF/IS del inversor separado del beneficio del proyecto.

## Qué faltaba

IVA de obra embebido en la línea de obra; todo IVA tratado como coste sin recuperabilidad; base imponible siempre igual al precio; sin liquidación fiscal profesional; sin coste efectivo frente a necesidad de caja; sin modo «impuestos incluidos» en los datos; honorarios y datos fiscales no editables; nivel de las métricas (antes/después de IRPF/IS) no explícito.

## Qué se ha implementado

### Motor financiero (`src/modules/engines/financial`)

- Entradas opcionales, todas ausentes en los deals existentes: `acquisition.taxableBase`, `acquisition.transferTaxManual`, `tax.vatRecoverabilityRatio` (0..1, validado).
- Salida nueva `result.tax` (`TaxSummary`):
  - `components[]` (`TaxComponent`): ITP o IVA de adquisición, AJD, IVA de obra, ICIO, tasa, IBI, IRPF/IS, plusvalía; cada uno con `taxableBase`, `rate`, `amount`, `recoverableAmount`, `nonRecoverableAmount`, `recoverability`, `settlement`, `source` (`rule | professional | input`), `ruleRef`, `status` y `estimatedAmount` cuando un profesional sustituyó la regla.
  - `concepts[]` (`ConceptBreakdown`): adquisición, obra, honorarios, costes de venta, con `base`, `taxAmount`, `gross`, `recoverableTax`, `effectiveCost`, `cashRequirement` y `taxStatus` (`UNKNOWN` cuando el motor no determina el tratamiento: honorarios y comisiones).
  - `recoverableTotal`, `nonRecoverableTotal`, `effectiveProjectCost`, `cashRequirement`, `vatRecoverability { ratio, recoverability: full | partial | none | unknown, status, note }`.
- Métricas nuevas: `effectiveProjectCost`, `recoverableTax`. Explicaciones de `netProfit`, `grossProfit`, `roi`, `roe` indican el nivel: **antes de IRPF/IS del inversor**.
- Las líneas de coste no cambian: siguen siendo lo que se paga (la obra, bruta con IVA; el ITP, su importe). La separación base/impuesto vive en `tax`.

### Recuperabilidad del IVA

Nunca se asume. Sin dato: `unknown`, el IVA soportado se trata como coste, `REVIEW_REQUIRED` y un aviso en `reviewItems`. Un profesional indica la deducibilidad (0..100 %) como dato con procedencia; se aplica solo a componentes IVA (obra, compra de obra nueva); ITP, AJD, ICIO y tasa nunca se recuperan. Prorrata: cualquier porcentaje entre 0 y 1.

### Coste efectivo y necesidad de caja

- `cashRequirement` = `totalProjectCost` (bruto, con todo el IVA soportado).
- `effectiveProjectCost` = `totalProjectCost − recoverableTotal`.
- Beneficio operativo, ROI y precio de equilibrio se calculan sobre el coste efectivo; el capital necesario (`equityRequired`) sobre la caja. La devolución del IVA recuperable entra en caja en el mes de salida (hipótesis prudente: no se modela calendario de devoluciones), de modo que el capital necesario no baja.
- Con recuperabilidad desconocida o 0, coste efectivo = caja y **ningún número de un deal existente cambia** (test `tax-layer.test.ts` y suite previa intacta).

### Base imponible y liquidación profesional

`taxableBase` separa precio y base imponible: notaría y registro siguen sobre el precio; ITP/IVA/AJD sobre la base. `transferTaxManual` sustituye el importe de la regla conservando la estimación en `estimatedAmount`.

### Datos profesionales (`src/modules/inputs`)

- Claves nuevas en el registro tipado: `transformation.professionalFees` (por estrategia), `acquisition.taxableBase`, `acquisition.transferTaxManual`, `tax.vatRecoverabilityRatio` (deal, opcionales: la estimación se lee del resultado base con `estimateForOptionalKey`).
- `taxMode` por dato: `excluded` (por defecto) | `included` | `not_applicable`. Un presupuesto de obra con IVA incluido se normaliza a su base con el tipo vigente de la estrategia (`resolveTaxRules`, general o reducido) y guarda `enteredAmount` y `taxRateApplied`; el margen se lee dentro de la base. Si el tipo no es resoluble, el dato queda `taxBreakdownPending`: se muestra («impuestos incluidos, desglose pendiente») y **no se aplica**, nunca se grava dos veces ni se inventa el desglose.
- Precedencia, auditoría (`before`/`after` con modo fiscal), eventos y reversión: los existentes.

### UI

- Finanzas: tabla «Base, impuestos y coste efectivo» por concepto (Base · Impuestos · Total · Recuperable · Coste efectivo · Tratamiento), con «+ impuestos (sin determinar)» cuando el motor no decide; métricas «Coste total (caja)», «Coste efectivo», «Beneficio operativo (antes de IRPF/IS)», «Tras IRPF/IS estimado», «IVA recuperable».
- Panel de datos profesionales: grupo «Fiscalidad» plegable (base imponible, impuesto liquidado, deducibilidad) con resumen de coste efectivo y caja; honorarios técnicos por estrategia; selector «No incluye impuestos / Incluye el IVA» en obra; cada importe en uso se despliega en Base · Impuestos · Total · Recuperable · Coste efectivo · Caja.
- Passport: coste total (caja), coste efectivo con la nota de deducibilidad, beneficio operativo y tras IRPF/IS con su nivel.
- LIA: «Los impuestos aplicables se muestran por separado, sin mezclarlos con esos importes».

## Comportamiento con escenarios y estrés

Las hipótesis de escenario siguen siendo overrides sobre la base efectiva (aislamiento intacto). El estrés escala el PEM base; el IVA sigue al PEM y la recuperabilidad se aplica después (`scaleReno` no toca impuestos). Precio máximo: bisección sobre el precio con los impuestos de adquisición incluidos; una base imponible fijada por un profesional permanece fija durante la búsqueda (limitación documentada).

## Dependencias aguas abajo

`purchasePrice` → ITP/IVA/AJD (sobre `taxableBase`), notaría, registro → coste → deuda (LTV/LTC) → caja, capital → coste efectivo → beneficio, ROI, ROE, TIR, margen, equilibrio, estrés, precio máximo. `renovationBudget` → obra + IVA, ICIO, tasa, contingencia → igual. `vatRecoverabilityRatio` → `recoverableTotal` → coste efectivo, beneficio, ROI, equilibrio, caja del mes de salida; no toca capital necesario ni mercado, urbanismo, arquitectura, normativa o propiedad.

## Cambios matemáticos (OLD → NEW)

| Métrica          | Antes                           | Ahora                                     | Motivo                                   | Impacto                                              |
| ---------------- | ------------------------------- | ----------------------------------------- | ---------------------------------------- | ---------------------------------------------------- |
| `netProfit`      | ingresos − venta − coste bruto  | ingresos − venta − coste efectivo         | el IVA recuperable no es coste económico | solo con deducibilidad > 0 indicada; si no, idéntico |
| `grossProfit`    | … − coste antes de financiación | … − coste efectivo antes de financiación  | ídem                                     | ídem                                                 |
| `roi`            | neto / coste bruto              | neto / coste efectivo                     | ídem                                     | ídem                                                 |
| `breakEvenPrice` | coste bruto / (1 − comisión)    | coste efectivo / (1 − comisión)           | ídem                                     | ídem                                                 |
| `equityRequired` | déficit máximo de caja          | sin cambio (la devolución llega al salir) | caja ≠ coste                             | ninguno                                              |

Honorarios y comisiones: sin IVA añadido (sería un tipo de servicios inexistente en el `TaxRuleSet`); se marcan `UNKNOWN` con aviso. Resolverlo es una regla fiscal nueva, no un cambio de motor.

## Base de datos

Sin migración: los campos nuevos viajan en los JSONB existentes (`deals.professional_inputs`, `scenario_sets.set`, `analyses.result`).

## Tests

- `src/modules/engines/financial/tax-layer.test.ts` (11): sin tratamiento → cifras idénticas y aviso; ITP nunca recuperable; ICIO/tasa no son IVA; recuperabilidad total (caja > coste efectivo, beneficio +IVA, capital igual, devolución en el mes de salida, línea de obra bruta, concepto obra); parcial; 0 % indicado; base imponible ≠ precio; liquidación profesional conserva la estimación; obra nueva (IVA recuperable, AJD no); IRPF/IS fuera del beneficio y etiquetado; sin doble cómputo y honorarios/comisiones `UNKNOWN`; validación de rango.
- `src/modules/inputs/inputs.test.ts` (+2): normalización con IVA incluido (con y sin margen), pendiente sin tipo, esquema; deducibilidad, base imponible, liquidación y honorarios aplicados al análisis; presupuesto pendiente rechazado, no adivinado; LIA menciona impuestos aparte.
- `src/server/inputs.integration.test.ts` (ampliado): vista con conceptos y resumen fiscal; estimaciones de las claves fiscales; obra con IVA incluido normalizada y mostrada bruta; deducibilidad → coste efectivo < caja; liquidación profesional en el análisis efectivo con estimación conservada.
- Suite completa: 29 archivos, 291 tests en verde; `engine.test.ts` previo sin modificar. Fallos preexistentes: ninguno.

## Archivos

Modificados: `src/modules/engines/financial/{types,engine}.ts`, `src/modules/inputs/{types,registry,resolve,apply,schema,inputs.test}.ts`, `src/server/services/inputs.ts`, `src/server/inputs.integration.test.ts`, `src/components/flippia/professional-inputs-panel.tsx`, `src/app/(app)/app/deals/[id]/finance/page.tsx`, `src/modules/passport/build.ts`, `src/modules/lia/ask.ts`, `docs/FINANCIAL_ENGINE.md`, `docs/DECISIONS.md`, `docs/API.md`, `docs/MANUAL_INPUT_IMPLEMENTATION.md`.
Nuevos: `src/modules/engines/financial/tax-layer.test.ts`, `docs/PROFESSIONAL_INPUTS_TAX_AUDIT.md`, este documento.
No tocados: `src/modules/tax` (reglas y cálculo), escenarios, construcción, valoración, estrategias, agentes, análisis, adaptadores, normativa, ciudades, Radar, Watch, Investor DNA, auth, design system, navegación, esquema de base de datos.

## Limitaciones conocidas

- Calendario fiscal: la devolución del IVA se asume en el mes de salida; no hay fechas de pago/devolución por impuesto (el modelo las admite en el futuro sin romper nada).
- Honorarios y comisiones: tratamiento fiscal `UNKNOWN` hasta que exista un tipo de IVA de servicios en el `TaxRuleSet`; mientras, el importe es base «+ impuestos».
- Inversión del sujeto pasivo, exención y no sujeción están representadas en `settlement` pero el motor solo emite `normal`; un profesional puede fijar el importe liquidado.
- IVA repercutido en la venta no modelado (venta de segunda mano, sujeta a ITP del comprador); para locales u obra nueva vendidos con IVA, el concepto de venta queda `UNKNOWN`.
- Fiscalidad directa: IRPF/IS estimados con el perfil del inversor y tramos del ahorro; no es asesoramiento ni liquidación.
