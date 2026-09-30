# Regulatory Intelligence Engine

## Stack

```
EUROPEAN → SPAIN → ANDALUSIA → PROVINCE → SEVILLE → PARCEL/BUILDING
```

`CityProfile.regulatoryChain` define la cadena; cada `Regulation` tiene jurisdicción, materias (`RegulatoryTopic`), usos y versiones.

## Modelo

`RegulationVersion { version, title, publicationDate, sourceDate, effectiveFrom, effectiveUntil, status (in_force|superseded|repealed|pending|unverified), sourceUrl, sourceName, supersedes, supersededBy, ingestedAt, verifiedAt, verificationStatus, summary, keyPoints }`.

## Registro inicial (26 normas)

EPBD 2024/1275, Reglamento (UE) 2024/1028 (alquileres de corta duración), TRLSRU, CTE, LOE, LAU, Ley 12/2023 de Vivienda, ITP-AJD, IRPF, IVA, TRLHL (IBI/ICIO/IIVTNU), CEE RD 390/2021, LPH, LISTA, RGLISTA, Ley 5/2021 tributos cedidos Andalucía, VFT Andalucía (D. 28/2016 mod. 31/2024), LPHA, accesibilidad Andalucía, PGOU Sevilla TR 2006, PEPCH sectores, modificación PEPCH entornos BIC (2026, pendiente), OROA (2018 y modificación 2025), ordenanza ICIO Sevilla (2025 y 2026), MP 44 del PGOU (VUT como hospedaje) y límite del 10 % de VUT por barrio. Cada entrada lleva `verificationStatus` honesto (INFERRED / REVIEW_REQUIRED): identificada, no verificada documentalmente.

## Normas municipales de Sevilla: citas (revisión 2026-09-28)

Cada versión municipal cita boletín, número y fecha, y enlaza el documento oficial de la Gerencia o de la Agencia Tributaria. Siguen `INFERRED` porque el boletín citado no se ha abierto y cotejado desde el repositorio; abrir el enlace, cotejar fecha y número y poner `verificationStatus: "VERIFIED"` + `verifiedAt` es el único paso que falta.

| Norma                           | Instrumento                                                                                                                | Cita                                                                                                 | Vigencia registrada                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| PGOU TR 2006                    | Revisión aprobada por Resolución de 19/07/2006 (BOJA 174, 07/09/2006); Texto Refundido aprobado por el Pleno el 15/03/2007 | BOP Sevilla 290, 16/12/2008 (Normas Urbanísticas íntegras)                                           | 2008-12-16                                   |
| PEPCH sectores                  | Un plan especial por sector, cada uno con su aprobación y su BOP                                                           | Página de planes especiales de la Gerencia                                                           | 2000-01-01 (mínimo común; `REVIEW_REQUIRED`) |
| Modificación PEPCH entornos BIC | Informe Comisión Provincial de Patrimonio 04/02/2026; aprobación definitiva plenaria 16/04/2026                            | Orden de 15/05/2026, BOJA 99, 26/05/2026 (delegación de competencias)                                | `pending` hasta comprobar el BOP             |
| OROA                            | Texto 2018 + modificación 2025 (LISTA, Decreto 550/2022)                                                                   | BOP 9, 12/01/2018; BOP 80, 29/04/2025 (Pleno 24/04/2025)                                             | 2018-01-12 → 2025-04-29                      |
| Ordenanza fiscal ICIO           | Ejercicio 2026: tipo 4 % (art. 7); bonificaciones 80 % rehabilitación protegido A/B/C, 75 % autoconsumo solar              | Texto en la Agencia Tributaria; aprobación definitiva de las ordenanzas 2026 en el BOP de 15/12/2025 | 2026-01-01                                   |
| MP 44 del PGOU (VUT)            | Aprobación definitiva 28/04/2022; TSJA 13/11/2023 (rec. 513/2022) la confirma                                              | Ficha de la MP 44 en la Gerencia; normativa en BOP                                                   | 2022-06-07                                   |
| Límite 10 % VUT por barrio      | Acuerdo plenario 17/10/2024 (Decreto 31/2024)                                                                              | BOP Sevilla 210, 28/10/2024                                                                          | 2024-10-29                                   |

La fecha de vigencia de la OROA es la de publicación de cada texto; la entrada en vigor exacta depende de su disposición final y se anota en la versión. `pnpm db:seed` actualiza las filas de `regulation_versions` ya existentes (`onConflictDoUpdate`), así que corregir una cita en el registro y volver a sembrar basta.

