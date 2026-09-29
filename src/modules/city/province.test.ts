import { describe, expect, it } from "vitest";
import { municipalityFromText } from "./province";

describe("municipalityFromText", () => {
  it("recognises multi-word municipalities anywhere and single-word ones only as a locality", () => {
    expect(municipalityFromText("Calle Real 12, Dos Hermanas")).toBe("Dos Hermanas");
    expect(municipalityFromText("piso en Alcalá de Guadaíra para reformar")).toBe("Alcalá de Guadaíra");
    expect(municipalityFromText("Avenida de la Constitución 3, Mairena del Aljarafe")).toBe(
      "Mairena del Aljarafe",
    );
    expect(municipalityFromText("Calle Larga 4, Utrera")).toBe("Utrera");
    expect(municipalityFromText("local en Camas")).toBe("Camas");
    expect(municipalityFromText("Calle Betis 4, Tomares (Sevilla)")).toBe("Tomares");
  });
  it("does not mistake Sevilla streets, squares or common words for municipalities", () => {
    expect(municipalityFromText("Puerta Carmona 7, Sevilla")).toBeUndefined();
    expect(municipalityFromText("Calle Carmona 5")).toBeUndefined();
    expect(municipalityFromText("piso con 3 camas en Triana")).toBeUndefined();
    expect(municipalityFromText("Calle Duque de Osuna 2")).toBeUndefined();
    expect(municipalityFromText("Calle Pureza 45, Sevilla")).toBeUndefined();
    expect(municipalityFromText("necesito pilas para el piso")).toBeUndefined();
    expect(municipalityFromText("en Utrera 12")).toBeUndefined();
  });
  it("ignores the covered city itself and accents", () => {
    expect(municipalityFromText("Calle Sierpes 1, Sevilla", "Sevilla")).toBeUndefined();
    expect(municipalityFromText("Calle Mayor 2, Ecija")).toBe("Écija");
  });
});
