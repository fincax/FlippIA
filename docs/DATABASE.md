# Base de datos

PostgreSQL 16 + PostGIS (+ pgvector opcional). Drizzle ORM; migraciones en `drizzle/` (`pnpm db:generate`, `pnpm db:migrate`). Nunca alterar producción a mano.

## Tablas
- `organizations`, `users`, `memberships` (rol), `sessions`, `audit_events`
- `investor_profiles` (Investor DNA JSONB, versión)
- `properties` (JSONB + `location geometry(Point, 4326)` + `cadastral_ref`)
- `deals` (estado, modo deal/project, intake, `latest_analysis_id`, resumen)
- `analyses` (resultado JSONB completo, estado, fecha de análisis)
- `agent_runs` (registro completo por agente), `evidence` (procedencia), `regulatory_snapshots`
- `scenario_sets` (Digital Investment Twin por deal y estrategia, versión)
- `watches` (reglas), `alerts`, `human_reviews`, `documents`, `activities`
- `conversations`, `messages` (LIA)
- `opportunity_listings` (org null = compartido/DEMO), `regulation_versions`
- `partners`, `projects`, `milestones` (Execution mode / Partner Network: preparados)

## Convenciones
Ids prefijados (`deal_…`, `an_…`), `organization_id` en todo lo de negocio, timestamps con zona, JSONB tipado con `$type`. Índices por organización + fecha.

## Seed
`pnpm db:seed` es reproducible: organización DEMO, usuario demo, DNA, 24 listados DEMO, 24 normas, 3 deals analizados, vigilancia y alertas.
