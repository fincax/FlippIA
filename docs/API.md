# API

Todas las rutas devuelven `{ ok: true, data }` o `{ ok: false, error: { code, message, details? } }`. Mutaciones requieren sesión y cabecera `x-csrf-token` (valor en `<meta name="csrf-token">`).

| Método | Ruta | Descripción |
| --- | --- | --- |
| POST | `/api/auth/register` `/login` `/logout` `/demo` | Autenticación (rate-limited) |
| POST | `/api/command` | LIA: `{ text }` → acción (analyze/radar/clarify) |
| POST | `/api/analyze` | `{ text, dealId? }` → **SSE**: `meta`, `agent` (AnalysisEvent), `done`, `error` |
| POST | `/api/deals/:id/ask` | Ask this property `{ question }` |
| POST | `/api/deals/:id/scenarios` | `{ action: update_base|custom|what_if, strategyId, overrides, name?, fromScenarioId? }` |
| POST | `/api/deals/:id/max-price` | `{ strategyId, constraints }` |
| POST | `/api/deals/:id/magic` | Haz magia |
| POST | `/api/deals/:id/status` | `{ status }` |
| GET/POST | `/api/watches` · DELETE `/api/watches/:id` · POST `/api/watches/evaluate` | Smart Watcher |
| GET/POST | `/api/investor` | Investor DNA |
| GET | `/api/radar?include=all` | Radar |
| POST | `/api/alerts/:id/read` | Alertas |
| POST | `/api/reviews` | Revisión humana |
| GET | `/api/sources` | Estado de fuentes |
