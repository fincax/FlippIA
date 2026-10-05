# API

Todas las rutas devuelven `{ ok: true, data }` o `{ ok: false, error: { code, message, details? } }`. Mutaciones requieren sesión y cabecera `x-csrf-token` (valor en `<meta name="csrf-token">`).

| Método   | Ruta                                                                      | Descripción                                                                                                      |
| -------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| POST     | `/api/auth/register` `/login` `/logout` `/demo`                           | Autenticación (rate-limited)                                                                                     |
| POST     | `/api/command`                                                            | LIA: `{ text }` → acción (analyze/radar/clarify)                                                                 |
| POST     | `/api/analyze`                                                            | `{ text, dealId? }` → **SSE**: `meta`, `agent` (AnalysisEvent), `done`, `error`                                  |
| POST     | `/api/deals/:id/ask`                                                      | Ask this property `{ question }`                                                                                 |
| POST     | `/api/deals/:id/scenarios`                                                | `{ action: update_base                                                                                           | custom | what_if, strategyId, overrides, name?, fromScenarioId? }` |
| POST     | `/api/deals/:id/max-price`                                                | `{ strategyId, constraints }` sobre el twin efectivo (datos profesionales aplicados)                             |
| POST     | `/api/deals/:id/inputs`                                                   | Datos profesionales: `{ action: set, key, strategyId?, value, sourceType, reason?, note?, breakdown? }`          |
|          |                                                                           | o `{ action: revert, key, strategyId?, reason? }`; rol analyst; auditado en `activities`                         |
| POST     | `/api/deals/:id/magic`                                                    | Haz magia                                                                                                        |
| POST     | `/api/deals/:id/status`                                                   | `{ status }`                                                                                                     |
| GET/POST | `/api/watches` · DELETE `/api/watches/:id` · POST `/api/watches/evaluate` | Smart Watcher                                                                                                    |
| GET/POST | `/api/investor`                                                           | Investor DNA                                                                                                     |
| GET      | `/api/radar?include=all&q=`                                               | Radar; `q` = objetivo o proyecto hablado (brief) → añade `bestStrategyId` y `strategies` por hit                 |
| GET/POST | `/api/radar/listings` · DELETE `/api/radar/listings/:id`                  | Listados propios de la organización (`{ listings: [...] }`, ≤ 500); DELETE los retira del Radar                  |
| POST     | `/api/alerts/:id/read`                                                    | Alertas                                                                                                          |
| POST     | `/api/reviews`                                                            | Revisión humana                                                                                                  |
| GET      | `/api/sources`                                                            | Estado de fuentes (admin/owner)                                                                                  |
| DELETE   | `/api/organization`                                                       | `{ confirmSlug }` → borra la organización y todos sus datos (owner)                                              |
| POST     | `/api/cron/watches`                                                       | Smart Watcher programado para todas las organizaciones. `Authorization: Bearer $CRON_SECRET`; sin sesión ni CSRF |

Cuerpos JSON: `content-type: application/json` obligatorio (415 si falta) y máximo 64 KB (413). Rate limits compartidos entre instancias (tabla `rate_limits`): login 10/10 min por IP, registro 5/h, demo 20/10 min, análisis 30/h por organización y 3 en curso.
