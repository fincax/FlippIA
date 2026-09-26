# Fuentes de datos

Toda fuente implementa `DataSourceAdapter<TQuery, TResult>` (`src/modules/adapters/types.ts`): `sourceId`, `sourceType`, `mode`, `isAvailable()`, `query()` → `{ data, evidence[], retrievedAt, freshness, mode }`. La UI nunca habla con un proveedor; recibe datos + evidencia + `SourceStatus`.

| Fuente                | Adaptador                                                                                                                | Modos                         | Estado                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| Catastro              | `CatastroDemoAdapter` / `CatastroPublicAdapter` (OVC servicios libres: Consulta_DNPRC, Consulta_DNPLOC, Consulta_RCCOOR) | `CATASTRO_MODE=demo           | public`                                                                                             | Público implementado; solo datos no protegidos (valor catastral = `null`, `accessLevel`) |
| Urbanismo Sevilla     | `UrbanismoSevillaDemoAdapter` / `UrbanismoPublicConnector` / `UrbanismoSevillaOfficialConnector`                         | `URBANISMO_SEVILLA_MODE=demo  | public                                                                                              | official`                                                                                | Público: geoservicios abiertos de IDE Sevilla (ver sección). Oficial: convenio/API, no configurado |
| Mercado / comparables | `MarketDemoAdapter`                                                                                                      | `MARKET_SOURCE_MODE=demo      | partner`                                                                                            | Partner pendiente de feed autorizado                                                     |
| Financiación          | `FinancingDemoAdapter`                                                                                                   | `FINANCING_PROVIDER_MODE=demo | partner`                                                                                            | `FinancingProviderAdapter` para brokers/entidades                                        |
| Oportunidades (Radar) | `DemoListingsSource` (`SourceAdapter`)                                                                                   | —                             | Manual/CSV/partner/API/webhook/red propia previstos; **nunca scraping** contrario a términos de uso |
| Normativa             | `REGULATORY_REGISTRY` + tabla `regulation_versions`                                                                      | —                             | Ingesta de BOE/BOJA/BOP post-MVP                                                                    |

## Urbanismo público: geoservicios gratuitos de la Gerencia

`UrbanismoPublicConnector` (`src/modules/adapters/urbanismo-sevilla/public.ts`, `URBANISMO_SEVILLA_MODE=public`) consulta los servicios abiertos que publica la Gerencia de Urbanismo (IDE Sevilla, licencia CC0) sin credenciales ni scraping: ArcGIS REST (`MapServer`/`FeatureServer` `query`) y, para otras ciudades, WFS 2.0 con salida GeoJSON (`src/modules/adapters/geoservices`). La configuración es declarativa por ciudad (`CityProfile.urbanism.publicSources`) y cada capa tiene un rol:

| Rol                   | Qué aporta                                                  | Sevilla (IDE Sevilla, ArcGIS REST)                                                                          |
| --------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `parcel`              | Centroide de la parcela a partir de la referencia catastral | `Servicios_GIS/Pla_Sit_POI/MapServer/1` (`REF_CAT`, `FECHA_HIST IS NULL`)                                   |
| `classification`      | Clase y categoría de suelo (PGOU 2006)                      | `MapaBase/Guia_Urbana_2026/FeatureServer/35` (`clase`, `sub_cat`, `cla_cat`)                                |
| `zoning`              | Calificación / zona de ordenanza                            | `Hosted/Prueba_PGOU_para_Dashboard/FeatureServer/25` (`clase_cat`); confirmar la capa definitiva            |
| `catalogue`           | Nivel de protección del catálogo                            | Pendiente de localizar la capa publicada; hasta entonces `protectionLevel = unknown` + RequiredCheck        |
| `historicCentre`      | Sector del Conjunto Histórico                               | Pendiente; se usa la microzona del City Profile como aproximación                                           |
| `touristSaturation`   | Barrios saturados de VUT                                    | `Hosted/VUT_Barrios_saturados/FeatureServer/5` (`vut`, `distrito`)                                          |
| `developmentPlanning` | Planeamiento de desarrollo en trámite                       | `Mapa_Web_publicando_para_Web_App_Builder_en_AGOL_MIL1/MapServer/10` (`categoria`, `clase_cat`, `catalogo`) |
| `files`               | Expedientes por referencia catastral                        | No publicado en abierto                                                                                     |

