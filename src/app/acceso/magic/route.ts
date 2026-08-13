import { NextResponse } from "next/server";
import { consumePilotMagicLink } from "@/lib/auth/magic-link";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session";
import { enforcePilotRateLimit, PilotRateLimitUnavailableError, trustedVercelClientIp } from "@/lib/auth/pilot-rate-limit";

function unavailable(status: 429 | 503, retryAfterSeconds?: number) {
  return new NextResponse("El acceso no está disponible temporalmente. Intentá nuevamente más tarde.", { status, headers: { ...(retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {}), "Cache-Control": "no-store" } });
}

/** La misma URL de magic link, ahora una frontera HTTP con respuesta 429. */
export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    const decision = await enforcePilotRateLimit({ action: "consume", token, ip: trustedVercelClientIp(request.headers) });
    if (!decision.allowed) return unavailable(429, decision.retryAfterSeconds);
    const email = await consumePilotMagicLink(token);
    if (!email) return NextResponse.redirect(new URL("/acceso?invalid-link=1", request.url), 303);
    const response = NextResponse.redirect(new URL("/", request.url), 303);
    response.cookies.set(SESSION_COOKIE_NAME, createSessionToken(email), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_MAX_AGE_SECONDS });
    return response;
  } catch (error) {
    if (error instanceof PilotRateLimitUnavailableError) return unavailable(503);
    return unavailable(503);
  }
}
