# Auditoría — Datos profesionales manuales (manual overrides)

Fecha: 2026-10-05. Alcance: comprobar si FlippIA permite que un profesional introduzca un dato real o más fiable que el estimado (precio de compra negociado, presupuesto de obra) y que ese dato se conserve, tenga procedencia, prevalezca, alimente los cálculos dependientes, no destruya la estimación, sea auditable y reversible. Esta auditoría precede a cualquier cambio de código.

## Veredicto

**Caso B/D: existe parcialmente y, donde existe, no alimenta todos los cálculos.** Hay un "Digital Investment Twin" por estrategia que permite cambiar hipótesis de la base, pero es un override de escenario sin procedencia, sin distinción entre hipótesis y dato profesional, sin reversión, que solo ven dos lectores (página de escenarios y precio máximo) y que se pierde al reanalizar. En construcción existe el vocabulario de etapas (`CostStage`) y una función para sustituir la estimación por un presupuesto profesional, sin ningún llamador.

## Capacidad existente

### 1. Precio declarado en el intake (solo al crear el análisis)

- `parseIntake` extrae `IntakeRequest.price` (`src/modules/property/intake.ts`).
- `intakeAgent` lo copia a `Property.askingPrice`; `catastroAgent` fija `PropertyProfile.askingPrice` y `askingPriceSource: "user" | "listing" | "estimated"` (`src/modules/agents/specialists/opportunity.ts`, `data.ts`). Si no hay precio, `valuationAgent` usa el valor as-is y marca `estimated` (`market.ts`).
- `baseInputs` lo convierte en `acquisition.purchasePrice` y en una `Assumption` con `source: "user" | "adapter" | "engine"` y, desde el commit `9da2008`, `status: INFERRED` para el precio tecleado ("declarado, no contrastado") (`src/modules/strategies/helpers.ts`).
- Es el **precio de partida (anuncio/declarado)**, no un precio negociado ni confirmado. No se puede editar después del análisis sin reanalizar.

### 2. Digital Investment Twin (override por estrategia)

- Modelo: `ScenarioSet { base: FinancialInputs; assumptions: Assumption[]; scenarios }` y `Assumption { path, label, value, unit, source: AssumptionSource, evidenceIds, status, note }` (`src/modules/engines/scenario/types.ts`). `AssumptionSource` ya incluye `"user"` y **`"professional"`** (este último no se usa en ningún sitio).
- `updateBase(set, changes)` aplica cambios por dot-path, recalcula solo los escenarios afectados (los estándar son relativos; los custom que sobrescriben la ruta se saltan) y marca la hipótesis como `source: "user", status: "INFERRED"` (`src/modules/engines/scenario/engine.ts`). **Sobrescribe el valor**: la estimación anterior solo sobrevive en `analyses.result`.
- Persistencia: tabla `scenario_sets` por deal y estrategia; servicio `updateScenarioBase` (`requireRole analyst`), ruta `POST /api/deals/:id/scenarios` acción `update_base`, UI `ScenarioPanel` ("Aplicar a la base"); actividad `scenario.base_updated` con informe de recálculo.
- Escenarios custom (`addCustomScenario`) y `evaluateWhatIf` ya aíslan hipótesis a nivel de escenario (no tocan la base).
- Limitaciones: (a) es por estrategia: un precio negociado habría que teclearlo en cada una de las N estrategias; (b) sin procedencia (quién, cuándo, por qué, de qué tipo); (c) no distingue hipótesis de dato profesional; (d) sin reversión (hay que volver a teclear el número antiguo y queda como "user"); (e) **solo lo leen** la página Escenarios (`listScenarioSets`) y la ruta de precio máximo (`getScenarioSet`); Overview, Estrategias, Finanzas, Passport, Riesgo, LIA y Haz magia leen `analyses.result` (congelado) vía `getLatestAnalysis`; (f) `persistAnalysis` borra y recrea `scenario_sets` → el valor manual se pierde al reanalizar.

### 3. Construcción

- `CostStage = "estimate" | "professional_budget" | "accepted_budget" | "committed" | "invoiced" | "paid"` y `BudgetLine.stage` (`src/modules/engines/construction/types.ts`).
- `replaceWithProfessionalBudget(estimate, lines, stage)` sustituye las partidas de la estimación conservando trazabilidad (`estimate.ts`). **Sin llamadores** en servicios, rutas ni UI.
- Las estrategias usan `estimate.contractBudget` como `transformation.renovationBudget` (PEM + GG/BI, antes de IVA) y derivan `professionalFees` de ese PEM en tiempo de análisis (`helpers.ts`), no en el motor.

