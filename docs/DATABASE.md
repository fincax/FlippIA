# Base de datos

PostgreSQL 16 + PostGIS (+ pgvector opcional). Drizzle ORM; migraciones en `drizzle/` (`pnpm db:generate`, `pnpm db:migrate`). Nunca alterar producción a mano.

## Extensiones y migraciones

- `scripts/migrate.ts` crea `postgis` y `pgcrypto` (y `vector` si existe) antes de aplicar `drizzle/`. En Postgres gestionado esto requiere un rol con permiso para `CREATE EXTENSION`; si no, créalas una vez a mano y ejecuta después `pnpm db:migrate`.
- `0000_init.sql`: esquema inicial. `0001_investor_unique_profile.sql`: índice único `(organization_id, user_id)` en `investor_profiles` (deduplica antes) y `properties.location` pasa a `geometry(Point, 4326)`; el servicio escribe con `ST_SetSRID(ST_MakePoint(lng, lat), 4326)`.
- `0002_cascade_fks_rate_limits.sql`: FKs `ON DELETE CASCADE` hacia `organizations`, `deals` y `analyses` en todas las tablas de negocio (`agent_runs`, `evidence`, `regulatory_snapshots`, `scenario_sets`, `watches`, `alerts`, `human_reviews`, `documents`, `activities`, `conversations`, `messages`, `audit_events`, `opportunity_listings`, `partners`, `projects`, `milestones`) y tabla `rate_limits` (contadores compartidos). `deleteOrganization` (`src/server/services/organization.ts`) se apoya en estas cascadas.

## Conexión

`src/db/client.ts`: pool `postgres.js` con `prepare: false` (compatible con PgBouncer), `idle_timeout` 20 s, `connect_timeout` 10 s, `max_lifetime` 30 min. TLS: `require` en producción salvo `DATABASE_SSL=false` o `?sslmode=` en la URL. `DATABASE_POOL_MAX` (por defecto 10) por instancia.

## Tablas

- `organizations`, `users`, `memberships` (rol), `sessions`, `audit_events`
- `investor_profiles` (Investor DNA JSONB, versión)
- `properties` (JSONB + `location geometry(Point, 4326)` + `cadastral_ref`)
- `deals` (estado, modo deal/project, intake, `latest_analysis_id`, resumen)
- `analyses` (resultado JSONB completo, estado, fecha de análisis)
- `agent_runs` (registro completo por agente), `evidence` (procedencia), `regulatory_snapshots`
- `scenario_sets` (Digital Investment Twin por deal y estrategia, versión)
- `watches` (reglas), `alerts`, `human_reviews`, `documents`, `activities`
- `rate_limits` (contador por clave y ventana, compartido entre instancias)
- `conversations`, `messages` (LIA)
- `opportunity_listings` (org null = compartido/DEMO), `regulation_versions`
- `market_comparables` (testigos propios por organización: venta/alquiler, tipo, precio, superficie, fecha, lat/lng, microzona, referencia)
- `partners`, `projects`, `milestones` (Execution mode / Partner Network: preparados)

## Convenciones

Ids prefijados (`deal_…`, `an_…`), `organization_id` en todo lo de negocio, timestamps con zona, JSONB tipado con `$type`. Índices por organización + fecha.

## Seed y reset

- `pnpm db:seed` es idempotente: organización DEMO, usuario demo, DNA, 24 listados DEMO y 26 normas se insertan con `onConflict` (las normas se actualizan si ya existen); los 3 deals analizados, la vigilancia y las alertas solo se crean si la organización demo no tiene deals.
- El usuario demo tiene contraseña conocida. En producción el seed se niega a ejecutarse salvo `SEED_DEMO=true` y una `DEMO_USER_PASSWORD` distinta de la de ejemplo.
- `pnpm db:reset` borra el esquema: rechaza `NODE_ENV=production` y cualquier host que no sea local salvo `ALLOW_DB_RESET=true`.
