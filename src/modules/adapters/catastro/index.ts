import { CatastroDemoAdapter } from "./demo";
import { CatastroPublicAdapter } from "./public";
import type { CatastroParcelInfo, CatastroQuery } from "./types";
import type { DataSourceAdapter } from "../types";

export * from "./types";
export { CatastroDemoAdapter, CatastroPublicAdapter };

export type CatastroAdapter = DataSourceAdapter<CatastroQuery, CatastroParcelInfo>;

export function createCatastroAdapter(
  mode = process.env.CATASTRO_MODE ?? "demo",
  pointResolver?: (point: { lat: number; lng: number }) => Promise<string | undefined>,
): CatastroAdapter {
  if (mode === "public") return new CatastroPublicAdapter(fetch, pointResolver);
  if (mode === "demo") return new CatastroDemoAdapter();
  throw new Error(`CATASTRO_MODE "${mode}" is not supported (demo | public)`);
}
