# Arquitectura

## Estilo

**Monolito modular + workers (futuro)**. Un único despliegue Next.js 16 con dominios separados en `src/modules`, servicios con contexto de tenant y una base de datos PostgreSQL 16 (PostGIS, pgvector). Los dominios no importan de `src/app` ni de `src/server`; la UI no contiene lógica de negocio. La extracción a servicios es posible por dominio sin reescritura.

## Capas

```
UI (RSC + client components)  →  route handlers (/api/*)  →  services (TenantContext)  →  modules (dominio puro)  →  engines / adapters / DB
```

- **Route handlers**: validación zod, auth (`tenantContext` / `requireMutation`), mapeo de errores (`src/lib/api.ts`).
- **Services**: transacciones, persistencia, eventos de dominio, auditoría. Siempre filtran por `organizationId`.
- **Modules**: sin dependencia de Next ni de la DB; testables en aislamiento.

## Flujo de análisis (vertical slice)

1. `parseIntake(text)` → `IntakeRequest` (determinista).
2. `createDeal` + `markAnalyzing`.
3. `runAnalysis` construye el plan (`buildAnalysisPlan`) y lo ejecuta con `executePlan` (DAG, paralelismo por dependencias, budgets, retries, timeouts, eventos observables).
4. Outputs → `rankStrategies`, `computeOpportunityGap`, `computeOpportunityDNA`, `templateSynthesis` (+ `narrateSynthesis` si hay modelo).
5. `persistAnalysis` guarda análisis (JSONB), agent runs, evidencia, snapshot regulatorio y scenario sets.
6. El cliente recibe SSE (`/api/analyze`) y abre el Deal Room.

## Digital Investment Twin

`ScenarioSet` = base + hipótesis + escenarios (base/optimista/conservador/estrés/custom). `updateBase(changes)` recalcula solo los escenarios afectados (`pathsOverlap`); los estándar son relativos a la base; los custom conservan sus overrides. `evaluateWhatIf` no persiste.

## Eventos de dominio

`src/modules/core/events.ts`: bus en proceso con nombres estables (`DealCreated`, `AnalysisCompleted`, `WatchTriggered`, `HumanReviewRecorded`, …). Un broker durable puede sustituir el bus sin cambiar productores/consumidores.

## Ciudad como configuración

`CityProfile` contiene jurisdicción fiscal y regulatoria, microzonas, catálogo urbanístico y qué adaptadores usa. Sevilla es la primera implementación; nada del core conoce el nombre de la ciudad.

## Observabilidad

`AgentRun` por agente (input, output estructurado, tool calls, evidencia, latencia, intentos, error). Panel en `/app/observability`. Logger estructurado (`src/modules/core/logger.ts`). OpenTelemetry: preparado por variable `OTEL_EXPORTER_OTLP_ENDPOINT` (exportador pendiente).

## Frontend

Design system propio (`src/components/ds`, tokens en `globals.css`), componentes de dominio (`src/components/flippia`), streaming con `ReadableStream`, command palette (⌘K), mobile-first en interacción (barra inferior) y desktop-first en análisis.