### 4. Infraestructura reutilizable

- Auditoría: tabla `activities` + `logActivity(ctx, dealId, kind, title, payload)`; `audit_events` (auth). Página Actividad del deal lista `activities`.
- Eventos: `eventBus()` con nombres estables; `ScenarioUpdated`, `PriceChanged`, `BudgetChanged` están declarados y sin uso.
- Evidencia: `sourceType: "user_input"` para el intake.
- RBAC: roles `owner | admin | analyst | viewer`; `requireRole(ctx, "analyst")` protege todas las mutaciones de deals y escenarios. No hay permisos granulares.
- Flags: lista cerrada `FEATURE_FLAGS`; nada relacionado.
- Moneda: EUR implícito (`formatMoney`, locale es-ES); `FinancialInputs` no tiene campo de moneda; `Assumption.unit = "currency"`.
- Revisión humana (`human_reviews`) y documentos (`documents`) existen; no enlazan con inputs.
- Valoración: tipos de comparable `"professional" | "manual"` (dominio mercado, no relacionado con inputs del deal).

## Modelo de datos existente relevante

| Concepto                | Dónde                                                                                 | Persistencia                                                               |
| ----------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Precio declarado        | `IntakeRequest.price`, `deals.asking_price`                                           | `deals.intake`, `deals.asking_price`                                       |
| Precio en el análisis   | `PropertyProfile.askingPrice(+Source)`                                                | `analyses.result` (congelado)                                              |
| Inputs financieros      | `FinancialInputs` (`acquisition.purchasePrice`, `transformation.renovationBudget`, …) | `analyses.result.strategies[].scenarioSet.base` y `scenario_sets.set.base` |
| Hipótesis con fuente    | `Assumption[]`                                                                        | ídem                                                                       |
| Override por estrategia | `updateBase` + `scenario_sets.version`                                                | `scenario_sets`                                                            |
| Hipótesis de escenario  | `Scenario.overrides` (custom), what-if                                                | `scenario_sets` / ninguna                                                  |

## Reglas de precedencia existentes

Ninguna explícita. De facto: el último `update_base` gana dentro de un `scenario_set`; un escenario custom que sobrescribe una ruta conserva su valor cuando cambia la base (`pathsOverlap`).

## Recalculo existente

`updateBase` recalcula solo los escenarios afectados y devuelve `RecomputeReport`. No recalcula `headline`, `stress`, `maxPrice`, ranking, `gap`, `dna` ni síntesis del análisis (viven en `analyses.result`).

## UI existente

- Estrategias: lista de hipótesis con badge "Usuario" si `source === "user"`, DEMO, o semáforo de evidencia.
- Escenarios: "¿Y si…?" con Simular / Aplicar a la base / Guardar como escenario.
- Finanzas: precio máximo de adquisición (`MaxPricePanel`) sobre `scenario_sets`.
- Passport: fila "Precio solicitado" con `askingPriceSource`.
- No existe ninguna pantalla para introducir un dato profesional con procedencia ni para volver a la estimación.

## Rastro de auditoría existente

`scenario.base_updated` (rutas cambiadas + informe), `scenario.created`. Sin "valor antes / después", sin motivo, sin tipo de fuente.

## Carencias detectadas

1. No hay almacén a nivel de deal que sobreviva a un reanálisis.
2. No hay procedencia (`sourceType`, `enteredBy`, `enteredAt`, `reason`) ni distinción hipótesis / profesional / documento / real.
3. No hay regla de precedencia centralizada ni capa de resolución: los lectores consumen directamente `analyses.result` o `scenario_sets`.
4. Un override no alimenta Overview, Estrategias, Finanzas, Passport, Riesgo (estrés), LIA ni Haz magia.
5. No hay reversión a la estimación.
6. La estimación se sobrescribe en el twin (solo sobrevive en el análisis congelado).
7. Sin UI de entrada/edición/reversión; sin badge "Profesional".
8. LIA no distingue un dato profesional de una estimación propia.
9. Sin tests de la capacidad.

## Implementación mínima requerida (decisión)

**Opción elegida: registro genérico tipado de datos profesionales a nivel de deal (B) sobre infraestructura existente (C).** Es la menos invasiva: una columna JSONB en `deals`, un módulo puro de resolución, dos puntos de lectura ya centralizados (`getLatestAnalysis` para el análisis, `getScenarioSet`/`listScenarioSets` para el twin) y la auditoría/eventos ya existentes. Los campos por dominio (A) obligarían a tocar `PropertyProfile`, `StrategyResult` y el pipeline de agentes.

