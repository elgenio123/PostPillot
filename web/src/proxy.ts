import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";

// Paths anyone may open without signing in
const PUBLIC = ["/login", "/api/auth/login", "/api/health", "/icon.svg", "/favicon.ico"];

// Runs before every page and API route: no valid session means no access
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.includes(pathname)) return NextResponse.next();

  // n8n calls the app with the shared secret; internal routes check it themselves
  if (pathname.startsWith("/api/internal/")) return NextResponse.next();
  const secret = process.env.POSTPILOT_SECRET;
  const media = pathname.startsWith("/api/images/") || pathname.startsWith("/api/videos/");
  if (secret && media && req.headers.get("x-postpilot-secret") === secret) return NextResponse.next();

  const user = await getSessionUser(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (user) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const login = new URL("/login", req.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next.js build assets
  matcher: ["/((?!_next/static|_next/image).*)"],
};
