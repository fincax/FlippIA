import type { LatLng } from "@/modules/city/types";

/**
 * A queryable vector layer published by a public administration. Two protocols
 * cover practically every Spanish urbanism office: ArcGIS REST (MapServer /
 * FeatureServer `query`) and OGC WFS 2.0 with GeoJSON output (GeoServer, MapServer).
 */
export type GeoLayerSource =
  | {
      kind: "arcgis";
      /** Layer URL ending in `/MapServer/<id>` or `/FeatureServer/<id>`. */
      url: string;
      /** Extra SQL predicate applied to every query (e.g. `FECHA_HIST IS NULL`). */
      where?: string;
    }
  | {
      kind: "wfs";
      /** Service endpoint, e.g. `https://host/geoserver/wfs`. */
      url: string;
      typeName: string;
      /** Geometry property name used in spatial filters (default `geom`). */
      geometryField?: string;
      /** CQL predicate appended with AND to every query. */
      cqlFilter?: string;
    };

export interface FeatureRecord {
  attributes: Record<string, unknown>;
  /** WGS84 centroid when geometry was requested. */
  centroid?: LatLng;
}

export interface GeoQuery {
  /** Point-in-polygon lookup (WGS84). */
  point?: LatLng;
  /** Search radius in metres around `point` (a point on the street still finds the parcel). */
  distanceM?: number;
  /** Attribute filter: `{ field, value }` becomes `field = 'value'` (escaped). */
  equals?: { field: string; value: string };
  returnGeometry?: boolean;
  maxFeatures?: number;
}

export interface GeoQueryResult {
  features: FeatureRecord[];
  /** The exact request URL, kept as evidence provenance. */
  url: string;
}

export interface GeoClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}