- Clave tipada (`ProfessionalInputKey`): dot-path de `FinancialInputs` ya usado por el twin; hoy `acquisition.purchasePrice` (ámbito deal) y `transformation.renovationBudget` (ámbito estrategia: cada estrategia tiene su propia obra). Extensible añadiendo entradas al registro.
- Registro: `ProfessionalInput { id, key, strategyId?, value, unit, sourceType, status, enteredBy, enteredAt, reason?, note?, breakdown?, estimateAtEntry, state }` guardado en `deals.professional_inputs` (JSONB, historial incluido: una entrada nueva supersede a la anterior; revertir desactiva sin borrar).
- Precedencia adaptada al dominio: dato profesional activo (ordenado por `sourceType`: `actual` › `document_verified` › `accepted_quote` › `contractor_quote` › `professional_confirmed`) › hipótesis manual del twin (`update_base`, `source: "user"`) › estimación del análisis (`engine | market | adapter | user-declared`) › `UNKNOWN`. Implementada una sola vez en `resolveEffectiveValue`.
- Capa de resolución en lectura: el análisis almacenado y los `scenario_sets` **nunca se modifican** por un dato profesional. `getLatestAnalysis` devuelve el análisis efectivo (misma referencia si no hay inputs → cero cambios para deals existentes); la página Escenarios, la ruta de precio máximo y el what-if usan el twin efectivo.
- Recalculo dependiente (determinista, mismas funciones que el agente de inversión): escenarios (`updateBase`), `headline`, `stress`, `maxPrice`, `risk.stressByStrategy`, ranking (`rankStrategies`), `gap`, `dna`, síntesis por plantilla (`templateSynthesis`). No se reejecutan agentes ni fuentes; mercado, urbanismo, arquitectura, normativa y propiedad quedan intactos.
- API mínima `POST /api/deals/:id/inputs` (`set` | `revert`), `requireMutation` + `requireRole("analyst")`, zod, actividad `input.professional_set|reverted` con valor antes/después, evento `DealInputUpdated`.
- UI: panel "Datos profesionales" en Finanzas (estimación / profesional / usando, editar, nota, volver a estimación), badge "Profesional" en hipótesis de Estrategias, fila en Passport, frase de procedencia en LIA.
- Migración necesaria: no existe ninguna estructura a nivel de deal que sobreviva a `persistAnalysis` (borra `scenario_sets`; `summary` es caché derivada que se reescribe). Una única columna aditiva con default `'[]'`.

## Archivos que se modificarán

Nuevos: `src/modules/inputs/*` (tipos, registro, resolución, aplicación, schema, tests), `src/server/services/inputs.ts`, `src/app/api/deals/[id]/inputs/route.ts`, `src/components/flippia/professional-inputs-panel.tsx`, `src/server/inputs.integration.test.ts`, `drizzle/0004_*.sql` (+ meta), `docs/MANUAL_INPUT_IMPLEMENTATION.md`.

Modificados (mínimo para consumir el valor resuelto o mostrar procedencia): `src/db/schema/deals.ts` (columna), `src/server/services/deals.ts` (`getLatestAnalysis` efectivo, `getStoredAnalysis`, `summaryOf`), `src/server/services/scenarios.ts` (lecturas efectivas; `update_base` rechaza rutas con dato profesional activo), `src/app/api/deals/[id]/max-price/route.ts` (twin efectivo), `src/app/(app)/app/deals/[id]/scenarios/page.tsx` (twin efectivo), `src/app/(app)/app/deals/[id]/finance/page.tsx` (panel), `src/app/(app)/app/deals/[id]/strategies/page.tsx` (badge), `src/modules/passport/build.ts` (fila), `src/modules/lia/ask.ts` (frase de procedencia), `src/modules/core/events.ts` (nombre de evento), `docs/DATABASE.md`, `docs/DECISIONS.md`, `docs/API.md`, `CLAUDE.md` (una línea en "Añadir cosas").

## Archivos que NO se tocan

Motores (`engines/financial`, `engines/scenario`, `engines/construction`, `engines/valuation`), `tax`, `strategies`, `agents` (especialistas, adversariales, runtime), `analysis/run-analysis.ts`, `analysis/synthesis.ts`, `analysis/magic.ts`, `adapters`, `regulatory`, `city`, `radar`, `watch`, `investor`, `auth`, `components/ds`, `app-shell`/navegación, `app/api/analyze`, resto de páginas del deal, `globals.css`, `flags.ts`, dependencias.

## Fallos preexistentes

Se registran en `docs/MANUAL_INPUT_IMPLEMENTATION.md` tras ejecutar la suite completa antes y después del cambio.
