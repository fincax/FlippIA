# Design system

Dirección visual: **MINERAL + DIGITAL**. Arquitectura × urbanismo × capital × inteligencia. Un solo acento
(naranja arquitectónico) que significa exactamente una cosa: POTENCIAL. Todo lo demás es carbón, grafito,
hormigón, piedra y blanco roto. Sin gradientes, sin glassmorphism, sin redondeos, sin robots.

Tokens en `src/app/globals.css` (`:root` y `[data-theme="light"]`), expuestos a Tailwind 4 con `@theme inline`.
Dark Intelligence Mode es el modo por defecto (análisis, radar). Editorial Light Mode (`data-theme="light"`) y
`@media print` reescriben los mismos tokens para Passport y documentación.

## Tokens

| Familia       | Tokens                                                                                                                                   | Uso                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Superficies   | `bg`, `bg-2`, `surface`, `surface-raised`, `surface-hover`                                                                               | fondos y planos                                         |
| Texto         | `fg`, `fg-2`, `fg-3`                                                                                                                     | primario / secundario / atenuado                        |
| Acento        | `accent`, `accent-strong`, `accent-soft`, `accent-ink`                                                                                   | POTENCIAL: el "IA" del wordmark, diferencial, CTA, foco |
| Semánticos    | `success`, `warning`, `danger`                                                                                                           | estados                                                 |
| Evidencia     | `verified`, `inferred`, `review`, `conflict`, `unknown`                                                                                  | semáforo de evidencia (nunca decorativo)                |
| Líneas        | `line`, `line-strong`, `--color-grid`, `--color-grid-major`                                                                              | hairlines y retícula                                    |
| Visualización | `--viz-parcel`, `--viz-parcel-line`, `--viz-parcel-active`, `--viz-street`, `--viz-river`, `--viz-scan`, `--viz-axis`, `--viz-fill-soft` | CityCanvas, capas, volúmenes, cotas                     |
| Espacio       | `--space-1…7` (módulo de 8 px), `--gutter`                                                                                               | retícula espacial                                       |
| Radio         | `--radius-sm/md/lg` (2 / 3 / 4 px)                                                                                                       | la arquitectura no redondea esquinas                    |
| Elevación     | `--shadow-soft`, `--shadow-drawer`                                                                                                       | solo command bar y drawers                              |
| Motion        | `--motion-fast/base/slow/scan`, `--ease-out`, `--ease-in-out`                                                                            | ver lenguaje de motion                                  |

## Tipografía

Dos familias, autohospedadas (`geist`, OFL; compatibles con la CSP `font-src 'self'`):

- `font-display` / `font-sans`: Geist Sans. `.display-xl` para cifras y titulares grandes (tracking −0.04em,
  line-height 0.92). Los titulares de estrategia van en mayúsculas con tracking ligero.
- `font-mono`: Geist Mono. `.kicker` (10.5 px, mayúsculas, tracking 0.18em) es la voz técnica: etiquetas,
  índices `01 02 03`, estados `VERIFIED · REVIEW · POSSIBLE*`, marcas de tiempo. `.num` activa cifras tabulares.

## Gramática espacial

`.blueprint` (retícula mayor 160 px + menor 32 px), `.grid-paper`, `.frame` (marcas de registro en las esquinas,
la firma de "hoja de dibujo"), `.cota` (línea de cota), `.vignette` (desvanecido de lienzos). Composición:
asimetría con orden, mucho espacio, detalles técnicos pequeños y conclusiones grandes
(`HE ENCONTRADO · 04 · FUTUROS POSIBLES`). No todo es una card: canvas, split layouts, matrices, drawers,
tablas hairline, capas explosionadas.

## Lenguaje de motion

SCAN (`anim-scan`, línea que barre) · CONNECT (`anim-connect`, trazo que se dibuja) · REVEAL (`anim-reveal`,
`anim-rise`, `.stagger`) · TRANSFORM (transiciones de `transform` en CityCanvas) · VERIFY (`anim-verify`) ·
ALERT (`anim-alert`). Todo se anula con `prefers-reduced-motion`.

## Primitivas (`src/components/ds`)

Button, Surface/SectionTitle/Kicker/Empty, Badge/EvidenceBadge/DemoBadge/FreshnessBadge/VerificationBadge,
FinancialMetric/Money/Pct, Input/Textarea/Select/Field, LinkTabs (capas numeradas en mono),
BarList/CashCurve/RadialDNA/Tornado.

## Componentes visuales (`src/components/flippia/visual`)

Presentacionales: reciben props, no llaman a APIs, no calculan.

| Componente                        | Consume                                   | Qué hace                                                             |
| --------------------------------- | ----------------------------------------- | -------------------------------------------------------------------- |
| `LIAPulse`                        | `state`                                   | LIA como presencia: punto, halo, ritmo. Sin rostro.                  |
| `CityCanvas`                      | `CityProfile.microzones`, `focus`, `zoom` | Sevilla abstracta, esquemática y determinista. CIUDAD → PARCELA.     |
| `AgentStreamVisual`               | `TaskState[]`                             | Capas del activo + Intelligence Stream con los estados reales.       |
| `FutureTree` / `FutureNode`       | `StrategyResult[]`                        | Árbol de posibilidades; tan ancho como el resultado, nunca "4" fijo. |
| `OpportunityGapVisual`            | `OpportunityGap`                          | HOY ─ POTENCIAL → FUTURO POSIBLE con palancas apiladas.              |
| `ExplodedInvestmentView`          | `InvestmentLayer[]`                       | VALOR · FINANCIACIÓN · REFORMA · ARQUITECTURA · URBANISMO · ACTIVO.  |
| `UrbanLayerVisual` / `UrbanCheck` | `UrbanLayer[]` (de `UrbanismAssessment`)  | Urban Digital Layer y ledger de comprobación.                        |
| `BuildingVisual`                  | recuentos existentes                      | Volumen conceptual (rotulado como tal).                              |
| `CapitalStackVisual`              | `CapitalStack[]`                          | Estructura de capital como sección.                                  |
| `StressGauge`                     | `StressReport`                            | Supervivencia y capital en riesgo.                                   |
| `EvidenceDrawer`                  | `Evidence[]`                              | SHOW EVIDENCE lateral; estado explícito cuando no hay evidencia.     |

Componentes de dominio (`src/components/flippia`): FlippIACommand, CommandPalette, AgentActivity,
AnalysisExperience, StrategyCard, ScenarioPanel, MaxPricePanel, MagicPanel, LiaConversation, MicrozoneMap,
DealCard, AlertList, WatchButton, ReviewForm, InvestorDnaForm, AppShell.

## Copy

Directo, sin tono chatbot, sin emojis. "Dame una dirección." · "He encontrado tres posibilidades." ·
"Necesito comprobar dos cosas." Nunca "potenciado por IA".

Limitaciones del contrato de datos que el diseño no puede resolver por sí mismo: `DESIGN_DEPENDENCIES.md`.
