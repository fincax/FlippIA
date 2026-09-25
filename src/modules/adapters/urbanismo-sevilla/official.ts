import { err, appError } from "@/modules/core/result";
import type { DataSourceAdapter } from "../types";
import type { PlanningInfo, UrbanismQuery } from "./types";

/**
 * Placeholder for the official connector (API, agreement or authorised access
 * with the Gerencia de Urbanismo / IDE Sevilla WFS). Configure through
 * URBANISMO_SEVILLA_MODE=official plus the endpoint variables documented in
 * docs/DATA_SOURCES.md. Until then it reports itself as unavailable — it never
 * fabricates data.
 */
export class UrbanismoSevillaOfficialConnector implements DataSourceAdapter<UrbanismQuery, PlanningInfo> {
  sourceId = "urbanismo-sevilla";
  sourceType = "official_planning" as const;
  sourceName = "Gerencia de Urbanismo y Medio Ambiente de Sevilla";
  sourceAuthority = "Ayuntamiento de Sevilla";
  mode = "unavailable" as const;

  constructor(private readonly endpoint = process.env.URBANISMO_SEVILLA_ENDPOINT ?? "") {}

  async isAvailable() {
    return Boolean(this.endpoint);
  }

  async query(_input: UrbanismQuery) {
    return err(appError("SOURCE_NOT_CONFIGURED", "El conector oficial de Urbanismo Sevilla no está configurado (URBANISMO_SEVILLA_ENDPOINT)."));
  }
}
