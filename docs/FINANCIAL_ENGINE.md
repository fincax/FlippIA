# Motor financiero

`src/modules/engines/financial`. Determinista, testado, sin LLM.

## Entradas (`FinancialInputs`)

`acquisition` (precio, ITP vs IVA+AJD, uso, agencia, due diligence) · `transformation` (PEM, contingencia, honorarios, licencias, meses de obra, IVA reducido) · `holding` (meses, comunidad, seguro, suministros, IBI, otros) · `financing[]` (hipoteca, puente, préstamo de adquisición, línea de reforma, deuda privada, socio, co-inversión; sizing por importe/LTV/LTC; tipo, plazo, solo intereses, comisión, mes de disposición, participación en beneficio) · `exit` (venta: precio, comisión, otros, perfil fiscal, plusvalía; alquiler: renta, vacancia, opex, valor terminal) · `analysisDate` + `jurisdiction` (resuelve el `TaxRuleSet`).

## Salidas (`FinancialResult`)

- `costLines` con origen (`input | rule | computed`) y referencia a la regla fiscal.
- `totals`, `financing` (por instrumento), `cashflows` mensuales (inflow, outflow, funding, net, cumulative).
- `metrics` con **fórmula, explicación e inputs**: coste total, salida de caja, capital necesario (déficit máximo de caja, financiación primero, cierre en el mes de salida), deuda, LTV, LTC, beneficio bruto/neto/neto tras impuestos, margen, ROI, ROE, ROE anualizado, TIR (mensual → anual), cash-on-cash, cap rate, yield bruto/neto, DSCR, precio y renta de equilibrio, duración.
- `warnings`, `reviewItems` (p. ej. plusvalía municipal no calculable sin valor catastral).

## Reglas fiscales (`src/modules/tax`)

`TaxRuleSet` versionado por jurisdicción y `effectiveFrom`: ITP 7 % / AJD 1,2 % Andalucía (Ley 5/2021), IVA 10/21 %, aranceles notario/registro (escala), ICIO/tasa Sevilla (estimados), IRPF ahorro por tramos 2025, IS 25 %. `resolveTaxRules(jurisdiction, date)` elige la más específica vigente. Ningún tipo está hardcodeado en el motor.

## Solvers

- `computeMaximumAcquisitionPrice(inputs, { minimumRoe, minimumProfit, minimumMargin, maximumCapital, maximumLtc, maximumDuration })`: bisección sobre el precio (todas las restricciones son monótonas); devuelve precio máximo, restricción vinculante, checks y headroom.
- `runStressTest(inputs)`: venta −5/−10 %, reforma +10/+20 %, deuda +150 pb, retraso +90/+180 días, alquiler −10 %, combinados; break-even, margen de seguridad, reforma máxima, precio mínimo de salida, compra máxima, capital en riesgo, supervivencia.

## Escenarios (`engines/scenario`)

`buildScenarioSet` (base + optimista + conservador + estrés), `addCustomScenario`, `updateBase` (recalcula solo lo afectado), `evaluateWhatIf`, `compareScenarios`.

## Construcción (`engines/construction`)

Biblioteca de costes DEMO Sevilla (partida, unidad, coste unitario, fuente, confianza, fecha), mediciones paramétricas por nivel (cosmetic/medium/integral/change_of_use), GG+BI, €/m². Etapas: estimate → professional_budget → accepted_budget → committed → invoiced → paid. Nunca se mezclan estimaciones con precios contratados.

## Valoración (`engines/valuation`)

ARV por comparables: ajuste por tipo de precio (oferta −5 %), estado (±35 %), antigüedad; peso por fiabilidad de fuente, distancia, recencia y tamaño; mediana ponderada y cuartiles 25–75; confianza con factores explicados; comparables rechazados con motivo.
