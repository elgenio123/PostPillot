import { NextResponse } from "next/server";
import { z } from "zod";
import { publishDraft } from "@/lib/runs";
import { handler, type Ctx } from "@/lib/http";

const Schema = z.object({ when: z.string().min(1) });

export const POST = handler(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { when } = Schema.parse(await req.json());
  return NextResponse.json(await publishDraft((await params).id, when));
});
