import { NextResponse } from "next/server";
import { z } from "zod";
import { checkCredentials, clearFailures, createSession, loginBlocked, recordFailure, SESSION_COOKIE } from "@/lib/session";
import { handler } from "@/lib/http";
import { secureCookies } from "@/lib/auth";

const Schema = z.object({ email: z.string().trim().min(3).max(200), password: z.string().min(1).max(200) });

export const POST = handler(async (req: Request) => {
  const { email, password } = Schema.parse(await req.json());
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const key = `${email.toLowerCase()}|${ip}`;
  if (loginBlocked(key)) {
    return NextResponse.json({ error: "Too many attempts. Wait 10 minutes and try again." }, { status: 429 });
  }
  const user = await checkCredentials(email, password);
  if (!user) {
    recordFailure(key);
    return NextResponse.json({ error: "Wrong email or password" }, { status: 401 });
  }
  clearFailures(key);
  const { token, expires } = await createSession(user.id, req.headers.get("user-agent"));
  const res = NextResponse.json({ user });
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secureCookies(req), path: "/", expires });
  return res;
});
