import { NextResponse } from "next/server";
import { z } from "zod";
import { checkSecret } from "@/lib/auth";
import { handleEvent } from "@/lib/runs";
import { handler, type Ctx } from "@/lib/http";

const EventSchema = z.object({
  step: z.string().min(1),
  status: z.enum(["running", "done", "failed"]),
  message: z.string().optional().nullable().transform((v) => v ?? undefined),
  data: z.record(z.string(), z.unknown()).optional().nullable().transform((v) => v ?? undefined),
  cost: z.coerce.number().optional().nullable().transform((v) => v ?? undefined),
  executionId: z.coerce.string().optional().nullable().transform((v) => v ?? undefined),
  workflow: z.string().optional().nullable().transform((v) => v ?? undefined),
});

export const POST = handler(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const denied = checkSecret(req);
  if (denied) return denied;
  await handleEvent((await params).id, EventSchema.parse(await req.json()));
  return NextResponse.json({ ok: true });
});
