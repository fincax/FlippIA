# DESIGN_DEPENDENCIES

Limitaciones encontradas durante el rediseño visual de FlippIA. Ninguna se ha resuelto tocando código
funcional: cada entrada documenta qué pide el diseño, qué falta en el contrato de datos actual y qué
cambio funcional lo habilitaría. Ejecutar esos cambios es una decisión de producto, fuera de este encargo.

Formato: DESIGN REQUIREMENT · CURRENT LIMITATION · FUNCTIONAL CHANGE THAT WOULD BE REQUIRED · FILES POTENTIALLY AFFECTED.

---

## 1. Parcelario real en `CityCanvas`

- **DESIGN REQUIREMENT.** La ciudad de la Home y del Scan debería dibujar el parcelario real de Sevilla
  (footprints, manzanas, calles) y, al enfocar, la parcela real del activo.
- **CURRENT LIMITATION.** El frontend no dispone de geometrías GIS. `CityCanvas` genera un parcelario
  esquemático y determinista (seeded) alrededor de los centroides de `CityProfile.microzones`. Está
  marcado con `data-visual="schematic"` y el copy lo declara "representación esquemática".
- **FUNCTIONAL CHANGE THAT WOULD BE REQUIRED.** Un endpoint (o fichero estático) con la capa de parcelario
  (GeoJSON simplificado) y la geometría de la parcela resuelta por el adaptador de Catastro / IDE Sevilla
  expuesta en `PropertyProfile` (p. ej. `parcelGeometry`).
- **FILES POTENTIALLY AFFECTED.** `src/modules/adapters/catastro/*`, `src/modules/adapters/geoservices/*`,
  `src/modules/analysis/types.ts` (`PropertyProfile`), nueva ruta en `src/app/api/`,
  `src/components/flippia/visual/city-canvas.tsx` (solo sustituir `parcelField()`).

## 2. Foco del Scan sobre la zona real del activo — RESUELTO (2026-09-27)

- **DESIGN REQUIREMENT.** Durante el análisis, la ciudad debe cerrarse sobre la parcela que el sistema está
  resolviendo (CIUDAD → BARRIO → PARCELA → ACTIVO).
- **CURRENT LIMITATION.** El evento SSE `meta` de `/api/analyze` solo transporta `dealId`. La experiencia
  apunta el lienzo con `microzoneFromText(SEVILLA, text)` (función pura ya existente) y, si no hay
  coincidencia, al centroide de la ciudad sin marcador. El avance CIUDAD → BARRIO → PARCELA es una lectura
  visual del progreso real de tareas, no de la geocodificación.
- **RESOLUCIÓN.** `/api/analyze` emite el evento SSE `located` (`AssetLocation`: microzona, coordenadas,
  referencia catastral) cuando completa `data.catastro`, extraído con `assetLocation()` del partial que nunca
  sale del servidor. `AnalysisExperience` apunta el lienzo con él y usa el alias solo hasta que llega.
- **FILES POTENTIALLY AFFECTED.** `src/app/api/analyze/route.ts`, `src/modules/analysis/run-analysis.ts`,
  `src/modules/agents/runtime/types.ts` (`AnalysisEvent`), `src/components/flippia/analysis-experience.tsx`.

## 3. Marcas de tiempo en el Intelligence Stream — RESUELTO (2026-09-27)

- **DESIGN REQUIREMENT.** Cada línea del stream (`00:04 Urbanismo revisando`) debería llevar el instante real
  del orquestador.
- **CURRENT LIMITATION.** `TaskState` (estado de UI) no conserva el campo `at` de `AnalysisEvent`.
  `AgentStreamVisual` estampa cada transición con un reloj de cliente (segundos desde que se abrió la
  pantalla), y así lo etiqueta: "tiempo desde el inicio".
- **RESOLUCIÓN.** `TaskState.at` conserva el `at` de cada evento y `run.started.at` es el origen; el stream
  muestra "tiempo del orquestador" y solo cae al reloj de cliente si falta el origen.
- **FILES POTENTIALLY AFFECTED.** `src/components/flippia/analysis-experience.tsx` (`applyEvent`),
  `src/components/flippia/agent-activity.tsx` (`TaskState`).

## 4. Evidencia enlazada a cada conclusión — RESUELTO en parte (2026-09-27)

