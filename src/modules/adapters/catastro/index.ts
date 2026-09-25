import { CatastroDemoAdapter } from "./demo";
import { CatastroPublicAdapter } from "./public";
import type { CatastroParcelInfo, CatastroQuery } from "./types";
import type { DataSourceAdapter } from "../types";

export * from "./types";
export { CatastroDemoAdapter, CatastroPublicAdapter };

export type CatastroAdapter = DataSourceAdapter<CatastroQuery, CatastroParcelInfo>;

export function createCatastroAdapter(mode = process.env.CATASTRO_MODE ?? "demo"): CatastroAdapter {
  if (mode === "public") return new CatastroPublicAdapter();
  return new CatastroDemoAdapter();
}