Flujo: `parseIntake` → Catastro público (`Consulta_DNPLOC`/`Consulta_DNPRC` + `Consulta_CPMRC` para las coordenadas de la parcela) → conector público con `point` y `cadastralRef` → una `Evidence` `official_planning` por capa que responde (URL exacta de la consulta, atributos devueltos, `VERIFIED`, `demo: false`). Las capas que no responden bajan el estado del `PlanningInfo` a `INFERRED` y añaden una nota; si ninguna responde, el agente de planeamiento continúa en `UNKNOWN`. Las capas no configuradas se indican como tales: nunca se inventa una calificación ni un nivel de protección.

Herramientas:

- `pnpm urbanismo:discover [raíz o capa]` recorre los directorios ArcGIS REST del publicador e imprime las capas y campos que parecen de planeamiento (calificación, catálogo, protección, VUT…). Úsalo para confirmar o actualizar la tabla anterior.
- `pnpm sources:check "<dirección | referencia catastral | lat,lng>"` ejecuta Catastro público + Urbanismo público sobre un inmueble y muestra datos, notas y evidencias.
- `URBANISMO_PUBLIC_CONFIG` (JSON con la misma forma que `publicSources`) sustituye capas una a una sin tocar el código; `null` elimina una capa.

Los nombres de capa y de campo se han tomado del directorio público de servicios; los dominios de la Gerencia (`sig.urbanismosevilla.org`, `cdu.urbanismosevilla.org`) deben ser accesibles desde el servidor. Otra ciudad se añade con su `CityProfile.urbanism.publicSources` (ArcGIS o WFS) sin cambios en agentes ni UI.

## Catastro público (OVC): parsing y estado de la evidencia

`parseOvc` (`src/modules/adapters/catastro/public.ts`) lee `bico.bi[]` de `Consulta_DNPRC` / `Consulta_DNPLOC` (y `coordenadas.coord` de `Consulta_RCCOOR`). El campo `debi.luso` es una **etiqueta descriptiva** ("Residencial", "Comercial", "Oficinas", "Industrial", "Almacén-Estacionamiento", "Religioso"…), no un código: `resolveCatastroUseCode` la normaliza (sin tildes ni mayúsculas) al código canónico de una letra que usan `CATASTRO_USE_LABELS` y los especialistas (V, C, O, I, A, R, G, K, E, P, T, Y, M, Z) y acepta también códigos de una letra. `catastroUseToAssetUse` traduce el código al `AssetUse` del motor (V→residential, C→commercial, O→office, I→industrial, M/Z→land, resto→other) y se incluye en `structuredData.assetUse` de la evidencia.

La evidencia se marca `VERIFIED` solo cuando el registro trae superficie construida (`sfc` > 0) y un uso reconocido. Si falta la superficie o el uso no se puede mapear, se marca `INFERRED`, la confianza baja a 0,6 y la nota correspondiente se añade al `excerpt` y a `structuredData.notes`. El valor catastral sigue siendo `null` (dato protegido).

## Frescura y transparencia

Cada `Evidence` guarda `retrievedAt`, `sourcePublishedAt`, `effectiveDate`; los adaptadores devuelven `freshness`. La UI muestra "Fuente / Verificado" y nunca "actualizado al minuto".

## Fallbacks

Si una fuente no está disponible, el agente continúa (estado UNKNOWN o REVIEW_REQUIRED) y `sourceStatuses()` muestra "no disponible". Ningún resultado se inventa.

## Datos DEMO

Generadores deterministas (misma consulta → mismos datos) marcados `demo: true` en datos y evidencia, y con badge DEMO en la UI. Las microzonas de Sevilla (`src/modules/city/sevilla.ts`) llevan `sampleSize: 0`: son placeholders del City Brain.
