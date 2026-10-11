import { NextResponse } from "next/server";
import { z } from "zod";
import { createRun, listRuns } from "@/lib/runs";
import { presets } from "@/lib/config";
import { handler } from "@/lib/http";

export const dynamic = "force-dynamic";

const NewRunSchema = z.object({
  brief: z.string().trim().min(20, "Please write a brief of at least 20 characters").max(3000),
  organisation: z.string().trim().min(2, "Please enter the school or organisation name").max(120),
  preset: z.string(),
  platforms: z.array(z.enum(["facebook", "linkedin"])).min(1, "Choose at least one platform"),
});

export async function GET() {
  return NextResponse.json(await listRuns());
}

export const POST = handler(async (req: Request) => {
  const input = NewRunSchema.parse(await req.json());
  if (!presets().some((p) => p.id === input.preset)) return NextResponse.json({ error: "Unknown brand voice" }, { status: 400 });
  const id = await createRun(input);
  return NextResponse.json({ id }, { status: 201 });
});
