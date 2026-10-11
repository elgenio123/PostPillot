import { NextResponse } from "next/server";
import { checkSecret } from "@/lib/auth";
import { presets, prompts } from "@/lib/config";

export const dynamic = "force-dynamic";

// n8n loads the prompt files from here at the start of each workflow
export async function GET(req: Request) {
  const denied = checkSecret(req);
  if (denied) return denied;
  return NextResponse.json({
    prompts: prompts(),
    presets: Object.fromEntries(presets().map((p) => [p.id, p.text])),
  });
}