## Municipios cubiertos

| Municipio          | INE   | Perfil                                   | Catastro OVC | Planeamiento                                                                                                  | Normas municipales en el registro                                                                         | Fiscalidad municipal                                                                        |
| ------------------ | ----- | ---------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Sevilla            | 41091 | `src/modules/city/sevilla.ts`            | Sí           | IDE Sevilla (capas públicas)                                                                                  | PGOU, PEPCH, OROA, ICIO, MP 44, límite VUT                                                                | `tax.es.and.sevilla.2025` (ICIO 4 % por ordenanza citada)                                   |
| Dos Hermanas       | 41038 | `src/modules/city/dos-hermanas.ts`       | Sí           | **No consultado**: sin geoservicio (búsqueda 2026-09-30, ver abajo); `UNKNOWN` con comprobaciones bloqueantes | PGOU 2002 + adaptación LOUA 2008 (`REVIEW_REQUIRED`); sin ordenanzas                                      | `tax.es.and.2025` (`REVIEW_REQUIRED`: ICIO al máximo legal del 4 % como hipótesis prudente) |
| Alcalá de Guadaíra | 41004 | `src/modules/city/alcala-de-guadaira.ts` | Sí           | **No consultado**: sin geoservicio (búsqueda 2026-09-30, ver abajo); `UNKNOWN` con comprobaciones bloqueantes | PGOU 1994 + adaptación LOUA 2009 + TR 2023 (`REVIEW_REQUIRED`); nuevo PGOU en tramitación; sin ordenanzas | `tax.es.and.2025` (`REVIEW_REQUIRED`)                                                       |

Cualquier otro municipio de la provincia se rechaza (`NotCoveredError`).

### Geoservicios de planeamiento de Dos Hermanas y Alcalá de Guadaíra (búsqueda del 2026-09-30)

Resultado: **ninguno de los dos ayuntamientos publica capas de planeamiento consultables** (ArcGIS REST, WFS o WMS con calificación). Lo que existe:

