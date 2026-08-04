import { formatDateTime, formatMonto } from "@/lib/format";

export interface EmailRenderizado {
  subject: string;
  html: string;
  text: string;
}

const AZUL = "#2563eb";
const SLATE_900 = "#0f172a";
const SLATE_500 = "#64748b";
const SLATE_200 = "#e2e8f0";

// Layout base compartido — tablas + estilos inline, como exigen la mayoría
// de los clientes de correo (Gmail/Outlook ignoran <style> externos y hasta
// bloques <style> completos en muchos casos).
function layoutBase(tituloInterno: string, cuerpoHtml: string): string {
  return `<!doctype html>
<html lang="es-AR">
  <body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${SLATE_200};">
            <tr>
              <td style="padding:24px 28px;border-bottom:1px solid ${SLATE_200};">
                <span style="font-size:16px;font-weight:700;color:${AZUL};">Concil<span style="color:${SLATE_900};">IA</span></span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                ${cuerpoHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;border-top:1px solid ${SLATE_200};">
                <p style="margin:0;font-size:11px;color:${SLATE_500};">
                  ${tituloInterno} — notificación automática de ConcilIA, no responder a este correo.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export interface DatosReciboPago {
  organizationName: string;
  amount: number;
  currency: string;
  transactionId: string;
  provider: string;
  fecha: Date;
}

export function plantillaReciboPago(datos: DatosReciboPago): EmailRenderizado {
  const monto = formatMonto(datos.amount, datos.currency);
  const fecha = formatDateTime(datos.fecha.toISOString());

  const subject = `Pago recibido — ${monto} · ${datos.organizationName}`;

  const html = layoutBase(
    "Recibo de pago",
    `
    <p style="margin:0 0 4px;font-size:13px;color:${SLATE_500};">Pago conciliado</p>
    <h1 style="margin:0 0 20px;font-size:26px;font-weight:700;color:${SLATE_900};">${monto}</h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.5;color:${SLATE_900};">
      Se registró y concilió un pago para <strong>${datos.organizationName}</strong>. El comprobante ya está disponible en el panel de ConcilIA.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${SLATE_200};">
      <tr>
        <td style="padding:10px 0;font-size:13px;color:${SLATE_500};">Organización</td>
        <td style="padding:10px 0;font-size:13px;color:${SLATE_900};text-align:right;font-weight:500;">${datos.organizationName}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-top:1px solid ${SLATE_200};font-size:13px;color:${SLATE_500};">Fecha</td>
        <td style="padding:10px 0;border-top:1px solid ${SLATE_200};font-size:13px;color:${SLATE_900};text-align:right;font-weight:500;">${fecha}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-top:1px solid ${SLATE_200};font-size:13px;color:${SLATE_500};">Nº de transacción</td>
        <td style="padding:10px 0;border-top:1px solid ${SLATE_200};font-size:13px;color:${SLATE_900};text-align:right;font-weight:500;">${datos.transactionId}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-top:1px solid ${SLATE_200};font-size:13px;color:${SLATE_500};">Proveedor</td>
        <td style="padding:10px 0;border-top:1px solid ${SLATE_200};font-size:13px;color:${SLATE_900};text-align:right;font-weight:500;">${datos.provider}</td>
      </tr>
    </table>
    `
  );

  const text = [
    `Pago recibido — ${monto}`,
    "",
    `Se registró y concilió un pago para ${datos.organizationName}.`,
    "",
    `Organización: ${datos.organizationName}`,
    `Fecha: ${fecha}`,
    `Nº de transacción: ${datos.transactionId}`,
    `Proveedor: ${datos.provider}`,
  ].join("\n");

  return { subject, html, text };
}

export interface DatosAlertaSinReconciliar {
  transactionId: string;
  amount: number;
  currency: string;
  payerIdentifier: string | null;
  provider: string;
  fecha: Date;
  panelUrl: string;
}

export function plantillaAlertaSinReconciliar(datos: DatosAlertaSinReconciliar): EmailRenderizado {
  const monto = formatMonto(datos.amount, datos.currency);
  const fecha = formatDateTime(datos.fecha.toISOString());
  const AMBAR = "#d97706";

  const subject = `Acción requerida — pago de ${monto} sin vincular`;

  const html = layoutBase(
    "Alerta de pago sin reconciliar",
    `
    <p style="margin:0 0 4px;font-size:13px;color:${AMBAR};font-weight:600;">Requiere acción manual</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:${SLATE_900};">Pago de ${monto} sin identificar</h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.5;color:${SLATE_900};">
      Llegó un pago por webhook y el motor de reconciliación no pudo encontrar automáticamente el consorcio dueño (no matcheó por CUIT ni por CBU/Alias). Hace falta vincularlo a mano.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${SLATE_200};margin-bottom:24px;">
      <tr>
        <td style="padding:10px 0;font-size:13px;color:${SLATE_500};">Monto</td>
        <td style="padding:10px 0;font-size:13px;color:${SLATE_900};text-align:right;font-weight:500;">${monto}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-top:1px solid ${SLATE_200};font-size:13px;color:${SLATE_500};">Pagador (CUIT/CBU recibido)</td>
        <td style="padding:10px 0;border-top:1px solid ${SLATE_200};font-size:13px;color:${SLATE_900};text-align:right;font-weight:500;">${datos.payerIdentifier ?? "No incluido en el webhook"}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-top:1px solid ${SLATE_200};font-size:13px;color:${SLATE_500};">Fecha</td>
        <td style="padding:10px 0;border-top:1px solid ${SLATE_200};font-size:13px;color:${SLATE_900};text-align:right;font-weight:500;">${fecha}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-top:1px solid ${SLATE_200};font-size:13px;color:${SLATE_500};">Nº de transacción</td>
        <td style="padding:10px 0;border-top:1px solid ${SLATE_200};font-size:13px;color:${SLATE_900};text-align:right;font-weight:500;">${datos.transactionId}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-top:1px solid ${SLATE_200};font-size:13px;color:${SLATE_500};">Proveedor</td>
        <td style="padding:10px 0;border-top:1px solid ${SLATE_200};font-size:13px;color:${SLATE_900};text-align:right;font-weight:500;">${datos.provider}</td>
      </tr>
    </table>
    <a href="${datos.panelUrl}" style="display:inline-block;background-color:${AZUL};color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:8px;">
      Vincular en el panel →
    </a>
    `
  );

  const text = [
    `Pago de ${monto} sin identificar — requiere acción manual`,
    "",
    "Llegó un pago por webhook que no matcheó automáticamente por CUIT ni por CBU/Alias.",
    "",
    `Monto: ${monto}`,
    `Pagador (CUIT/CBU recibido): ${datos.payerIdentifier ?? "No incluido en el webhook"}`,
    `Fecha: ${fecha}`,
    `Nº de transacción: ${datos.transactionId}`,
    `Proveedor: ${datos.provider}`,
    "",
    `Vincular en el panel: ${datos.panelUrl}`,
  ].join("\n");

  return { subject, html, text };
}
