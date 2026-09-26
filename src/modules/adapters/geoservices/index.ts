import { queryArcGisLayer } from "./arcgis";
import type { GeoClientOptions, GeoLayerSource, GeoQuery, GeoQueryResult } from "./types";
import { queryWfsLayer } from "./wfs";

export * from "./types";
export {
  buildArcGisQueryUrl,
  describeArcGis,
  esriCentroid,
  parseArcGisFeatures,
  queryArcGisLayer,
} from "./arcgis";
export { buildWfsQueryUrl, geoJsonCentroid, parseGeoJsonFeatures, queryWfsLayer } from "./wfs";

/** Query any configured layer regardless of protocol. */
export function queryLayer(
  source: GeoLayerSource,
  q: GeoQuery,
  opts: GeoClientOptions = {},
): Promise<GeoQueryResult> {
  if (source.kind === "arcgis") return queryArcGisLayer(source.url, q, { ...opts, where: source.where });
  return queryWfsLayer(source.url, source.typeName, q, {
    ...opts,
    geometryField: source.geometryField,
    cqlFilter: source.cqlFilter,
  });
}
