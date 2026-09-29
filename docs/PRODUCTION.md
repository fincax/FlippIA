# Puesta en producción

Lista de comprobación para desplegar FlippIA con clientes reales. Cada punto es verificable.

## 1. Entorno

- `NODE_ENV=production`, `APP_URL` con https.
- `APP_SECRET`: 32+ caracteres aleatorios (`openssl rand -base64 48`). El servidor no arranca sin él.
- `DATABASE_URL` a PostgreSQL 16 con PostGIS y pgcrypto (pgvector opcional). TLS activo (`DATABASE_SSL` vacío o `true`).
- `DEMO_MODE=false`, o `DEMO_MODE=true` con `DEMO_USER_PASSWORD` privada. Nunca la de ejemplo.
- Modos de fuente: `CATASTRO_MODE=public` y `URBANISMO_SEVILLA_MODE=public` para datos reales gratuitos (Catastro OVC e IDE Sevilla); `demo` para datos sintéticos; `official` solo con convenio (`URBANISMO_SEVILLA_ENDPOINT`). `MARKET_SOURCE_MODE=own,idealista,demo` para comparables reales (testigos propios de cada organización + API oficial de Idealista con `IDEALISTA_API_KEY`/`IDEALISTA_API_SECRET`; `demo` al final solo rellena, marcado, si la muestra real es escasa). `RADAR_SOURCES=idealista,feeds,demo` para oportunidades reales (API oficial de Idealista y feeds Kyero/JSON de `RADAR_FEEDS`), sincronizadas por `POST /api/cron/radar` o `pnpm radar:sync` (programa una ejecución diaria). `FINANCING_PROVIDER_MODE=demo` (el modo `partner` aún no existe). Un valor desconocido, `idealista` sin credenciales o `feeds` sin `RADAR_FEEDS` válido impide el arranque.
- Con fuentes públicas el servidor necesita salida HTTPS a `ovc.catastro.meh.es`, `sig.urbanismosevilla.org` y `cdu.urbanismosevilla.org`. Antes de lanzar, ejecuta `pnpm sources:check "Calle Pureza 45, Sevilla"` desde el servidor y comprueba que Catastro y al menos las capas de clasificación y calificación responden; `pnpm urbanismo:discover` lista las capas publicadas si alguna ha cambiado (ver `docs/DATA_SOURCES.md`). Con Idealista añade salida a `api.idealista.com` y comprueba con `pnpm market:check "37.3826,-5.9963"`.
- `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` para narrativa con modelo; sin clave todo funciona en modo determinista.
- `CRON_SECRET`: token aleatorio para `POST /api/cron/watches`. Programa la llamada cada hora desde tu plataforma (Vercel Cron, GitHub Actions, crontab):
  `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/watches`
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

- Datos de mercado, financiación y urbanismo en modo DEMO llevan badge DEMO en la interfaz. Cualquier tesis con evidencia DEMO no es una recomendación real.
- Las reglas fiscales (`src/modules/tax/rules.ts`) son estimaciones versionadas; ICIO, tasa de licencia, IBI e IS llevan estado `INFERRED`/`REVIEW_REQUIRED`. Valídalas con asesoría fiscal antes de usarlas en ofertas reales.
- Las normas municipales de Sevilla citan boletín, número y fecha (ver `docs/REGULATORY_ENGINE.md`) pero siguen `INFERRED` hasta cotejar el boletín; la modificación de 2026 de los planes especiales del Conjunto Histórico está `pending`. Estado visible en la evidencia.
- El Smart Watcher depende de que tu plataforma llame a `POST /api/cron/watches` (ver arriba); sin esa llamada las vigilancias solo se evalúan a mano desde la interfaz.
