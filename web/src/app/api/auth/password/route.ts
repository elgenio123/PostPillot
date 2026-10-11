import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { changePassword, getSessionUser, SESSION_COOKIE } from "@/lib/session";
import { handler } from "@/lib/http";

const Schema = z.object({ current: z.string().min(1).max(200), next: z.string().max(200) });

export const POST = handler(async (req: Request) => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = await getSessionUser(token);
  if (!user || !token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { current, next } = Schema.parse(await req.json());
  const error = await changePassword(user.id, current, next, token);
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ ok: true });
});
