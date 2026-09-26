import type { CostLibraryItem } from "./types";

/**
 * DEMO cost library for Sevilla. Every figure is labelled as demo data. Real
 * projects feed the Cost Intelligence layer with contracted prices, which
 * never mix with these estimates (different `source`).
 */
const UPDATED = "2026-01-10";
const LIB = "demo.sevilla.2026";

function item(code: string, chapter: CostLibraryItem["chapter"], label: string, unit: CostLibraryItem["unit"], unitCost: number): CostLibraryItem {
  return { code, chapter, label, unit, unitCost, source: LIB, confidence: 0.55, status: "INFERRED", updatedAt: UPDATED };
}

export const DEMO_COST_LIBRARY_SEVILLA: CostLibraryItem[] = [
  item("DEM.01", "demolition", "Demolición interior y retirada de escombros", "m2", 32),
  item("ALB.01", "masonry", "Tabiquería y ayudas de albañilería", "m2", 48),
  item("FON.01", "plumbing", "Instalación de fontanería y saneamiento completa", "m2", 38),
  item("ELE.01", "electrical", "Instalación eléctrica completa con cuadro", "m2", 55),
  item("CLI.01", "hvac", "Climatización por conductos o splits", "m2", 42),
  item("CAR.01", "carpentry", "Carpintería interior (puertas y armarios)", "ud", 520),
  item("CAR.02", "carpentry", "Carpintería exterior PVC/aluminio con RPT", "ud", 720),
  item("SOL.01", "flooring", "Solado porcelánico o laminado incluido rodapié", "m2", 52),
  item("ACA.01", "finishes", "Enlucido, pintura y acabados", "m2", 30),
  item("COC.01", "kitchen", "Cocina completa (mobiliario, encimera, electrodomésticos básicos)", "pa", 6_900),
  item("BAN.01", "bathroom", "Baño completo (aparatos, alicatado, grifería)", "ud", 4_800),
  item("ENE.01", "energy", "Mejora envolvente y ventanas (eficiencia energética)", "m2", 65),
  item("ACC.01", "accessibility", "Adaptación accesibilidad (rampa, puertas, baño adaptado)", "pa", 6_500),
  item("FAC.01", "facade", "Rehabilitación de fachada (por m² de fachada)", "m2", 145),
  item("CUB.01", "roof", "Reparación / impermeabilización de cubierta", "m2", 95),
  item("PCI.01", "fire_safety", "Protección contra incendios en local (extintores, señalización, sectorización básica)", "pa", 3_200),
  item("LIM.01", "cleanup", "Limpieza final de obra", "pa", 650),
];

export function findLibraryItem(code: string, library = DEMO_COST_LIBRARY_SEVILLA): CostLibraryItem | undefined {
  return library.find((i) => i.code === code);
}