- **Dos Hermanas**: el PGOU (aprobación definitiva 26/07/2002, BOP núm. 182 de 07/08/2002; adaptación parcial a la LOUA por el Pleno de 07/11/2008) y sus innovaciones se publican como PDF en la [página del PGOU de la Concejalía de Urbanismo](https://www.doshermanas.es/concejalias/urbanismo/Instrumentos-Ordenacion-Urbanistica/pgou/). El Ayuntamiento usa ArcGIS Online para otros mapas (zonas verdes), pero no hay servicio de planeamiento publicado.
- **Alcalá de Guadaíra**: [texto refundido del PGOU 94 actualizado (sept. 2023)](https://www.alcaladeguadaira.es/contenidos/downloads/ordenanzas/32-7/texto-refundido-pgou-94-vigente-actualizado-sept2023.pdf) y [planeamiento vigente](https://www.alcaladeguadaira.es/servicios-municipales/urbanismo-y-planificacion-estrategica/ordenanzas-y-normativas/16/1-planeamiento-general-vigente-pgou-94-y-modificaciones) en PDF; aprobación definitiva del PGOU 94 por [Resolución de 21/03/1994 (BOJA 43/1994)](https://www.juntadeandalucia.es/boja/1994/43/9); nuevo PGOU con aprobación inicial en tramitación (`plangeneral.alcaladeguadaira.es`). Sin geoservicio.
- **Junta de Andalucía**: [SITUA](https://ws132.juntadeandalucia.es/situadifusion/pages/search.jsf) difunde los instrumentos digitalizados (documentos, no capas); IDEAndalucía publica WFS de referencia (DERA: usos del suelo, sistema urbano) y cartografía urbana WMS, sin clasificación ni calificación por parcela.
- **Diputación de Sevilla (IDEASevilla)**: cartografía base y ortofotos; su Mirador excluye expresamente a Sevilla, Dos Hermanas y Alcalá de Guadaíra.

Consecuencia: para estos dos municipios la calificación de una parcela sigue siendo una comprobación del técnico sobre los planos del PGOU, y así lo dice el análisis. Cuando un ayuntamiento publique un servicio, se declara en `urbanism.publicSources` (`pnpm urbanismo:discover <raíz>`) sin tocar código. Quedan por añadir al registro sus ordenanzas de obras y fiscales con boletín y enlace oficial, y su `TaxRuleSet` municipal. Las microzonas de ambos son DEMO (`sampleSize: 0`); los comparables reales llegan por coordenadas (Idealista, testigos propios).

## Reglas de rigor (no negociables)

1. **Ámbito jurisdiccional**: cada municipio cubierto tiene su `CityProfile` y su cadena jurisdiccional; la ciudad de un análisis se resuelve por el municipio nombrado (`cityForIntake`). Una dirección de un municipio no cubierto (`src/modules/city/province.ts`, detección determinista en el intake y contraste con el municipio que devuelve el Catastro) se **rechaza** con `NotCoveredError` ("X tiene su propio planeamiento y sus propias ordenanzas, que no están en el registro") en lugar de analizarse con datos de Sevilla. Añadir un municipio = añadir su `CityProfile`, su cadena jurisdiccional y sus normas al registro.
2. **Microzona trazable**: `PropertyProfile.microzoneMatch` (`inside | nearest | text | default`) dice cómo se asignó la microzona; fuera de las microzonas definidas el resumen lo declara ("asignada por proximidad", "referencia orientativa").
3. **Nada en tramitación se aplica**: una versión `pending` nunca es "vigente" (`versionInForce` la excluye); el snapshot la lista en `pending` y la UI la muestra como "en tramitación (no aplicado)".
4. **Ninguna cita sin fuente oficial**: el test de integridad exige `sourceUrl` en dominios oficiales (eur-lex, boe.es, juntadeandalucia.es, urbanismosevilla.org, sevilla.org, dipusevilla.es), `verifiedAt` para pasar a `VERIFIED`, `effectiveFrom` no futura para `in_force` y, en normas municipales, cita de BOP/BOJA/Gerencia/Agencia Tributaria. Una fecha de entrada en vigor no cotejada baja la entrada a `REVIEW_REQUIRED` (Ley 5/2021, Decreto 550/2022) aunque su contenido aplicable sea seguro.
5. **Los agentes no afirman lo que la fuente no dio**: altura publicada implausible → `maxFloors: null` y nota, nunca la altura de referencia de la ordenanza; protección `unknown` → comprobación bloqueante, no "sin protección"; saturación turística solo `saturated | not_saturated` cuando la capa municipal responde, `unknown` en caso contrario (la estrategia turística no se ofrece en barrio saturado); declaración responsable solo para edificios no catalogados; compatibilidad de uso en planta baja `unknown` se presenta como no confirmada, no como oportunidad.
6. **El modelo no interpreta normas**: `LIA_SYSTEM_PROMPT` le prohíbe afirmar qué exige o permite una norma; solo cita las listadas con su estado y remite a las comprobaciones. Además `introducesNoNewNumbers` rechaza cualquier cifra (incluidos números de ley o artículo) que no esté en los hechos.

## Motor

- `applicableRegulations({ jurisdictionChain, topics, assetUse, analysisDate })` → normas vigentes en la fecha, ordenadas de lo más específico a lo más general; `pendingRegulations` → instrumentos en tramitación, solo informativos.
- `buildRegulatorySnapshot` → `RegulatorySnapshot` con versiones, fingerprint (sha256 de versionIds) y lagunas (`gaps`), incluidas las **lagunas municipales**: una materia municipal (`MUNICIPAL_TOPICS`: planeamiento, calificación, parámetros, licencia, ICIO, IBI, turismo) sin instrumento del propio municipio en el registro es una laguna aunque una ley autonómica la cubra. Se persiste por análisis (`regulatory_snapshots`) para reconstruir meses después por qué se concluyó algo.
- `regulatoryPreamble` → "Conforme a la normativa identificada como vigente a <fecha>…" (nunca "la normativa dice").

## Watcher

`assessRegulatoryChange(change, analyses)` clasifica cada análisis activo en unaffected / review / recalculate (materias que consumen los motores: fiscalidad, parámetros) y produce el titular: "Cambio regulatorio detectado. N análisis revisados. X no parecen afectados. Y requieren revisión. Z estrategias necesitan ser recalculadas."

## Pendiente (post-MVP)

Ingesta de documentos (BOE/BOJA/BOP APIs), extracción de artículos, embeddings (pgvector), búsqueda semántica y literal, detección automática de modificaciones/derogaciones, `verifiedAt` por revisión humana.
