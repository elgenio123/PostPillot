import { NextResponse } from "next/server";
import { costs } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return NextResponse.json(await costs(new URL(req.url).searchParams.get("runId")));
}
