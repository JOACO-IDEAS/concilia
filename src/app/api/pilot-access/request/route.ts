import { NextResponse } from "next/server";
import { activatePilotMagicLink, issuePilotMagicLink, normalizeEmail } from "@/lib/auth/magic-link";
import { sendPilotMagicLink } from "@/lib/auth/magic-link-email";
import { enforcePilotRateLimit, PilotRateLimitUnavailableError, trustedVercelClientIp } from "@/lib/auth/pilot-rate-limit";

type PilotTelemetryEvent =
  | "PILOT_EMAIL_PROVIDER_REJECTED"
  | "PILOT_EMAIL_PROVIDER_ACCEPTED"
  | "PILOT_TOKEN_ACTIVATION_FAILED"
  | "PILOT_TOKEN_ACTIVATED";

type ActivationSafeCode = "ACTIVATION_NOT_APPLIED" | "PRISMA_ERROR" | "UNKNOWN_ACTIVATION_ERROR";

/** Observabilidad allowlisted: no serializa ningún identificador o Error crudo. */
function logPilotIssuance(event: PilotTelemetryEvent, safeCode?: string, prismaCode?: string) {
  const payload: { event: PilotTelemetryEvent; runtime: "vercel" | "node"; safeCode?: string; prismaCode?: string } = {
    event,
    runtime: process.env.VERCEL === "1" ? "vercel" : "node",
  };
  if (safeCode) payload.safeCode = safeCode;
  if (prismaCode) payload.prismaCode = prismaCode;
  console.info(JSON.stringify(payload));
}

function activationFailureCode(error: unknown): { safeCode: ActivationSafeCode; prismaCode?: string } {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^P\d{4}$/.test(code)
    ? { safeCode: "PRISMA_ERROR", prismaCode: code }
    : { safeCode: "UNKNOWN_ACTIVATION_ERROR" };
}

function blocked(retryAfterSeconds: number) {
  return NextResponse.json({ error: "access_temporarily_unavailable" }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds), "Cache-Control": "no-store" } });
}

/** Frontera HTTP: permite status 429 y deriva IP sólo de Vercel. */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const email = normalizeEmail(String(form.get("email") ?? ""));
    const decision = await enforcePilotRateLimit({ action: "issue", email, ip: trustedVercelClientIp(request.headers) });
    if (!decision.allowed) return blocked(decision.retryAfterSeconds);

    const issued = await issuePilotMagicLink(email, { initiallyRevoked: true });
    if (issued) {
      const delivery = await sendPilotMagicLink(email, issued.token);
      if (delivery.accepted) {
        logPilotIssuance("PILOT_EMAIL_PROVIDER_ACCEPTED");
        try {
          const activated = await activatePilotMagicLink(issued.token);
          if (activated) logPilotIssuance("PILOT_TOKEN_ACTIVATED");
          else logPilotIssuance("PILOT_TOKEN_ACTIVATION_FAILED", "ACTIVATION_NOT_APPLIED");
        } catch (error) {
          const { safeCode, prismaCode } = activationFailureCode(error);
          logPilotIssuance("PILOT_TOKEN_ACTIVATION_FAILED", safeCode, prismaCode);
        }
      } else {
        logPilotIssuance("PILOT_EMAIL_PROVIDER_REJECTED", delivery.safeCode);
      }
    }
    return NextResponse.redirect(new URL("/acceso?requested=1", request.url), 303);
  } catch (error) {
    if (error instanceof PilotRateLimitUnavailableError) return NextResponse.json({ error: "access_temporarily_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ error: "access_temporarily_unavailable" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
