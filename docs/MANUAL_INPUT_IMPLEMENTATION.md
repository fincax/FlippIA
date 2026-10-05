# Datos profesionales manuales — implementación

Fecha: 2026-10-05. Auditoría previa: `docs/MANUAL_INPUT_AUDIT.md`. Decisión: ADR-021 en `docs/DECISIONS.md`.

Mantra: _estimar cuando no sabemos; usar el dato profesional cuando existe; conservar ambos; trazarlo todo._

## Qué existía

- Precio declarado en el intake (`askingPrice` + `askingPriceSource`), fijado una sola vez al analizar.
- Digital Investment Twin por estrategia (`update_base`): cambia la base de un `scenario_set`, sin procedencia, sin reversión, visible solo en Escenarios y Precio máximo, borrado al reanalizar.
- `AssumptionSource` ya admitía `"professional"` (sin uso). Construcción tenía `CostStage` y `replaceWithProfessionalBudget` sin llamadores.
- Auditoría (`activities`, `logActivity`), bus de eventos, RBAC por rol, zod en rutas.

## Qué faltaba

Almacén a nivel de deal que sobreviva al reanálisis; procedencia y tipos de dato; precedencia centralizada; capa de resolución que alimente todos los lectores; reversión; UI; atribución en LIA y Passport; tests.

## Qué se ha implementado

### Modelo (`src/modules/inputs`)

- `ProfessionalInput { id, key, strategyId?, value, unit, sourceType, status, enteredBy, enteredByName?, enteredAt, reason?, note?, breakdown?, estimateAtEntry?, state, endedAt?, endedBy?, endedReason? }`.
- Registro tipado `PROFESSIONAL_INPUT_REGISTRY` (sin magic strings): `acquisition.purchasePrice` (ámbito **deal**) y `transformation.renovationBudget` (ámbito **estrategia**: cada estrategia tiene su propia obra). Las claves son dot-paths de `FinancialInputs`, el mismo contrato del twin.
- Tipos de fuente (`SOURCE_TYPE_META`, con rango y estado de evidencia): `professional_confirmed` (INFERRED), `contractor_quote` (INFERRED), `accepted_quote` (VERIFIED), `document_verified` (VERIFIED), `actual` (VERIFIED). Una hipótesis "¿y si compro por 205.000?" **no** es un dato profesional: sigue siendo un escenario (what-if / custom).
- Ciclo de vida sin borrado: `setProfessionalInput` supersede la entrada activa anterior; `revertProfessionalInput` la marca `reverted`. El historial completo vive en el deal (`asking → negociado → firmado`).

### Responsabilidad y margen comercial

- Cada dato lleva `issuer` (quién lo emite: el propio profesional o usuario, o un técnico o empresa con su nombre) y `responsibilityAcknowledgedAt`: la API solo acepta el dato con `acknowledged: true`, y el formulario exige marcar la confirmación. El texto es único (`PROFESSIONAL_INPUT_DISCLAIMER`) y aparece en el panel, en el formulario, en el Passport cuando hay datos profesionales en uso y en la nota de procedencia de cada hipótesis; LIA dice «bajo tu responsabilidad» cuando usa el dato. FlippIA estima el mercado; el presupuesto final es del técnico que lo emite.
- Margen comercial por partida: el dato se introduce **neto y sin impuestos** (`value`) con un `marginRate` opcional (0..1) a nivel de dato y, en el desglose de obra, por línea (`breakdown[].marginRate`, que prevalece sobre el del dato). El servidor calcula el bruto (`withMargin`): el análisis usa `value` (neto + margen, sin impuestos), y `netValue`, `marginRate` y `marginAmount` quedan registrados. Sin margen, bruto = neto (sin cambios).
- **Impuestos aparte**: el margen nunca incluye impuestos. El motor financiero aplica sobre el importe en uso los que correspondan según las reglas fiscales vigentes (IVA de obra general o reducido, ITP o IVA + AJD en la compra), como hace con cualquier estimación. El panel muestra ese impuesto y el total con impuestos leyéndolos de las líneas de coste del escenario base (`tax` en la vista); no hay lógica fiscal nueva.

### Precedencia (una sola vez: `resolveEffectiveValue`)

```
dato profesional activo (actual › document_verified › accepted_quote › contractor_quote › professional_confirmed; a igual rango, el más reciente)
  › hipótesis manual del twin (`update_base`, Assumption.source = "user")
  › estimación del análisis (engine | market | adapter | precio declarado)
  › UNKNOWN
```

`update_base` sobre una ruta con dato profesional activo se rechaza con un mensaje explícito (nunca enmascarado).

### Procedencia

Cada valor conserva `sourceType`, `status`, `enteredBy(+Name)`, `enteredAt`, `reason`, `note`, `breakdown` y `estimateAtEntry` (la estimación vigente al introducirlo, con `analysisId`). En el análisis efectivo la `Assumption` pasa a `source: "professional"` con una nota que mantiene visible la estimación: «Estimación FlippIA: 245.000 €. Dato profesional confirmado introducido por Manuel el 5 oct 2026. Precio negociado directamente con el vendedor.».

