import { formatDateTime, formatMonto } from "@/lib/format";

export interface DatosReciboPagoWhatsApp {
  organizationName: string;
  amount: number;
  currency: string;
  transactionId: string;
  provider: string;
  fecha: Date;
}

// WhatsApp no soporta HTML — el formato es texto plano con marcado simple
// (*negrita*), a diferencia de src/lib/notifications/templates.ts.
export function plantillaReciboPagoWhatsApp(datos: DatosReciboPagoWhatsApp): string {
  const monto = formatMonto(datos.amount, datos.currency);
  const fecha = formatDateTime(datos.fecha.toISOString());

  return [
    `*Pago recibido — ${monto}*`,
    "",
    `Se registró y concilió un pago para *${datos.organizationName}*. El comprobante ya está disponible en el panel de ConcilIA.`,
    "",
    `Fecha: ${fecha}`,
    `Nº de transacción: ${datos.transactionId}`,
    `Proveedor: ${datos.provider}`,
  ].join("\n");
}

export interface DatosAlertaSinReconciliarWhatsApp {
  transactionId: string;
  amount: number;
  currency: string;
  payerIdentifier: string | null;
  provider: string;
  fecha: Date;
  panelUrl: string;
}

export interface DatosRecordatorioPagoWhatsApp {
  organizationName: string;
  amountDue: number | null; // null = no hay pagos previos de los que estimar un monto
  currency: string;
  daysOverdue: number;
  bankAccountType: string | null;
  bankAccountNumber: string | null;
}

// Tono cordial a propósito (reclamo, no amenaza) — mismo criterio de copy
// que el resto del producto ("Listo para aprobar en 1 clic" en vez de jerga
// técnica, ver product-blueprint.md).
export function plantillaRecordatorioPagoWhatsApp(datos: DatosRecordatorioPagoWhatsApp): string {
  const dias = `${datos.daysOverdue} día${datos.daysOverdue === 1 ? "" : "s"}`;
  const lineas = [`Hola *${datos.organizationName}* — te escribimos de ConcilIA.`, ""];

  if (datos.amountDue !== null) {
    const monto = formatMonto(datos.amountDue, datos.currency);
    lineas.push(`Detectamos un saldo estimado pendiente de *${monto}*, con ${dias} de atraso.`);
  } else {
    lineas.push(`Detectamos que no registrás pagos conciliados hace ${dias}.`);
  }

  if (datos.bankAccountNumber) {
    lineas.push(
      "",
      "Podés regularizarlo transfiriendo a:",
      `${datos.bankAccountType ?? "Cuenta"}: ${datos.bankAccountNumber}`
    );
  }

  lineas.push(
    "",
    "Si ya lo transferiste, no hace falta que hagas nada más — puede que todavía no se haya conciliado. ¡Gracias!"
  );

  return lineas.join("\n");
}

export function plantillaAlertaSinReconciliarWhatsApp(datos: DatosAlertaSinReconciliarWhatsApp): string {
  const monto = formatMonto(datos.amount, datos.currency);
  const fecha = formatDateTime(datos.fecha.toISOString());

  return [
    `*Pago de ${monto} sin identificar — requiere acción manual*`,
    "",
    "Llegó un pago y el motor de reconciliación no pudo encontrar el consorcio dueño automáticamente (no matcheó por CUIT ni por CBU/Alias). Hace falta vincularlo a mano.",
    "",
    `Pagador (CUIT/CBU recibido): ${datos.payerIdentifier ?? "No incluido"}`,
    `Fecha: ${fecha}`,
    `Nº de transacción: ${datos.transactionId}`,
    `Proveedor: ${datos.provider}`,
    "",
    `Vincular en el panel: ${datos.panelUrl}`,
  ].join("\n");
}
