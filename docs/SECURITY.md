# Seguridad

- **Tenant isolation**: todas las tablas de negocio llevan `organization_id`; los servicios reciben `TenantContext` y filtran siempre; test de aislamiento en `src/server/server.integration.test.ts`.
- **Auth**: scrypt (N=2^17, r=8, p=1, salt por usuario; los hashes antiguos se recalculan en el siguiente login), sesiones con token aleatorio de 32 bytes almacenado hasheado (sha256), cookie `httpOnly`, `sameSite=lax`, `secure` en producción, 14 días con renovación deslizante al usarla. Logout revoca; `revokeAllSessionsForUser` cierra todas las sesiones de un usuario. Las sesiones caducadas se purgan al crear sesiones y en el cron. Login constante frente a usuarios inexistentes.
- **RBAC**: roles owner/admin/analyst/viewer (`requireRole`). ABAC previsto sobre `TenantContext`.
- **CSRF**: doble envío con HMAC(APP_SECRET, sessionId) en `x-csrf-token` para toda mutación (`requireMutation`).
- **Configuración**: `src/server/env.ts` valida el entorno al arrancar (`src/instrumentation.ts`). En producción el servidor no arranca sin `APP_SECRET` (≥ 32 caracteres) ni `DATABASE_URL`, con `DEMO_MODE=true` y la contraseña demo de ejemplo, o con un modo de fuente no soportado. Sin `APP_SECRET` en desarrollo se usa un valor fijo y se avisa en el log.
- **Rate limiting**: login, registro, demo y análisis usan contadores de ventana fija en la tabla `rate_limits`, compartidos por todas las instancias (con la base de datos caída se degrada a memoria por proceso). El tope de análisis concurrentes por organización se calcula sobre `analyses.status = running`. La IP se toma del último salto de `x-forwarded-for`, el que añade el proxy propio.
- **Cuerpos JSON**: `readJson` exige `content-type: application/json` (bloquea el truco de formulario `text/plain` cross-site) y limita el cuerpo a 64 KB.
- **Redirección tras login**: solo rutas internas absolutas (`/…`); se rechazan `//host` y `/\host`.
- **Propiedad de recursos**: `/api/analyze`, vigilancias y revisiones comprueban que el `dealId`/`listingId` recibido pertenece al tenant antes de escribir; el análisis requiere rol `analyst`.
- **Demo**: `/api/auth/demo` solo con `DEMO_MODE=true`; el seed del usuario demo está bloqueado en producción salvo opt-in explícito (ver `docs/DATABASE.md`).
- **CSP y cabeceras**: CSP con nonce por petición (`src/proxy.ts` + `src/lib/csp.ts`): `default-src 'self'`, `script-src 'self' 'nonce-…' 'strict-dynamic'` (sin `'unsafe-inline'`; `'unsafe-eval'` solo fuera de producción, lo exige el tooling de React), `frame-ancestors 'none'`, `object-src 'none'`, `base-uri`/`form-action 'self'`. Next.js lee el nonce de la cabecera y lo añade a todos sus scripts; por eso el layout raíz fuerza render dinámico (`connection()`). El resto de cabeceras estáticas (nosniff, X-Frame-Options, referrer policy, permissions policy, HSTS en producción) siguen en `next.config.ts`.
- **Validación**: zod en todos los route handlers; errores mapeados sin filtrar trazas.
- **Borrado (GDPR)**: `DELETE /api/organization` (owner, confirmación con el slug) elimina la organización; las FKs `ON DELETE CASCADE` arrastran deals, análisis, runs, evidencia, snapshots, escenarios, vigilancias, alertas, revisiones, documentos, actividad, conversaciones y mensajes; los usuarios sin otra organización se eliminan.
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
