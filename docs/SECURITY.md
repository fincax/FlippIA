# Seguridad

- **Tenant isolation**: todas las tablas de negocio llevan `organization_id`; los servicios reciben `TenantContext` y filtran siempre; test de aislamiento en `src/server/server.integration.test.ts`.
- **Auth**: scrypt (N=16384, r=8, p=1, salt por usuario), sesiones con token aleatorio de 32 bytes almacenado hasheado (sha256), cookie `httpOnly`, `sameSite=lax`, `secure` en producción, 14 días. Logout revoca. Login constante frente a usuarios inexistentes.
- **RBAC**: roles owner/admin/analyst/viewer (`requireRole`). ABAC previsto sobre `TenantContext`.
- **CSRF**: doble envío con HMAC(APP_SECRET, sessionId) en `x-csrf-token` para toda mutación (`requireMutation`).
- **Configuración**: `src/server/env.ts` valida el entorno al arrancar (`src/instrumentation.ts`). En producción el servidor no arranca sin `APP_SECRET` (≥ 32 caracteres) ni `DATABASE_URL`, con `DEMO_MODE=true` y la contraseña demo de ejemplo, o con un modo de fuente no soportado. Sin `APP_SECRET` en desarrollo se usa un valor fijo y se avisa en el log.
- **Rate limiting**: login, registro, demo y análisis, más un tope de análisis concurrentes por organización. Es in-memory por proceso: con varias instancias o serverless cada instancia cuenta por separado (Redis pendiente). La IP se toma del último salto de `x-forwarded-for`, el que añade el proxy propio.
- **Cuerpos JSON**: `readJson` exige `content-type: application/json` (bloquea el truco de formulario `text/plain` cross-site) y limita el cuerpo a 64 KB.
- **Redirección tras login**: solo rutas internas absolutas (`/…`); se rechazan `//host` y `/\host`.
- **Propiedad de recursos**: `/api/analyze`, vigilancias y revisiones comprueban que el `dealId`/`listingId` recibido pertenece al tenant antes de escribir; el análisis requiere rol `analyst`.
- **Demo**: `/api/auth/demo` solo con `DEMO_MODE=true`; el seed del usuario demo está bloqueado en producción salvo opt-in explícito (ver `docs/DATABASE.md`).
- **CSP y cabeceras**: `default-src 'self'`, sin scripts remotos, `frame-ancestors 'none'`, nosniff, referrer policy, HSTS en producción (`next.config.ts`).
- **Validación**: zod en todos los route handlers; errores mapeados sin filtrar trazas.
- **Audit trail**: `audit_events` (registro, login), `activities` por deal, `human_reviews` versionadas, `agent_runs` completos.
- **Secretos**: `.env` fuera de git; `.env.example` documentado.
- **Uploads**: tabla `documents` con `scanStatus` (pendiente de storage S3 + antivirus + signed URLs en post-MVP).

## Seguridad de IA

- Prompt injection: el modelo recibe hechos calculados en JSON y una instrucción explícita de que los datos no son instrucciones; nunca ejecuta tools.
- Cifras: `src/modules/ai/guard.ts` rechaza cualquier texto del modelo que contenga un número que no esté en los hechos calculados; en ese caso se conserva la plantilla determinista. Llamadas con timeout (`AI_TIMEOUT_MS`, 15 s) y un reintento.
- Overrides de escenarios: rutas validadas contra las raíces de `FinancialInputs` y sin segmentos `__proto__`/`constructor`/`prototype` (prototype pollution).
- Cross-deal / cross-tenant leakage: `askProperty` solo recibe el `AnalysisResult` del deal; sin memoria compartida entre organizaciones.
- Acciones irreversibles: no existen tools de acción externa; cualquier futura acción (oferta, contacto, financiación) pasará por workflow autorizado con confirmación humana.
- Budgets: sin loops ilimitados (DAG, timeouts, reintentos acotados).
