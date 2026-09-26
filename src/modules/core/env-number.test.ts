import { afterEach, describe, expect, it } from "vitest";
import { envNumber } from "./env-number";

describe("envNumber", () => {
  afterEach(() => {
    delete process.env.TEST_NUM;
  });
  it("falls back on empty, invalid or non-positive values", () => {
    process.env.TEST_NUM = "";
    expect(envNumber("TEST_NUM", 10)).toBe(10);
    process.env.TEST_NUM = "abc";
    expect(envNumber("TEST_NUM", 10)).toBe(10);
    process.env.TEST_NUM = "0";
    expect(envNumber("TEST_NUM", 10)).toBe(10);
    delete process.env.TEST_NUM;
    expect(envNumber("TEST_NUM", 10)).toBe(10);
  });
  it("reads valid numbers", () => {
    process.env.TEST_NUM = " 25 ";
    expect(envNumber("TEST_NUM", 10)).toBe(25);
  });
});
