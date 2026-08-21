import { describe, expect, it } from "vitest";
import { ExtractionNormalizationError, normalizeAmount, normalizeDate, normalizeReference, protectAccountIdentifier } from "./extraction-normalizers";

describe("payment evidence fact normalization", () => {
  it.each([
    ["210.000", 210000], ["$210.000", 210000], ["210000", 210000], ["ARS 210.000", 210000], ["210.000,00", 210000], ["210000,50", 210000.5],
  ])("normalizes Argentine amount %s", (raw, expected) => expect(normalizeAmount(raw)).toBe(expected));

  it.each([["21/08/2026", "2026-08-21"], ["21-08-2026", "2026-08-21"], ["2026-08-21", "2026-08-21"]])("normalizes date %s", (raw, expected) => {
    expect(normalizeDate(raw).toISOString().slice(0, 10)).toBe(expected);
  });

  it("rejects ambiguous and impossible dates instead of guessing", () => {
    expect(() => normalizeDate("08/09/2026")).toThrow(ExtractionNormalizationError);
    expect(() => normalizeDate("31/02/2026")).toThrow(ExtractionNormalizationError);
  });

  it("normalizes operation references without interpreting them", () => expect(normalizeReference("  ab  123 ")).toBe("AB 123"));

  it("protects account identifiers with fingerprint and masked preview only", () => {
    const protectedValue = protectAccountIdentifier("CBU", "2850590940090418135201");
    expect(protectedValue.normalizedFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(protectedValue.maskedValue).toBe("••••5201");
    expect(JSON.stringify(protectedValue)).not.toContain("2850590940090418135201");
  });
});
