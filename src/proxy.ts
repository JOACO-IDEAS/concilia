import { NextResponse, type NextRequest } from "next/server";
import { parseSessionToken, SESSION_COOKIE_NAME } from "./lib/auth/session-token";
import { PRIVATE_ROUTE_HEADER } from "./lib/auth/private-route";

const PUBLIC_PATHS = new Set(["/acceso", "/api/health", "/api/pilot-access/request", "/api/v1/webhooks/payments"]);

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname) || pathname.startsWith("/acceso/magic");
}

function hasValidSession(request: NextRequest): boolean {
  try {
    return parseSessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value) !== null;
  } catch {
    return false;
  }
}

/** Cookie check before rendering; RootLayout revalidates the administrator in Prisma. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();
  if (!hasValidSession(request)) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Autenticación requerida." }, { status: 401 });
    return NextResponse.redirect(new URL("/acceso", request.url));
  }
  const headers = new Headers(request.headers);
  headers.set(PRIVATE_ROUTE_HEADER, "1");
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };
