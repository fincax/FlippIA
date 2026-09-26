import type { LatLng } from "@/modules/city/types";

export type CatastroQuery =
  | { kind: "cadastralRef"; cadastralRef: string; municipality?: string; province?: string }
  | {
      kind: "address";
      municipality: string;
      province: string;
      streetType?: string;
      street: string;
      number: string;
    }
  | { kind: "point"; point: LatLng };

export interface CatastroUnit {
  cadastralRef: string;
  address: string;
  useCode: string; // "V" vivienda, "C" comercial, "O" oficina, "I" industrial, "A" almacén...
  useLabel: string;
  builtAreaM2: number;
  yearBuilt?: number;
  floor?: string;
  door?: string;
}

export interface CatastroParcelInfo {
  cadastralRef: string; // 14 chars parcel, or 20 chars unit
  address: string;
  municipality: string;
  province: string;
  province_code?: string;
  coordinates?: LatLng;
  plotAreaM2?: number;
  builtAreaM2?: number;
  yearBuilt?: number;
  useCode?: string;
  useLabel?: string;
  units: CatastroUnit[];
  /** Cadastral value is protected data: only available with authenticated access or user-provided documents. */
  cadastralValue: null;
  landValue: null;
  accessLevel: "public" | "protected";
}

export const CATASTRO_USE_LABELS: Record<string, string> = {
  V: "Residencial",
  C: "Comercial",
  O: "Oficinas",
  I: "Industrial",
  A: "Almacén / Estacionamiento",
  G: "Ocio y hostelería",
  K: "Deportivo",
  R: "Religioso",
  E: "Cultural",
  P: "Edificio singular",
  T: "Espectáculos",
  Y: "Sanidad y beneficencia",
  M: "Obras de urbanización y jardinería, suelos sin edificar",
  Z: "Agrario",
};
