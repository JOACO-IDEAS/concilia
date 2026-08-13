import { NextResponse } from "next/server";
import { activatePilotMagicLink, issuePilotMagicLink, normalizeEmail } from "@/lib/auth/magic-link";
import { sendPilotMagicLink } from "@/lib/auth/magic-link-email";
import { enforcePilotRateLimit, PilotRateLimitUnavailableError, trustedVercelClientIp } from "@/lib/auth/pilot-rate-limit";

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
        const activated = await activatePilotMagicLink(issued.token);
        if (!activated) console.warn("[pilot-access] magic-link activation failed category=activation");
      } else {
        console.warn(`[pilot-access] magic-link delivery failed category=${delivery.category}`);
      }
    }
    return NextResponse.redirect(new URL("/acceso?requested=1", request.url), 303);
  } catch (error) {
    if (error instanceof PilotRateLimitUnavailableError) return NextResponse.json({ error: "access_temporarily_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ error: "access_temporarily_unavailable" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
