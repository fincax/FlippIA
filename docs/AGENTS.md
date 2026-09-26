# Agentes

FlippIA es una **organización agéntica**, no un LLM con herramientas. Los agentes son unidades de trabajo tipadas con dependencias; los cálculos los hacen motores deterministas; el modelo (si existe) redacta.

```
USER → LIA → CORE ORCHESTRATOR → DOMAIN ORCHESTRATORS → SPECIALIST AGENTS → TOOLS + DATA + ENGINES → EVIDENCE → SYNTHESIS → LIA → USER
```

## Runtime (`src/modules/agents/runtime`)

- `AgentDefinition { type, label, domain, dependsOn, when?, run, outputSchema?, critical?, timeoutMs? }`.
- `executePlan(plan, ctx, { budget, emit })`: valida el DAG (sin ciclos ni deps desconocidas), ejecuta en paralelo lo que está listo, aplica `maxAgents`, `maxTotalMs`, `maxAgentMs`, `maxRetries`; los agentes `critical` abortan el run; los omitidos por `when` no bloquean a sus dependientes; registra `AgentRun` con tool calls y evidencia generada.
- Eventos: `run.started`, `task.started|progress|completed|failed|skipped`, `run.completed|failed`. Nunca se emite razonamiento privado, solo tareas, estados, evidencia y resúmenes.

## Plan actual (23 agentes)

| Dominio              | Agentes                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Opportunity          | `opportunity.intake` (crítico)                                                                                                           |
| Data                 | `data.catastro` (crítico)                                                                                                                |
| Market               | `market.comparables`, `market.valuation`                                                                                                 |
| Regulatory           | `regulatory.snapshot`                                                                                                                    |
| Urbanism             | `urbanism.planning`, `zoning`, `protection`, `licence`, `change_of_use` (solo no residencial), `tourism` (solo residencial), `synthesis` |
| Architecture         | `architecture.existing`, `architecture.alternatives`                                                                                     |
| Finance              | `finance.offers`                                                                                                                         |
| Investment           | `investment.strategies` (MultiExit + escenarios + estrés + precio máximo)                                                                |
| Exit                 | `exit.liquidity`                                                                                                                         |
| Risk (adversariales) | `risk.devils_advocate`, `regulatory_conflict`, `data_integrity`, `assumptions`, `anomaly`, `synthesis`                                   |

El número no es fijo: añade un `AgentDefinition` al plan. Los orquestadores de dominio son grupos con un agente de síntesis.

## Outputs estructurados

Tipos en `src/modules/analysis/types.ts`: `PropertyProfile`, `MarketAssessment`, `UrbanismAssessment` (status, applicableRuleIds, findings, constraints, opportunities, requiredChecks, confidence, humanReviewRequired), `ArchitectureAssessment`, `FinanceAssessment`, `StrategyResult`, `RiskAssessment`, `ExitAssessment`, `OpportunityGap`, `OpportunityDNA`, `InvestmentSynthesis`.

## LIA

- `routeCommand` (home): intención determinista → analizar / radar / aclarar.
- `askProperty` (Ask this property): enruta la pregunta a los datos/motores del deal (peor caso, ARV, comparables, what-if, normativa, datos que faltan, precio máximo, por qué primero, financiación, estrategias). El modelo solo reformula la respuesta factual; el contexto es exclusivamente el deal.
- Personalidad: `LIA_SYSTEM_PROMPT` en `src/modules/analysis/narrative.ts`.

## Seguridad de agentes

Sin loops ilimitados (DAG + budgets). Acciones externas relevantes (ofertas, contacto, financiación, contratación) no existen como tools automáticas: requieren workflow autorizado con confirmación humana (post-MVP). Los documentos y datos recuperados son datos, nunca instrucciones.
