import { NextResponse } from "next/server";
import { z } from "zod";
import { editDraft } from "@/lib/runs";
import { handler, type Ctx } from "@/lib/http";

export const PATCH = handler(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { text } = z.object({ text: z.string().max(5000) }).parse(await req.json());
  return NextResponse.json({ id: await editDraft((await params).id, text) });
});
