# Seguridad

- **Tenant isolation**: todas las tablas de negocio llevan `organization_id`; los servicios reciben `TenantContext` y filtran siempre; test de aislamiento en `src/server/server.integration.test.ts`.
- **Auth**: scrypt (N=16384, r=8, p=1, salt por usuario), sesiones con token aleatorio de 32 bytes almacenado hasheado (sha256), cookie `httpOnly`, `sameSite=lax`, `secure` en producción, 14 días. Logout revoca. Login constante frente a usuarios inexistentes.
- **RBAC**: roles owner/admin/analyst/viewer (`requireRole`). ABAC previsto sobre `TenantContext`.
- **CSRF**: doble envío con HMAC(APP_SECRET, sessionId) en `x-csrf-token` para toda mutación (`requireMutation`).
- **Rate limiting**: login, registro, demo y análisis (in-memory; Redis cuando haya varias instancias).
- **CSP y cabeceras**: `default-src 'self'`, sin scripts remotos, `frame-ancestors 'none'`, nosniff, referrer policy, HSTS en producción (`next.config.ts`).
- **Validación**: zod en todos los route handlers; errores mapeados sin filtrar trazas.
- **Audit trail**: `audit_events` (registro, login), `activities` por deal, `human_reviews` versionadas, `agent_runs` completos.
- **Secretos**: `.env` fuera de git; `.env.example` documentado.
- **Uploads**: tabla `documents` con `scanStatus` (pendiente de storage S3 + antivirus + signed URLs en post-MVP).

## Seguridad de IA
- Prompt injection: el modelo recibe hechos calculados en JSON y una instrucción explícita de que los datos no son instrucciones; nunca ejecuta tools.
- Cross-deal / cross-tenant leakage: `askProperty` solo recibe el `AnalysisResult` del deal; sin memoria compartida entre organizaciones.
- Acciones irreversibles: no existen tools de acción externa; cualquier futura acción (oferta, contacto, financiación) pasará por workflow autorizado con confirmación humana.
- Budgets: sin loops ilimitados (DAG, timeouts, reintentos acotados).