### Resolución en lectura, recálculo dependiente

- `analyses.result` y `scenario_sets` **no se modifican nunca** por un dato profesional. El análisis almacenado es la estimación íntegra.
- `getLatestAnalysis` devuelve `applyToAnalysis(stored, deal.professionalInputs)`; `getStoredAnalysis` devuelve el original. Sin inputs activos se devuelve **el mismo objeto** (cero cambios para deals existentes).
- `applyToScenarioSet` reutiliza `updateBase` (recalcula solo escenarios afectados; un escenario custom que sobrescribe la ruta conserva su hipótesis) y reetiqueta la hipótesis como profesional.
- `applyToAnalysis` recalcula, con las mismas funciones del agente de inversión, la cadena determinista que depende de esos inputs: escenarios → `headline`, `stress`, `maxPrice` → `risk.stressByStrategy` → `rankStrategies` → `computeOpportunityGap` (con el precio efectivo) → `computeOpportunityDNA` → `templateSynthesis`. No reejecuta agentes ni fuentes.
- Dependencias reales en el motor: `purchasePrice` → línea de compra, ITP/IVA/AJD, notaría, registro, dimensionado LTV/LTC de la deuda, intereses, coste total, capital, beneficio, margen, ROI/ROE, TIR, precio de equilibrio, estrés y precio máximo. `renovationBudget` → obra + IVA, contingencia, ICIO/tasa, dimensionado LTC, y la misma cadena hacia abajo. `professionalFees` se mantiene como la estimó la estrategia (input independiente; clave futura del registro).
- Lectores que consumen el valor efectivo sin cambios propios: Overview, Estrategias, Finanzas, Riesgo, Passport, LIA (`/ask`), Haz magia. Escenarios y Precio máximo usan `listEffectiveScenarioSets` / `getEffectiveScenarioSet`; el what-if parte del twin efectivo.
- `deals.summary` (tarjeta de la lista) se recalcula con el análisis efectivo al guardar/revertir y en `persistAnalysis`.

### API

`POST /api/deals/:id/inputs` — `requireMutation` (sesión + CSRF), `requireRole("analyst")`, zod (`professionalInputSetSchema` / `professionalInputRevertSchema`: número finito, no negativo, dos decimales, rango por unidad, ámbito según registro, desglose que suma el total). Respuesta: entrada creada, anterior, estimación, estrategias recalculadas y rechazos.

### Auditoría y eventos

`activities`: `input.professional_set` / `input.professional_reverted` con `before` (valor y fuente o entrada anterior), `after` (bruto, neto, margen, tipo, emisor, fecha de aceptación de responsabilidad), `reason`, `inputId`, `applied`, `rejected`. Evento `DealInputUpdated` en el bus existente. Un dato que no puede aplicarse (p. ej. estrategia ausente) se devuelve como `rejected`, se muestra en la UI («No se ha podido aplicar este dato al análisis») y se registra con `logger.warn`.

### UI

- Finanzas: panel **Datos profesionales** (`ProfessionalInputsPanel`) con el aviso de responsabilidad: por concepto, _Estimación_ (con semáforo y origen) · _Profesional_ (badge por tipo, quién, cuándo, emisor, neto + margen, motivo, desglose) · _Usando en el análisis_. Acciones: Introducir / Editar, Volver a estimación; formulario con importe neto, margen comercial, tipo de dato, quién emite el dato (yo mismo / técnico o empresa), motivo, nota y confirmación obligatoria de responsabilidad; para obra, Materiales / Mano de obra / Otros con margen por partida (el total es la suma). Comparación con el precio máximo FlippIA (resultado independiente). Historial plegable. Solo lectura para `viewer`.
- Estrategias: badge «Profesional» en la hipótesis (con la nota de procedencia).
- Passport: filas «Precio de compra en uso» y «Presupuesto de obra en uso» con procedencia; «Precio solicitado» sigue mostrando el precio de partida.
- LIA: cuando un dato profesional dirige la respuesta (precio máximo, what-if, resumen) lo atribuye al usuario: «Utilizo 218.000 € como precio de compra: es un dato que has introducido, no una estimación mía.» Sin cambios en el prompt del modelo.

## Tests

Unit (`src/modules/inputs/inputs.test.ts`, 13 tests; incluye margen por dato y por partida, emisor, confirmación de responsabilidad obligatoria): precedencia y rango de fuentes; ciclo de vida sin pérdida; validación; TEST 1 (218.000 € en todas las estrategias, 285.000 € intacto); TEST 2 (sin inputs, mismo objeto); TEST 3 (líneas de coste, totales, capital, beneficio, ROE, headline, estrés, precio máximo con `askingPrice` = precio en uso, diferencial, ranking); TEST 4 (propiedad, mercado, urbanismo, arquitectura, normativa, financiación, evidencia y hallazgos: mismas referencias); TEST 5 (obra 65.000 € solo en su estrategia, estrés +20 % sobre 65.000 €); TEST 6 (escenario custom a 205.000 € conserva su valor con base a 218.000 €; dato profesional gana a hipótesis del twin); TEST 7/8 (procedencia y conservación); rechazo explícito; idempotencia; TEST 11 (LIA atribuye).

