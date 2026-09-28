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

## ADR-015 Reverse investing por proyecto: brief hablado + pase rápido MultiExit (2026-09-27)

- **Motivo**: el Radar solo respondía a "tengo X €" y evaluaba una única vía (comprar, reformar, vender); "busco un local en Triana para convertirlo en vivienda" perdía el proyecto y las zonas. El camino inverso debe crecer sin anular el existente.
- **Decisión**: `src/modules/radar/brief.ts` convierte el texto en un `ProjectBrief` determinista (uso, tipología, superficie, zonas, tope de precio, estrategias/familias/objetivo) reutilizando `parseIntake`; `applyBriefToDna` mantiene las reglas históricas de capital/aportación/ticket y añade zonas, estrategias y objetivo, sin confundir nunca un tope de precio con capital. `listingStrategyContext` construye un `StrategyContext` a partir de la microzona (todo `INFERRED`, `demo: true` en mercado/urbanismo) y `quickUnderwriteStrategies` ejecuta **los mismos `StrategyPlugin`** del análisis completo con el motor financiero, comprobando cada vía contra el DNA y el brief y eligiendo la mejor. Para ello se extrajeron funciones puras ya existentes (`buildArchitectureAlternatives`, `estimateCurrentProgram`, `buildCapitalStacks`, `indicativeOffers`) que los agentes siguen usando.
- **Consecuencias**: sin proyecto ni estrategias en el DNA, `radarSearch` es idéntico al anterior (test de igualdad); con proyecto, cada hit lleva `bestStrategyId` y `strategies`, y la autopsia lista todas las vías. Nuevas palabras de proyecto se añaden en `STRATEGY_KEYWORDS`; una estrategia nueva entra en el Radar solo con registrarse en `STRATEGY_PLUGINS`. Los listados propios entran por API/CSV en `opportunity_listings` (ADR-006, sin scraping).

## ADR-016 Normas municipales citadas por boletín; VERIFIED solo con el boletín cotejado (2026-09-28)

- **Motivo**: las cinco entradas municipales de Sevilla apuntaban a portadas web sin número de boletín ni fecha, y una figuraba `unverified`. Sin cita exacta el estado nunca podría subir.
- **Decisión**: cada versión municipal lleva boletín, número y fecha (`sourceName`), enlace al documento oficial (`sourceUrl`) y `ingestedAt` de la revisión. Se separan instrumentos distintos en normas distintas (MP 44 del PGOU frente al límite del 10 % de VUT por barrio; planes especiales por sector frente a su modificación de 2026 para entornos BIC) y se versionan los textos sucesivos (OROA 2018/2025, ICIO 2025/2026). `VERIFIED` se reserva a cotejar el boletín citado; una cita exacta sin cotejo es `INFERRED`, y un instrumento cuya publicación no consta es `pending`.
- **Consecuencias**: `pnpm db:seed` actualiza las versiones ya sembradas. Cambiar una fecha de vigencia o el tipo del ICIO es una versión nueva, que el watcher clasifica en los análisis guardados.

## ADR-017 Procedencia por conclusión y localización en el stream (2026-09-28)

## ADR-018 Universo visual "Mineral + Digital" sobre el sistema funcional intacto (2026-09-28)

- **Motivo**: FlippIA parecía otro dashboard PropTech. El rediseño debía hacer visible la inteligencia que ya existe sin tocar backend, motores, agentes, datos ni contratos.
- **Decisión**: capa de presentación nueva (tokens, Geist Sans/Mono autohospedadas, componentes presentacionales en `src/components/flippia/visual`) que consume los contratos existentes. Un único acento (naranja arquitectónico) significa POTENCIAL. LIA es presencia (pulso), no rostro. La ciudad de fondo es esquemática y determinista, marcada como tal.
- **Consecuencias**: ningún componente visual llama a APIs ni calcula; las cifras siguen saliendo de los motores. Las limitaciones que el diseño no puede resolver sin cambios funcionales están en `DESIGN_DEPENDENCIES.md`. `docs/UX.md` y `design-system/README.md` describen la nueva gramática. El título del documento en `/app/analyze` pasa a "Análisis en curso" para no duplicar en el anunciador de rutas el texto visible "LIA está construyendo el caso".

- **Motivo**: principio 2 (ninguna conclusión sin procedencia) se cumplía a nivel de análisis, no de conclusión: los hallazgos urbanísticos y la tesis no sabían qué evidencias los sostenían; y el Scan no podía apuntar a la parcela real porque el stream solo transportaba `dealId`.
- **Decisión**: `UrbanismFinding.evidenceIds` (evidencia de planeamiento de cada hallazgo) e `InvestmentSynthesis.evidenceIds` (`thesisEvidenceIds`: runs de activo, mercado y planeamiento). `/api/analyze` emite `located` (`AssetLocation`) al completar `data.catastro`, extraído del partial con un type guard; el partial completo sigue sin salir del servidor. `TaskState.at` conserva el instante del orquestador.
- **Consecuencias**: sin migración de esquema (el análisis es JSON); los análisis persistidos antes de esta fecha no llevan `evidenceIds` y la UI cae al conjunto completo o al filtro por tipo de fuente. `OpportunityGap` sigue sin evidencia enlazada.
