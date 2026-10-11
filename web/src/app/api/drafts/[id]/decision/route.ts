import { NextResponse } from "next/server";
import { z } from "zod";
import { decide } from "@/lib/runs";
import { handler, type Ctx } from "@/lib/http";

const Schema = z.object({ decision: z.enum(["approve", "reject"]), reason: z.string().max(500).optional() });

export const POST = handler(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { decision, reason } = Schema.parse(await req.json());
  const result = await decide((await params).id, decision, reason ?? null, "app");
  // 409 tells the UI that Telegram (or another click) decided first
  return NextResponse.json(result, { status: result.accepted ? 200 : 409 });
});