Integration (`src/server/inputs.integration.test.ts`, contra `DATABASE_URL_TEST`): TEST 9 (recarga: efectivo 218.000 €, almacenado 245.000 €, `asking_price` intacto, `summary` efectivo); TEST 10 (viewer → `ForbiddenError` al introducir y al revertir); twin efectivo vs almacenado; `update_base` rechazado en ruta gobernada y permitido en otras; vista para la UI; obra por estrategia con desglose y estrategia inexistente → `NotFoundError`; reanálisis conserva y reaplica los inputs; supersede con historial; revertir devuelve 245.000 € y deja la obra; rastro de auditoría (antes/después/quién/motivo); aislamiento entre tenants.

Resultado: `pnpm typecheck` ✓ · `pnpm lint` ✓ · `pnpm test` ✓ (28 archivos, 277 tests: 252 previos + 25 nuevos) · `pnpm build` ✓. Suite previa al cambio: 25 archivos, 252 tests, todos en verde. **Fallos preexistentes: ninguno.**

## Archivos

Nuevos: `src/modules/inputs/{types,registry,resolve,apply,schema,index,inputs.test}.ts`, `src/server/services/inputs.ts`, `src/app/api/deals/[id]/inputs/route.ts`, `src/components/flippia/professional-inputs-panel.tsx`, `src/server/inputs.integration.test.ts`, `drizzle/0004_professional_inputs.sql` + `drizzle/meta/0004_snapshot.json`, `docs/MANUAL_INPUT_AUDIT.md`, este documento.

Modificados: `src/db/schema/deals.ts` (columna), `drizzle/meta/_journal.json` (generado), `src/server/services/deals.ts` (`getLatestAnalysis` efectivo, `getStoredAnalysis`, `summaryOf`, resumen efectivo en `persistAnalysis`), `src/server/services/scenarios.ts` (lecturas efectivas, guarda en `update_base`, what-if efectivo), `src/app/api/deals/[id]/max-price/route.ts`, `src/app/(app)/app/deals/[id]/scenarios/page.tsx`, `src/app/(app)/app/deals/[id]/finance/page.tsx` (panel), `src/app/(app)/app/deals/[id]/strategies/page.tsx` (badge), `src/modules/passport/build.ts` (filas), `src/modules/lia/ask.ts` (atribución), `src/modules/core/events.ts` (`DealInputUpdated`), `docs/DATABASE.md`, `docs/DECISIONS.md`, `docs/API.md`, `CLAUDE.md`.

No tocados: motores (financiero, escenarios, construcción, valoración), fiscalidad, estrategias, agentes, `run-analysis`, `synthesis`, `magic`, adaptadores, normativa, ciudades, Radar, Watch, Investor DNA, auth, design system, navegación, `analyze`, flags, dependencias.

## Migración

`0004_professional_inputs.sql`: `ALTER TABLE "deals" ADD COLUMN "professional_inputs" jsonb DEFAULT '[]'::jsonb NOT NULL;`. Necesaria porque ninguna estructura a nivel de deal sobrevive a `persistAnalysis` (`scenario_sets` se recrean; `summary` es caché derivada). Aditiva, con valor por defecto: los deals existentes se comportan exactamente igual (`[]` → el análisis almacenado se devuelve sin tocar).

## Limitaciones conocidas

- Los hallazgos narrativos de los agentes adversariales (`risk.findings`, p. ej. «precio por encima de valor») y la narrativa escrita por el modelo se generan al analizar; con datos profesionales activos la síntesis se regenera por plantilla determinista (`narrativeSource: "template"`) y los hallazgos se mantienen tal cual hasta reanalizar. Un reanálisis vuelve a aplicar los inputs sobre el nuevo resultado.
- `market.askingVsValue` y la dimensión «Adquisición» del ADN comparan el **precio de partida** con el valor as-is (son del dominio mercado; principio 44: un precio negociado no altera la valoración).
- `professionalFees` y la contingencia siguen derivados de la estimación de obra de la estrategia; si el profesional los conoce, son claves futuras del registro.
- No hay enlace a `documents` (oferta, presupuesto) ni flujo de presupuestos por partidas: el modelo lo admite (`breakdown`, `sourceType`), el flujo no se ha construido.
- Concurrencia: lectura-modificación-escritura sobre la columna JSONB sin bloqueo explícito; dos ediciones simultáneas del mismo concepto quedan ambas en el historial y gana la última escrita.
- Moneda: EUR, como el resto del sistema (`formatMoney`); el registro declara `unit: "currency"` sin fijar divisa.
