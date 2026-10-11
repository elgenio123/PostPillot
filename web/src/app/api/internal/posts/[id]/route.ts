import { NextResponse } from "next/server";
import { z } from "zod";
import { checkSecret } from "@/lib/auth";
import { updatePost } from "@/lib/runs";
import { handler, type Ctx } from "@/lib/http";

const Schema = z.object({
  status: z.enum(["publishing", "scheduled", "published", "failed"]),
  externalId: z.coerce.string().optional().nullable().transform((v) => v || undefined),
  url: z.string().optional().nullable().transform((v) => v || undefined),
  error: z.string().optional().nullable().transform((v) => v || undefined),
});

// Publish workflow reports the result (post URL, status, error) here
export const POST = handler(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const denied = checkSecret(req);
  if (denied) return denied;
  await updatePost((await params).id, Schema.parse(await req.json()));
  return NextResponse.json({ ok: true });
});
