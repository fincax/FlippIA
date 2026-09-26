# Regulatory Intelligence Engine

## Stack

```
EUROPEAN → SPAIN → ANDALUSIA → PROVINCE → SEVILLE → PARCEL/BUILDING
```

`CityProfile.regulatoryChain` define la cadena; cada `Regulation` tiene jurisdicción, materias (`RegulatoryTopic`), usos y versiones.

## Modelo

`RegulationVersion { version, title, publicationDate, sourceDate, effectiveFrom, effectiveUntil, status (in_force|superseded|repealed|pending|unverified), sourceUrl, sourceName, supersedes, supersededBy, ingestedAt, verifiedAt, verificationStatus, summary, keyPoints }`.

## Registro inicial (24 normas)

EPBD 2024/1275, Reglamento (UE) 2024/1028 (alquileres de corta duración), TRLSRU, CTE, LOE, LAU, Ley 12/2023 de Vivienda, ITP-AJD, IRPF, IVA, TRLHL (IBI/ICIO/IIVTNU), CEE RD 390/2021, LPH, LISTA, RGLISTA, Ley 5/2021 tributos cedidos Andalucía, VFT Andalucía (D. 28/2016 mod. 31/2024), LPHA, accesibilidad Andalucía, PGOU Sevilla TR 2006, PEPCH sectores, OROA, ordenanza ICIO Sevilla, regulación municipal VFT (unverified). Cada entrada lleva `verificationStatus` honesto (INFERRED / REVIEW_REQUIRED): identificada, no verificada documentalmente.

## Motor

- `applicableRegulations({ jurisdictionChain, topics, assetUse, analysisDate })` → normas vigentes en la fecha, ordenadas de lo más específico a lo más general.
- `buildRegulatorySnapshot` → `RegulatorySnapshot` con versiones, fingerprint (sha256 de versionIds) y lagunas (`gaps`). Se persiste por análisis (`regulatory_snapshots`) para reconstruir meses después por qué se concluyó algo.
- `regulatoryPreamble` → "Conforme a la normativa identificada como vigente a <fecha>…" (nunca "la normativa dice").

## Watcher

`assessRegulatoryChange(change, analyses)` clasifica cada análisis activo en unaffected / review / recalculate (materias que consumen los motores: fiscalidad, parámetros) y produce el titular: "Cambio regulatorio detectado. N análisis revisados. X no parecen afectados. Y requieren revisión. Z estrategias necesitan ser recalculadas."

## Pendiente (post-MVP)

Ingesta de documentos (BOE/BOJA/BOP APIs), extracción de artículos, embeddings (pgvector), búsqueda semántica y literal, detección automática de modificaciones/derogaciones, `verifiedAt` por revisión humana.
