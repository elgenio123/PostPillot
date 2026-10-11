import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ user });
}
