import { describe, it, expect } from "vitest";
import { toUsdcUnits, fromUsdcUnits } from "../utils.js";

describe("toUsdcUnits", () => {
  it("converts whole number", () => {
    expect(toUsdcUnits("1")).toBe(1_000_000n);
  });

  it("converts decimal with 6 places", () => {
    expect(toUsdcUnits("0.001")).toBe(1_000n);
  });

  it("converts decimal with fewer than 6 places", () => {
    expect(toUsdcUnits("1.5")).toBe(1_500_000n);
    expect(toUsdcUnits("0.1")).toBe(100_000n);
  });

  it("converts zero", () => {
    expect(toUsdcUnits("0")).toBe(0n);
  });

  it("handles large values", () => {
    expect(toUsdcUnits("1000000")).toBe(1_000_000_000_000n);
  });

  it("converts max decimal precision (6 places)", () => {
    expect(toUsdcUnits("0.000001")).toBe(1n);
  });

  it("throws on empty string", () => {
    expect(() => toUsdcUnits("")).toThrow("Invalid USDC amount");
  });

  it("throws on negative number", () => {
    expect(() => toUsdcUnits("-1")).toThrow("Invalid USDC amount");
  });

  it("throws on more than 6 decimal places", () => {
    expect(() => toUsdcUnits("0.0000001")).toThrow("Invalid USDC amount");
  });

  it("throws on non-numeric string", () => {
    expect(() => toUsdcUnits("abc")).toThrow("Invalid USDC amount");
  });

  it("throws on scientific notation", () => {
    expect(() => toUsdcUnits("1e6")).toThrow("Invalid USDC amount");
  });
});

describe("fromUsdcUnits", () => {
  it("converts whole unit back", () => {
    expect(fromUsdcUnits(1_000_000n)).toBe("1.0");
  });

  it("converts sub-unit amount", () => {
    expect(fromUsdcUnits(1_000n)).toBe("0.001");
  });

  it("converts zero", () => {
    expect(fromUsdcUnits(0n)).toBe("0.0");
  });

  it("strips trailing zeros", () => {
    expect(fromUsdcUnits(1_500_000n)).toBe("1.5");
    expect(fromUsdcUnits(100_000n)).toBe("0.1");
  });

  it("preserves minimum 1 decimal place", () => {
    expect(fromUsdcUnits(1_000_000n)).toBe("1.0");
  });

  it("handles 1 unit (smallest possible)", () => {
    expect(fromUsdcUnits(1n)).toBe("0.000001");
  });

  it("is inverse of toUsdcUnits for valid inputs", () => {
    const amounts = ["0.001", "1.5", "100.123456", "0.000001"];
    for (const a of amounts) {
      expect(fromUsdcUnits(toUsdcUnits(a))).toBe(a);
    }
  });
});
