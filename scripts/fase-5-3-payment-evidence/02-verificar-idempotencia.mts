// Fase 5.3 — verificación real de idempotencia: el MISMO externalMessageId
// enviado dos veces nunca duplica PaymentNotice ni AgentObservation.
import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";
cargarEntornoDeFixturesYVerificar();
const { prisma } = await import("../../src/lib/prisma.ts");
const { ingestarComprobanteWhatsApp } = await import("../../src/lib/payment-evidence/ingest-whatsapp-evidence.ts");

const notitesAntes = await prisma.paymentNotice.count();
const obsAntes = await prisma.agentObservation.count();

const mensaje = {
  externalMessageId: "demo-fase53:idempotencia-real",
  phone: "5491100099999",
  receivedAt: new Date().toISOString(),
  messageType: "image" as const,
  attachmentUrl: null,
  rawText: null,
};
const comprobante = { amount: 100000, currency: "ARS", payerName: null, payerIdentifier: null, transactionDate: null, referenceNumber: null, bankOrigin: null, confidenceExtraccion: null };

const r1 = await prisma.$transaction((tx) => ingestarComprobanteWhatsApp(tx, mensaje, comprobante));
const r2 = await prisma.$transaction((tx) => ingestarComprobanteWhatsApp(tx, mensaje, comprobante));
const r3 = await prisma.$transaction((tx) => ingestarComprobanteWhatsApp(tx, mensaje, comprobante));

console.log("1ra vez — yaExistia:", r1.yaExistia, "| observacionGenerada:", r1.observacionGenerada);
console.log("2da vez — yaExistia:", r2.yaExistia, "| observacionGenerada:", r2.observacionGenerada);
console.log("3ra vez — yaExistia:", r3.yaExistia, "| observacionGenerada:", r3.observacionGenerada);

const noticesDespues = await prisma.paymentNotice.count();
const obsDespues = await prisma.agentObservation.count();

console.log(`\nPaymentNotice: ${notitesAntes} → ${noticesDespues} (esperado: +1, nunca +3)`);
console.log(`AgentObservation: ${obsAntes} → ${obsDespues} (esperado: +1, nunca +3)`);

if (noticesDespues - notitesAntes !== 1) throw new Error("¡ALERTA! Idempotencia de PaymentNotice falló.");
if (obsDespues - obsAntes !== 1) throw new Error("¡ALERTA! Idempotencia de AgentObservation falló.");
console.log("\nOK — idempotencia confirmada con 3 llamadas reales, mismo externalMessageId.");

await prisma.$disconnect();
