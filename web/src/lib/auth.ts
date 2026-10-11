import { NextResponse } from "next/server";

// Internal routes are called by n8n only; it sends the shared secret in this header
export function checkSecret(req: Request): NextResponse | null {
  const expected = process.env.POSTPILOT_SECRET;
  if (!expected || req.headers.get("x-postpilot-secret") !== expected) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  return null;
}

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Cookies get the Secure flag behind HTTPS (Caddy sets x-forwarded-proto), or when forced in .env
export function secureCookies(req: Request): boolean {
  return process.env.COOKIE_SECURE === "true" || req.headers.get("x-forwarded-proto") === "https";
}
