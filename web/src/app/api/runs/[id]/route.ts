import { NextResponse } from "next/server";
import { getRunDetail } from "@/lib/runs";
import type { Ctx } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: Ctx<{ id: string }>) {
  const detail = await getRunDetail((await params).id);
  if (!detail) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  return NextResponse.json(detail);
}
