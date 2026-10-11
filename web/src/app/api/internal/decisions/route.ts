import { NextResponse } from "next/server";
import { z } from "zod";
import { checkSecret } from "@/lib/auth";
import { decide } from "@/lib/runs";
import { handler } from "@/lib/http";

const Schema = z.object({
  draftId: z.string(),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().optional().nullable(),
  source: z.enum(["app", "telegram"]).default("telegram"),
});

// Telegram decisions come in here; the first decision for a draft wins
export const POST = handler(async (req: Request) => {
  const denied = checkSecret(req);
  if (denied) return denied;
  const b = Schema.parse(await req.json());
  const result = await decide(b.draftId, b.decision, b.reason ?? null, b.source);
  return NextResponse.json({ accepted: result.accepted, existing: result.existing ?? null });
});
