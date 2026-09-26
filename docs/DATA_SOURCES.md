# Fuentes de datos

Toda fuente implementa `DataSourceAdapter<TQuery, TResult>` (`src/modules/adapters/types.ts`): `sourceId`, `sourceType`, `mode`, `isAvailable()`, `query()` → `{ data, evidence[], retrievedAt, freshness, mode }`. La UI nunca habla con un proveedor; recibe datos + evidencia + `SourceStatus`.

| Fuente | Adaptador | Modos | Estado |
| --- | --- | --- | --- |
| Catastro | `CatastroDemoAdapter` / `CatastroPublicAdapter` (OVC servicios libres: Consulta_DNPRC, Consulta_DNPLOC, Consulta_RCCOOR) | `CATASTRO_MODE=demo|public` | Público implementado; solo datos no protegidos (valor catastral = `null`, `accessLevel`) |
| Urbanismo Sevilla | `UrbanismoSevillaDemoAdapter` / `UrbanismoSevillaOfficialConnector` | `URBANISMO_SEVILLA_MODE=demo|official` + `URBANISMO_SEVILLA_ENDPOINT` | Conector oficial: interfaz lista, no configurado (devuelve `SOURCE_NOT_CONFIGURED`, nunca inventa) |
| Mercado / comparables | `MarketDemoAdapter` | `MARKET_SOURCE_MODE=demo|partner` | Partner pendiente de feed autorizado |
| Financiación | `FinancingDemoAdapter` | `FINANCING_PROVIDER_MODE=demo|partner` | `FinancingProviderAdapter` para brokers/entidades |
| Oportunidades (Radar) | `DemoListingsSource` (`SourceAdapter`) | — | Manual/CSV/partner/API/webhook/red propia previstos; **nunca scraping** contrario a términos de uso |
| Normativa | `REGULATORY_REGISTRY` + tabla `regulation_versions` | — | Ingesta de BOE/BOJA/BOP post-MVP |

## Frescura y transparencia
Cada `Evidence` guarda `retrievedAt`, `sourcePublishedAt`, `effectiveDate`; los adaptadores devuelven `freshness`. La UI muestra "Fuente / Verificado" y nunca "actualizado al minuto".

## Fallbacks
Si una fuente no está disponible, el agente continúa (estado UNKNOWN o REVIEW_REQUIRED) y `sourceStatuses()` muestra "no disponible". Ningún resultado se inventa.

## Datos DEMO
Generadores deterministas (misma consulta → mismos datos) marcados `demo: true` en datos y evidencia, y con badge DEMO en la UI. Las microzonas de Sevilla (`src/modules/city/sevilla.ts`) llevan `sampleSize: 0`: son placeholders del City Brain.
