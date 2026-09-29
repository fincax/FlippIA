# Decisiones de arquitectura

Formato: Decisión · Motivo · Alternativas · Consecuencias · Fecha.

## ADR-001 Monolito modular en Next.js 16 (2026-09-26)

- **Motivo**: un solo despliegue, dominios separados, extracción futura posible. El MVP no debe ser un problema DevOps.
- **Alternativas**: monorepo pnpm con paquetes; microservicios.
- **Consecuencias**: reglas de dependencia por convención (documentadas en CLAUDE.md); workers como proceso separado cuando haga falta.

## ADR-002 Autenticación propia (scrypt + sesiones en DB) (2026-09-26)

- **Motivo**: control total de tenant isolation, CSRF, auditoría; sin dependencia de versión de librerías de auth.
- **Alternativas**: better-auth, next-auth.
- **Consecuencias**: OAuth/2FA se añadirán sobre la tabla `sessions`; revisar antes de producción.

## ADR-003 Drizzle ORM + migraciones SQL generadas (2026-09-26)

- **Motivo**: tipado fuerte, SQL explícito, soporte PostGIS.
- **Alternativas**: Prisma, Kysely.
- **Consecuencias**: `pnpm db:generate` obligatorio en cambios de esquema.

## ADR-004 Motores deterministas y LLM solo narrativo (2026-09-26)

- **Motivo**: principio IV (ningún cálculo importante por LLM); reproducibilidad y tests.
- **Consecuencias**: el producto funciona sin API key; el modelo reformula hechos, nunca aporta cifras.

## ADR-005 Intake y routing de LIA deterministas (2026-09-26)

- **Motivo**: el momento WOW no puede depender de una API externa; latencia y coste.
- **Consecuencias**: cobertura de lenguaje limitada a patrones; el modelo enriquecerá casos ambiguos (post-MVP) sin sustituir el parser.

## ADR-006 Adaptadores por modo (demo | public | official | partner) (2026-09-26)

- **Motivo**: nada bloquea el desarrollo; ninguna fuente acoplada al core; DEMO siempre etiquetado.
- **Consecuencias**: cada fuente devuelve `evidence` y `mode`; `sourceStatuses()` alimenta la UI.

## ADR-007 Análisis persistido como JSONB + tablas normalizadas de runs/evidencia/snapshots (2026-09-26)

- **Motivo**: el resultado es un documento versionado; runs y evidencia necesitan consulta transversal.
- **Consecuencias**: cambios de forma del `AnalysisResult` requieren migración lógica (versión en `createdAt`/`analysisDate`).

## ADR-008 Mapa esquemático SVG en MVP; tiles tras `map.tiles` (2026-09-26)

- **Motivo**: CSP estricta sin hosts externos; el mapa muestra oportunidades, no callejero.
- **Consecuencias**: PostGIS ya almacena `location`; maplibre entrará como capa opcional.

## ADR-009 ESLint 9 (línea de mantenimiento) (2026-09-26)

- **Motivo**: `eslint-config-next` 16 no es compatible aún con ESLint 10.

## ADR-010 Validación del entorno al arrancar y seed demo con opt-in (2026-09-26)

- **Motivo**: un `APP_SECRET` por defecto o un usuario demo con contraseña pública en producción son fallos silenciosos.
- **Consecuencias**: `assertProductionEnv()` corta el arranque; `pnpm db:seed` exige `SEED_DEMO=true` y contraseña propia en producción; los modos de fuente desconocidos son error, no DEMO.

## ADR-011 El modelo puede reformular, nunca añadir cifras (2026-09-26)

- **Motivo**: principio 3 (ningún cálculo por LLM) se cumplía en los datos pero no en la narrativa mostrada.
- **Consecuencias**: `introducesNoNewNumbers` filtra la tesis y las respuestas de LIA; ante una cifra nueva se mantiene la plantilla determinista y se registra un aviso.

## ADR-012 `properties.location` en SRID 4326 con escritura explícita (2026-09-26)

- **Motivo**: drizzle-kit no serializa el SRID y el driver escribe puntos sin SRID; la primera consulta espacial mixta fallaría.
- **Consecuencias**: migración `0001` cambia el tipo; las inserciones usan `ST_SetSRID(ST_MakePoint(), 4326)`.

## ADR-013 Urbanismo público por geoservicios abiertos, configurado por ciudad (2026-09-26)

- **Motivo**: la información de planeamiento debe obtenerse de la parte pública de la Gerencia sin coste ni convenio, y sin acoplar Sevilla al core.
- **Consecuencias**: `src/modules/adapters/geoservices` habla ArcGIS REST y WFS; `CityProfile.urbanism.publicSources` declara capas por rol (parcelario, clasificación, calificación, catálogo, conjunto histórico, VUT, planeamiento en trámite, expedientes); cada capa que responde es una evidencia `official_planning` con la URL de la consulta; las que faltan se declaran, nunca se inventan. `pnpm urbanismo:discover` y `pnpm sources:check` verifican el mapeo contra el publicador.

## ADR-014 Comparables reales: testigos propios + API oficial de Idealista, combinados (2026-09-27)

- **Motivo**: la valoración se apoyaba solo en comparables sintéticos. Las transacciones reales no tienen fuente gratuita; los anuncios sí (API oficial de Idealista, sin scraping) y la organización acumula sus propios testigos.
- **Consecuencias**: `MARKET_SOURCE_MODE` es una lista (`own,idealista,demo`); `CompositeMarketAdapter` combina proveedores y solo recurre a DEMO, marcándolo, si la muestra real es insuficiente y `demo` está en la lista; tabla `market_comparables` por organización con API y CSV; el adaptador de testigos se inyecta por petición (`tenantAdapters`), nunca desde el registro global. Liquidez y días de venta se etiquetan como referencia por nivel de profundidad de mercado, no como medición.

## ADR-015 Radar con anuncios reales sincronizados: API oficial de Idealista y feeds autorizados (2026-09-29)

- **Motivo**: el Radar solo veía 24 anuncios sintéticos. Los portales prohíben el scraping; la vía legal es la API oficial de Idealista y los feeds que agencias, CRMs y portales entregan con permiso (Kyero XML v3, JSON).
- **Consecuencias**: `RADAR_SOURCES` lista las fuentes; un job (`/api/cron/radar`, `pnpm radar:sync`) las vuelca en `opportunity_listings` como filas compartidas con historial de precio y retirada, en lugar de consultar la API en cada visita (cuota). El Radar valora contra la oferta real de la microzona cuando hay muestra suficiente y declara «Referencia DEMO» si no. `IdealistaClient` es único para comparables y Radar (token y caché compartidos).
