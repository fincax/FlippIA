import { describe, expect, it } from "vitest";
import { introducesNoNewNumbers, numericTokens } from "./guard";

describe("model output guard", () => {
  it("normalises separators", () => {
    expect([...numericTokens("255.000 € y 12,5 % en 2026")]).toEqual(["255000", "125", "2026"]);
  });
  it("accepts rephrasings that reuse the engine's figures", () => {
    const source = "Beneficio neto 54.439 €, ROE 21,3 % en 9 meses.";
    expect(
      introducesNoNewNumbers("En 9 meses el ROE llega al 21,3 % con 54.439 € de beneficio.", source),
    ).toBe(true);
  });
  it("rejects invented figures", () => {
    const source = "Beneficio neto 54.439 €.";
    expect(introducesNoNewNumbers("El beneficio es 999.999 € y el ROE 80 %.", source)).toBe(false);
  });
  it("allows extra whitelisted strings", () => {
    expect(introducesNoNewNumbers("Sevilla, 2026", "sin cifras", ["2026"])).toBe(true);
  });
});
