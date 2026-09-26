# Puesta en producción

Lista de comprobación para desplegar FlippIA con clientes reales. Cada punto es verificable.

## 1. Entorno

- `NODE_ENV=production`, `APP_URL` con https.
- `APP_SECRET`: 32+ caracteres aleatorios (`openssl rand -base64 48`). El servidor no arranca sin él.
- `DATABASE_URL` a PostgreSQL 16 con PostGIS y pgcrypto (pgvector opcional). TLS activo (`DATABASE_SSL` vacío o `true`).
- `DEMO_MODE=false`, o `DEMO_MODE=true` con `DEMO_USER_PASSWORD` privada. Nunca la de ejemplo.
- Modos de fuente: `CATASTRO_MODE` (`demo` | `public`), `URBANISMO_SEVILLA_MODE` (`demo` | `public` | `official` + `URBANISMO_SEVILLA_ENDPOINT`), `MARKET_SOURCE_MODE=demo`, `FINANCING_PROVIDER_MODE=demo`. Los modos `partner` aún no existen; un valor desconocido impide el arranque.
- `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` para narrativa con modelo; sin clave todo funciona en modo determinista.
- `LOG_LEVEL=info`. Los logs son JSON por línea en producción.

## 2. Base de datos

```
pnpm db:migrate            # crea extensiones y aplica drizzle/
SEED_DEMO=true DEMO_USER_PASSWORD=<privada> pnpm db:seed   # solo si quieres la organización demo
```

- Comprueba `select srid from geometry_columns where f_table_name='properties'` → 4326.
- Copias de seguridad diarias y prueba de restauración antes del primer cliente.

## 3. Verificación

```
pnpm typecheck && pnpm lint && pnpm test && pnpm build
E2E_BASE_URL=https://<host> pnpm test:e2e
```

- Tras desplegar: `GET /` 200, `GET /app` redirige a `/login`, `GET /manifest.webmanifest` 200, `POST /api/auth/login` sin `content-type: application/json` responde 415.

## 4. Límites conocidos (MVP)

- Rate limiting y tope de análisis concurrentes son por proceso. Con más de una instancia, cada una cuenta por separado; el límite real por organización es N × 30/h. Redis pendiente.
- Datos de mercado, financiación y urbanismo en modo DEMO llevan badge DEMO en la interfaz. Cualquier tesis con evidencia DEMO no es una recomendación real.
- Las reglas fiscales (`src/modules/tax/rules.ts`) son estimaciones versionadas; ICIO, tasa de licencia, IBI e IS llevan estado `INFERRED`/`REVIEW_REQUIRED`. Valídalas con asesoría fiscal antes de usarlas en ofertas reales.
- Las normas urbanísticas municipales tienen fuente en la web de la Gerencia, no en el BOP. Estado `unverified` visible en la evidencia.
- No hay programador para el Smart Watcher: `POST /api/watches/evaluate` se invoca a mano o desde un cron externo.
- El borrado de organizaciones no está implementado (ver `docs/DATABASE.md`).
