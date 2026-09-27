import { describe, expect, it } from "vitest";
import { parseComparablesCsv } from "./csv";

describe("parseComparablesCsv", () => {
  it("parses Spanish headers, semicolons, decimal commas and booleans", () => {
    const csv = [
      "tipo_operacion;tipo;precio;superficie;fecha;latitud;longitud;estado;planta;ascensor;etiqueta;referencia",
      'sale;transaction;245000;92,5;2026-05-10;37,3826;-5,9963;renovated;2;sí;"Calle Pureza 45, 2º";not-2026-118',
      "rent;verified;950;70;2026-07-01;37.383;-5.997;unknown;;no;Betis 12;",
    ].join("\n");
    const r = parseComparablesCsv(csv);
    expect(r.errors).toEqual([]);
    expect(r.comparables).toHaveLength(2);
    expect(r.comparables[0]).toMatchObject({
      kind: "sale",
      type: "transaction",
      price: 245_000,
      areaM2: 92.5,
      lat: 37.3826,
      lng: -5.9963,
      floor: 2,
      elevator: true,
      label: "Calle Pureza 45, 2º",
      reference: "not-2026-118",
    });
    expect(r.comparables[1]).toMatchObject({ kind: "rent", price: 950, elevator: false, floor: undefined });
  });
  it("reports every bad line and imports nothing from them", () => {
    const r = parseComparablesCsv(
      "kind,type,price,area_m2,date,lat,lng\nsale,scraped,1,2,2026-01-01,37,-5\nsale,transaction,0,80,01/01/2026,37,-5",
    );
    expect(r.comparables).toHaveLength(0);
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]).toContain('type "scraped"');
    expect(r.errors[1]).toContain("price");
    expect(r.errors[1]).toContain("date");
  });
});
