import { describe, expect, it } from "vitest";
import { cityForLocation, defaultCity, microzoneFromPoint, microzoneFromText } from "./registry";

describe("city registry", () => {
  it("maps Triana addresses to the Triana microzone", () => {
    expect(microzoneFromText(defaultCity(), "Calle Pureza 45, Triana")?.id).toBe("sev-triana");
    expect(microzoneFromText(defaultCity(), "Calle Betis 12")?.id).toBe("sev-triana");
  });
  it("prefers the longest alias match", () => {
    expect(microzoneFromText(defaultCity(), "Avenida de la República Argentina 20")?.id).toBe("sev-remedios");
  });
  it("finds nearest microzone by point", () => {
    expect(microzoneFromPoint(defaultCity(), { lat: 37.383, lng: -5.974 })?.id).toBe("sev-nervion");
  });
  it("resolves city by INE code or text", () => {
    expect(cityForLocation({ municipalityCode: "41091" })?.id).toBe("sevilla");
    expect(cityForLocation({ text: "local en Nervión" })?.id).toBe("sevilla");
    expect(cityForLocation({ text: "Madrid, Chamberí" })).toBeUndefined();
  });
});
