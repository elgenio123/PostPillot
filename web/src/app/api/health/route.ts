import { NextResponse } from "next/server";
import { get } from "@/lib/db";

export const dynamic = "force-dynamic";

// Public liveness check for Docker and the deployment pipeline; reveals nothing sensitive
export async function GET() {
  try {
    await get("SELECT 1");
    return NextResponse.json({ ok: true, db: true });
  } catch {
    return NextResponse.json({ ok: false, db: false }, { status: 503 });
  }
}
