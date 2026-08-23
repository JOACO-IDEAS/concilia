import { describe, expect, it, vi } from "vitest";
import { loadDocumentLookup } from "./document-lookup-tool";
import { modelSafeProjection } from "./orchestration";

const access = { id: "org-a", name: "Consorcio A" };
const invoice = (id = "doc-secret") => ({ id, type: "INVOICE", title: "Factura agosto", period: new Date("2026-08-01T00:00:00Z"), issuedAt: new Date("2026-08-05T00:00:00Z"), expiresAt: null, amount: { toString: () => "125000" }, currency: "ARS", storageReference: null, provider: { name: "Ascensores Acme" } });
function tx(adminRows: unknown[] = [], providerRows: unknown[] = [], allowed: unknown = access) {
  return { organization: { findFirst: vi.fn().mockResolvedValue(allowed) }, administrativeDocument: { findMany: vi.fn().mockResolvedValue(adminRows) }, providerDocument: { findMany: vi.fn().mockResolvedValue(providerRows) } };
}

describe("DOCUMENT_LOOKUP read-only tool", () => {
  it("finds one tenant-scoped invoice by normalized provider and exact period", async () => {
    const db = tx([invoice()]);
    const result = await loadDocumentLookup(db as never, "admin-a", "org-a", { documentType: "INVOICE", provider: "  ASCENSORES ACME ", period: "2026-08" });
    expect(result).toMatchObject({ outcome: "FOUND", truncated: false, documents: [{ title: "Factura agosto", availability: "FILE_UNAVAILABLE", periodLabel: "2026-08" }] });
    expect(db.organization.findFirst.mock.calls[0][0].where).toMatchObject({ id: "org-a", administrators: { some: { administratorId: "admin-a" } } });
    expect(db.administrativeDocument.findMany.mock.calls[0][0].where).toMatchObject({ organizationId: "org-a", type: "INVOICE", provider: { name: { contains: "ASCENSORES ACME", mode: "insensitive" } } });
    expect(db.administrativeDocument.findMany.mock.calls[0][0].take).toBe(11);
  });

  it("reports multiple and not found without inventing files", async () => {
    await expect(loadDocumentLookup(tx([invoice("a"), invoice("b")]) as never, "admin-a", "org-a", { documentType: "INVOICE" })).resolves.toMatchObject({ outcome: "MULTIPLE_MATCHES" });
    await expect(loadDocumentLookup(tx([]) as never, "admin-a", "org-a", { documentType: "CONTRACT" })).resolves.toMatchObject({ outcome: "NOT_FOUND", documents: [] });
  });

  it("fails closed for cross-tenant/inactive access and mismatched organization names", async () => {
    await expect(loadDocumentLookup(tx([], [], null) as never, "admin-a", "org-b", { documentType: "INVOICE" })).rejects.toThrow("DOCUMENT_ACCESS_DENIED");
    const db = tx(); await loadDocumentLookup(db as never, "admin-a", "org-a", { organization: "Consorcio A", documentType: "INVOICE" });
    expect(db.organization.findFirst.mock.calls[0][0].where.name).toEqual({ equals: "Consorcio A", mode: "insensitive" });
  });

  it("supports amount/expiry filters and maps provider compliance without N+1", async () => {
    const compliance = { id: "provider-secret", type: "RC", issuedAt: null, validTo: new Date("2026-12-31T00:00:00Z"), evidenceUrl: "opaque-old-reference", documentNumber: null, provider: { name: "Acme" } };
    const db = tx([], [compliance]);
    const result = await loadDocumentLookup(db as never, "admin-a", "org-a", { documentType: "INSURANCE_POLICY", expiresTo: "2026-12-31" });
    expect(result.documents[0]).toMatchObject({ documentType: "Seguro de responsabilidad civil", availability: "AVAILABLE" });
    expect(db.providerDocument.findMany).toHaveBeenCalledOnce(); expect(db.administrativeDocument.findMany).not.toHaveBeenCalled();
    expect(JSON.stringify(db.providerDocument.findMany.mock.calls[0][0].where)).toContain("org-a");
  });

  it("keeps IDs and storage/evidence references out of the model projection", () => {
    const projected = JSON.stringify(modelSafeProjection({ message: "Encontré este documento.", capability: "DOCUMENT_LOOKUP", presentation: { kind: "DOCUMENT_LOOKUP", outcome: "FOUND", documents: [{ resultKey: "secret-id", documentType: "Factura", title: "Factura", organizationName: "A", providerName: null, periodLabel: null, issuedAtLabel: null, expiresAtLabel: null, amountLabel: null, availability: "FILE_UNAVAILABLE" }] } }));
    expect(projected).not.toMatch(/secret-id|storageReference|evidenceUrl|href/);
  });

  it("requires bounded criteria before querying", async () => {
    const db = tx(); await expect(loadDocumentLookup(db as never, "admin-a", "org-a", {})).resolves.toMatchObject({ outcome: "INSUFFICIENT_CRITERIA" });
    expect(db.organization.findFirst).not.toHaveBeenCalled();
  });
});
