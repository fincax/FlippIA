import { describe, expect, it } from "vitest";
import { parseListingsCsv } from "./csv";

describe("parseListingsCsv", () => {
  it("reads Spanish headers, separators and aliases", () => {
    const r = parseListingsCsv(
      [
        "titulo;direccion;precio;superficie;uso;tipologia;estado;habitaciones;ascensor;fecha;referencia",
        "Piso luminoso;Calle Pureza 45, Triana;285.000 €;95;residencial;piso;para reformar;3;sí;2026-01-10;REF-1",
        ";Calle Betis 12, Triana;150.000;60;local;;reformado;;no;;",
      ].join("\n"),
    );
    expect(r.errors).toEqual([]);
    expect(r.listings).toHaveLength(2);
    expect(r.listings[0]).toMatchObject({
      title: "Piso luminoso",
      askingPrice: 285_000,
      builtAreaM2: 95,
      assetUse: "residential",
      typology: "flat",
      condition: "to_renovate",
      bedrooms: 3,
      elevator: true,
      publishedAt: "2026-01-10",
      reference: "REF-1",
    });
    expect(r.listings[1]).toMatchObject({
      title: undefined,
      assetUse: "commercial",
      typology: "premises",
      condition: "renovated",
      elevator: false,
    });
  });

  it("names the failing line and imports nothing from it", () => {
    const r = parseListingsCsv(
      "address,price,area_m2,asset_use,condition,lat\nCalle Feria 1,0,80,residential,unknown,37.4\nCalle Feria 2,100000,80,castle,nuevo,",
    );
    expect(r.listings).toEqual([]);
    expect(r.errors[0]).toContain("línea 2");
    expect(r.errors[0]).toContain("price");
    expect(r.errors[0]).toContain("lat/lng");
    expect(r.errors[1]).toContain('asset_use "castle"');
    expect(r.errors[1]).toContain("condition");
  });

  it("rejects an empty file", () => {
    expect(parseListingsCsv("").errors).toEqual(["CSV vacío"]);
  });
});
