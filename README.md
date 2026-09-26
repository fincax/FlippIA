# FlippIA — Real Estate Transformation OS

> FlippIA descubre el mejor futuro posible de un inmueble. De una dirección a una tesis de inversión completa.

FlippIA no es un portal, ni un CRM, ni una calculadora. Es una plataforma agéntica que **descubre, analiza, transforma, financia y vigila** oportunidades inmobiliarias. Empieza en Sevilla (City Zero) con una arquitectura preparada para cualquier ciudad.

```
DISCOVER → UNDERSTAND → VERIFY → TRANSFORM → DECIDE → FUND → ACQUIRE → EXECUTE → SELL / RENT / EXIT → LEARN ↺
```

## Qué hace hoy (MVP vertical slice)

1. **Command bar** en la home: dirección, referencia catastral, coordenadas, URL o "Tengo 300.000 €".
2. **LIA** interpreta la petición (parser determinista, sin API key) y decide: analizar, buscar en el radar o aclarar.
3. **Orquestación agéntica** observable en streaming: 23 agentes en 10 dominios (oportunidad, datos, mercado, normativa, urbanismo, arquitectura, financiación, inversión, salida, riesgo) con plan DAG, presupuestos, reintentos y timeouts.
4. **MultiExit**: 10 estrategias plugin (reforma integral, reforma ligera, redistribución, alquiler, compra-alquiler, cambio de uso, división, rehabilitación energética, venta con licencia, turístico). Nada se presenta como viable sin comprobación.
5. **Motores deterministas** (sin LLM): financiero (costes, flujos mensuales, TIR, ROE, LTV/LTC, DSCR…), escenarios (Digital Investment Twin con grafo de dependencias), estrés, precio máximo de compra, construcción, valoración por comparables, reglas fiscales versionadas.
6. **Deal Room**: overview, estrategias, escenarios + what-if, finanzas, riesgo, urbanismo, arquitectura, mercado (mapa esquemático), evidencia, Deal Passport (imprimible, con FlippIA Verified), actividad, Ask this property.
7. **Haz magia**: mejoras razonables y explícitas (precio, estructura de capital, plazo, alcance, IVA, salida), nunca falseadas.
8. **Radar + Reverse investing**, **Opportunity Autopsy**, **Smart Watcher** con alertas, **FlippIA Pulse**.
9. **Regulatory Intelligence foundation**: registro versionado UE→España→Andalucía→Sevilla, snapshots por análisis y watcher de cambios.
10. **Evidencia y procedencia** en cada dato; semáforo VERIFIED / INFERRED / REVIEW_REQUIRED / CONFLICT / UNKNOWN; DEMO siempre etiquetado.
11. Autenticación, organizaciones aisladas por tenant, RBAC, CSRF, rate limiting, audit trail.

## Arranque rápido

```bash
# Producción: sigue docs/PRODUCTION.md antes del primer despliegue.
# 1. Requisitos: Node ≥ 20.9, pnpm 10, PostgreSQL 16 con PostGIS (docker-compose incluido)
cp .env.example .env
docker compose up -d db          # o usa tu Postgres local (DATABASE_URL)
pnpm install
pnpm db:migrate                  # aplica drizzle/ y crea extensiones
pnpm db:seed                     # organización demo, 24 listados DEMO, 3 deals analizados
pnpm dev                         # http://localhost:3000
```

Entra con **"Entrar con la demo de Sevilla"** (usuario `demo@flippia.local` / `flippia-demo`, configurable en `.env`).

Sin `ANTHROPIC_API_KEY` la aplicación funciona íntegramente en modo determinista: LIA usa plantillas sobre hechos calculados. Con clave, el modelo redacta la narrativa sin añadir cifras.

## Comandos

| Comando                                                                   | Qué hace                                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm build` / `pnpm start`                                  | Next.js                                                                   |
| `pnpm typecheck` · `pnpm lint` · `pnpm format`                            | Calidad                                                                   |
| `pnpm test`                                                               | Unit (motores, agentes, LIA) + integration (Postgres `DATABASE_URL_TEST`) |
| `pnpm test:e2e`                                                           | Playwright (requiere servidor y seed)                                     |
| `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:seed` · `pnpm db:reset` | Base de datos                                                             |
| `pnpm check`                                                              | typecheck + lint + test                                                   |

## Arquitectura (resumen)

Monolito modular en Next.js 16 / TypeScript strict con separación estricta por dominios (`src/modules/*`), servicios de servidor con contexto de tenant (`src/server/*`), esquema Drizzle + migraciones (`src/db`), y una capa de UI que **no contiene lógica de negocio**. Ver `docs/ARCHITECTURE.md`, `docs/AGENTS.md`, `docs/FINANCIAL_ENGINE.md`, `docs/REGULATORY_ENGINE.md`, `docs/DATA_SOURCES.md`, `docs/SECURITY.md`, `docs/DATABASE.md`, `docs/API.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`.

## Integraciones pendientes (configurables, nunca bloqueantes)

| Variable                                                         | Estado                                                                                                        | Qué falta                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `CATASTRO_MODE=public`                                           | Implementado (OVC servicios libres)                                                                           | Verificación de campos en producción                        |
| `URBANISMO_SEVILLA_MODE=official` + `URBANISMO_SEVILLA_ENDPOINT` | Interfaz lista, conector no configurado                                                                       | Convenio/API con Gerencia de Urbanismo o WFS de IDE Sevilla |
| `MARKET_SOURCE_MODE=partner`                                     | Interfaz lista                                                                                                | Feed autorizado de comparables/transacciones                |
| `FINANCING_PROVIDER_MODE=partner`                                | Interfaz lista                                                                                                | Brokers/entidades                                           |
| `ANTHROPIC_API_KEY`                                              | Proveedor implementado                                                                                        | Clave                                                       |
| Feature flags (`FEATURE_FLAGS`)                                  | `radar.v2, architect.generative, urbanism.experimental, financing.live, lens.beta, map.tiles, execution.mode` | Capacidades post-MVP                                        |

Todo lo sintético está marcado **DEMO** en datos, evidencia y UI.

## Aviso

Las conclusiones de FlippIA son estimaciones con fecha, fuente y estado de evidencia. No sustituyen licencias, resoluciones administrativas, certificados profesionales, asesoramiento jurídico vinculante ni tasaciones oficiales.
