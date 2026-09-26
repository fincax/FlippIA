# Fuentes de datos

Toda fuente implementa `DataSourceAdapter<TQuery, TResult>` (`src/modules/adapters/types.ts`): `sourceId`, `sourceType`, `mode`, `isAvailable()`, `query()` → `{ data, evidence[], retrievedAt, freshness, mode }`. La UI nunca habla con un proveedor; recibe datos + evidencia + `SourceStatus`.

| Fuente                | Adaptador                                                                                                                | Modos                         | Estado                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| Catastro              | `CatastroDemoAdapter` / `CatastroPublicAdapter` (OVC servicios libres: Consulta_DNPRC, Consulta_DNPLOC, Consulta_RCCOOR) | `CATASTRO_MODE=demo           | public`                                                                                             | Público implementado; solo datos no protegidos (valor catastral = `null`, `accessLevel`)           |
| Urbanismo Sevilla     | `UrbanismoSevillaDemoAdapter` / `UrbanismoSevillaOfficialConnector`                                                      | `URBANISMO_SEVILLA_MODE=demo  | official`+`URBANISMO_SEVILLA_ENDPOINT`                                                              | Conector oficial: interfaz lista, no configurado (devuelve `SOURCE_NOT_CONFIGURED`, nunca inventa) |
| Mercado / comparables | `MarketDemoAdapter`                                                                                                      | `MARKET_SOURCE_MODE=demo      | partner`                                                                                            | Partner pendiente de feed autorizado                                                               |
| Financiación          | `FinancingDemoAdapter`                                                                                                   | `FINANCING_PROVIDER_MODE=demo | partner`                                                                                            | `FinancingProviderAdapter` para brokers/entidades                                                  |
| Oportunidades (Radar) | `DemoListingsSource` (`SourceAdapter`)                                                                                   | —                             | Manual/CSV/partner/API/webhook/red propia previstos; **nunca scraping** contrario a términos de uso |
| Normativa             | `REGULATORY_REGISTRY` + tabla `regulation_versions`                                                                      | —                             | Ingesta de BOE/BOJA/BOP post-MVP                                                                    |

## Catastro público (OVC): parsing y estado de la evidencia

`parseOvc` (`src/modules/adapters/catastro/public.ts`) lee `bico.bi[]` de `Consulta_DNPRC` / `Consulta_DNPLOC` (y `coordenadas.coord` de `Consulta_RCCOOR`). El campo `debi.luso` es una **etiqueta descriptiva** ("Residencial", "Comercial", "Oficinas", "Industrial", "Almacén-Estacionamiento", "Religioso"…), no un código: `resolveCatastroUseCode` la normaliza (sin tildes ni mayúsculas) al código canónico de una letra que usan `CATASTRO_USE_LABELS` y los especialistas (V, C, O, I, A, R, G, K, E, P, T, Y, M, Z) y acepta también códigos de una letra. `catastroUseToAssetUse` traduce el código al `AssetUse` del motor (V→residential, C→commercial, O→office, I→industrial, M/Z→land, resto→other) y se incluye en `structuredData.assetUse` de la evidencia.

La evidencia se marca `VERIFIED` solo cuando el registro trae superficie construida (`sfc` > 0) y un uso reconocido. Si falta la superficie o el uso no se puede mapear, se marca `INFERRED`, la confianza baja a 0,6 y la nota correspondiente se añade al `excerpt` y a `structuredData.notes`. El valor catastral sigue siendo `null` (dato protegido).

## Frescura y transparencia

Cada `Evidence` guarda `retrievedAt`, `sourcePublishedAt`, `effectiveDate`; los adaptadores devuelven `freshness`. La UI muestra "Fuente / Verificado" y nunca "actualizado al minuto".

## Fallbacks

Si una fuente no está disponible, el agente continúa (estado UNKNOWN o REVIEW_REQUIRED) y `sourceStatuses()` muestra "no disponible". Ningún resultado se inventa.

## Datos DEMO

Generadores deterministas (misma consulta → mismos datos) marcados `demo: true` en datos y evidencia, y con badge DEMO en la UI. Las microzonas de Sevilla (`src/modules/city/sevilla.ts`) llevan `sampleSize: 0`: son placeholders del City Brain.
