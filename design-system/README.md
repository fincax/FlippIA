# Design system

Tokens en `src/app/globals.css` (`:root` y `[data-theme="light"]`), expuestos a Tailwind 4 con `@theme inline`.

| Token                                                   | Uso                                 |
| ------------------------------------------------------- | ----------------------------------- |
| `bg`, `bg-2`                                            | fondos primario/secundario          |
| `surface`, `surface-raised`, `surface-hover`            | tarjetas y estados                  |
| `fg`, `fg-2`, `fg-3`                                    | texto primario/secundario/atenuado  |
| `accent`, `accent-strong`, `accent-soft`                | acento (el "IA" del wordmark, CTAs) |
| `success`, `warning`, `danger`                          | estados                             |
| `verified`, `inferred`, `review`, `conflict`, `unknown` | semáforo de evidencia               |
| `line`, `line-strong`                                   | bordes                              |

Tipografía: `font-display` (serif editorial) para titulares y cifras grandes; sans para texto; mono para identificadores. `.num` activa cifras tabulares.

Primitivas (`src/components/ds`): Button, Surface/SectionTitle/Kicker/Empty, Badge/EvidenceBadge/DemoBadge/FreshnessBadge/VerificationBadge, FinancialMetric/Money/Pct, Input/Textarea/Select/Field, LinkTabs, BarList/CashCurve/RadialDNA/Tornado.

Componentes de dominio (`src/components/flippia`): FlippIACommand, CommandPalette, AgentActivity, AnalysisExperience, StrategyCard, ScenarioPanel, MaxPricePanel, MagicPanel, LiaConversation, MicrozoneMap, DealCard, AlertList, WatchButton, ReviewForm, InvestorDnaForm, AppShell.

Motion: `anim-rise` (entrada), `anim-pulse` (agente activo), `anim-sweep` (esqueleto). Todo se anula con `prefers-reduced-motion`.
