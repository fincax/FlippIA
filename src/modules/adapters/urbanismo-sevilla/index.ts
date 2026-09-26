import type { DataSourceAdapter } from "../types";
import { UrbanismoSevillaDemoAdapter } from "./demo";
import { UrbanismoSevillaOfficialConnector } from "./official";
import type { PlanningInfo, UrbanismQuery } from "./types";

export * from "./types";
export { UrbanismoSevillaDemoAdapter, UrbanismoSevillaOfficialConnector };

export type UrbanismAdapter = DataSourceAdapter<UrbanismQuery, PlanningInfo>;

export function createUrbanismAdapter(mode = process.env.URBANISMO_SEVILLA_MODE ?? "demo"): UrbanismAdapter {
  if (mode === "official") return new UrbanismoSevillaOfficialConnector();
  if (mode === "demo" || mode === "public") return new UrbanismoSevillaDemoAdapter();
  throw new Error(`URBANISMO_SEVILLA_MODE "${mode}" is not supported (demo | public | official)`);
}
