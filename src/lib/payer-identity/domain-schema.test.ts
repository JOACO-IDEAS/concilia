import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("payer identity schema invariants", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

  it("no acopla Payer a owner, occupant o una única unit", () => {
    const model = schema.match(/model Payer \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(model).not.toMatch(/unitId|unitOwnerId|occupant/i);
  });

  it("permite señales sin payer y evita columnas raw por tipo", () => {
    const model = schema.match(/model PayerIdentitySignal \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(model).toContain("payerId");
    expect(model).toContain("String?");
    expect(model).toContain("normalizedFingerprint");
    expect(model).not.toMatch(/phone\s+String|email\s+String|bankAccount\s+String/);
  });

  it("mantiene PaymentNotice y PaymentTransaction válidos sin payer resuelto", () => {
    const notice = schema.match(/model PaymentNotice \{[\s\S]*?\n\}/)?.[0] ?? "";
    const transaction = schema.match(/model PaymentTransaction \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(notice).not.toMatch(/payerId\s+String(?!\?)/);
    expect(transaction).not.toMatch(/payerId\s+String(?!\?)/);
  });
});
