import { describe, expect, it } from "vitest";
import { parseIntake } from "@/modules/property/intake";
import { cityForIntake } from "./for-intake";
import {
  cityByName,
  defaultCity,
  fallbackMicrozone,
  findMicrozone,
  listCities,
  nearestMicrozone,
} from "./registry";

describe("city registry — covered municipalities", () => {
  it("covers Sevilla, Dos Hermanas and Alcalá de Guadaíra with their own jurisdiction chain and cadastre names", () => {
    expect(listCities().map((c) => c.id)).toEqual(["sevilla", "dos-hermanas", "alcala-de-guadaira"]);
    const dh = cityByName("dos hermanas")!;
    expect(dh.municipalityCode).toBe("41038");
    expect(dh.regulatoryChain.at(-1)).toMatchObject({
      level: "municipality",
      code: "41038",
      label: "Dos Hermanas",
    });
    expect(dh.cadastre).toEqual({ province: "SEVILLA", municipality: "DOS HERMANAS" });
    expect(dh.urbanism.publicSources).toBeUndefined();
    expect(dh.urbanism.planningInstrument).toContain("no consultada");
    expect(dh.urbanism.planningRegulationId).toBe("reg.es.doshermanas.pgou-2002");
    const ag = cityByName("Alcala de Guadaira")!;
    expect(ag.municipalityCode).toBe("41004");
    expect(ag.cadastre?.municipality).toBe("ALCALA DE GUADAIRA");
    expect(ag.microzones.every((m) => m.demoMarket.sampleSize === 0 && !m.historicCentre)).toBe(true);
    expect(cityByName("Utrera")).toBeUndefined();
  });
  it("finds microzones across cities and only assigns a zone to points reasonably inside one", () => {
    expect(findMicrozone("dh-montequinto")?.city.id).toBe("dos-hermanas");
    expect(findMicrozone("sev-triana")?.city.id).toBe("sevilla");
    expect(findMicrozone("nope")).toBeUndefined();
    expect(nearestMicrozone({ lat: 37.3335, lng: -5.9265 })?.zone.id).toBe("dh-montequinto");
    expect(nearestMicrozone({ lat: 37.3382, lng: -5.8395 })?.zone.id).toBe("ag-centro");
    expect(nearestMicrozone({ lat: 40.4168, lng: -3.7038 })).toBeUndefined();
    expect(fallbackMicrozone(defaultCity()).id).toBe("sev-centro");
    expect(fallbackMicrozone(cityByName("Dos Hermanas")!).id).toBe("dh-centro");
  });
  it("resolves the city of an intake from the municipality it names", () => {
    expect(cityForIntake(parseIntake("Analiza Calle Real 12, Dos Hermanas por 180.000 €")).id).toBe(
      "dos-hermanas",
    );
    expect(cityForIntake(parseIntake("Analiza piso en Alcalá de Guadaíra, 90 m2 por 150.000 €")).id).toBe(
      "alcala-de-guadaira",
    );
    expect(cityForIntake(parseIntake("Analiza Calle Pureza 45, Triana por 285.000 €")).id).toBe("sevilla");
    // Not covered: the default city is returned and the intake agent refuses it.
    expect(cityForIntake(parseIntake("Analiza Calle Larga 4, Utrera por 150.000 €")).id).toBe("sevilla");
  });
});