- **DESIGN REQUIREMENT.** "SHOW EVIDENCE" debería abrir solo las evidencias que sostienen esa conclusión
  concreta (tesis, capa urbanística, hallazgo).
- **CURRENT LIMITATION.** `AnalysisResult.evidence` es una lista plana; las conclusiones (`synthesis`,
  `UrbanismFinding`, `OpportunityGap`) no llevan `evidenceIds` (solo `AdversarialFinding` y `Property` los
  tienen). El `EvidenceDrawer` recibe la lista completa (tesis) o un filtro por `sourceType`
  (planeamiento) y muestra el estado "Evidence not available in current data contract" cuando queda vacío.
- **RESOLUCIÓN.** `UrbanismFinding.evidenceIds` (la evidencia de planeamiento del hallazgo) e
  `InvestmentSynthesis.evidenceIds` (`thesisEvidenceIds`: activo, mercado y planeamiento). Cada hallazgo abre su
  propia evidencia; la tesis abre la suya. Los análisis persistidos antes no llevan ids: la UI cae a la lista
  completa o al filtro por tipo de fuente. Pendiente: `OpportunityGap`.
- **FILES POTENTIALLY AFFECTED.** `src/modules/analysis/types.ts`, `src/modules/agents/specialists/*`,
  `src/modules/analysis/synthesis.ts`.

## 5. Geometría del edificio (axonometría)

- **DESIGN REQUIREMENT.** Estado actual → transformación → futuro como axonometría del edificio real
  (plantas, huecos, patio, distribución).
- **CURRENT LIMITATION.** No existe geometría ni plano. `BuildingVisual` dibuja un volumen conceptual a
  partir de recuentos existentes (plantas máximas de la ordenanza, unidades del programa) y lo rotula
  "representación conceptual".
- **FUNCTIONAL CHANGE THAT WOULD BE REQUIRED.** Plano o modelo (p. ej. de la visita técnica o del Catastro:
  número de plantas del edificio, superficie de parcela) en `PropertyProfile` / `ArchitectureAssessment`.
- **FILES POTENTIALLY AFFECTED.** `src/modules/adapters/catastro/*`, `src/modules/agents/specialists/architecture.ts`,
  `src/modules/analysis/types.ts`.

## 6. Historial del Digital Twin (`€64K → €73K`)

- **DESIGN REQUIREMENT.** Mostrar el antes/después de cada cambio de escenario aplicado a la base.
- **CURRENT LIMITATION.** `ScenarioSet` guarda `version` y `updatedAt`, pero no las versiones previas ni sus
  métricas. No se ha creado ningún historial en frontend.
- **FUNCTIONAL CHANGE THAT WOULD BE REQUIRED.** Persistir versiones de `ScenarioSet` (o un log de cambios con
  métricas) en `src/server/services/scenarios.ts`.
- **FILES POTENTIALLY AFFECTED.** `src/server/services/scenarios.ts`, `src/db/schema/deals.ts` (migración),
  `src/components/flippia/scenario-panel.tsx`.

## 7. Etiquetas humanas de capítulos de obra — RESUELTO (2026-09-27)

- **DESIGN REQUIREMENT.** El Architecture Lab muestra capítulos ("finishes", "carpentry") en castellano.
- **CURRENT LIMITATION.** `RenovationEstimate.byChapter[].chapter` es una clave interna sin etiqueta. La UI
  la muestra tal cual, como ya hacía.
- **RESOLUCIÓN.** `labelChapter` en `src/lib/labels.ts`, usado por el Architecture Lab.
- **FILES POTENTIALLY AFFECTED.** `src/lib/labels.ts`, `src/app/(app)/app/deals/[id]/architecture/page.tsx`.

## 8. Fuentes tipográficas

- **DESIGN REQUIREMENT.** Grotesca contemporánea + monoespaciada refinada.
- **CURRENT LIMITATION / DECISIÓN.** La CSP (`font-src 'self' data:`) impide fuentes externas. Se ha añadido
  la dependencia visual `geist` (Geist Sans + Geist Mono, OFL), autohospedada vía `next/font/local`, sin
  red en build. La identidad anterior era provisional (así lo declaraba `globals.css`). Si existe una
  identidad corporativa aprobada, sustituir las dos familias solo requiere cambiar `src/app/layout.tsx` y
  los tokens `--font-*`.
