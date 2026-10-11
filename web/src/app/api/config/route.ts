import { NextResponse } from "next/server";
import { examples, fcfaPerUsd, models, n8nPublicUrl, presets, WORKFLOWS } from "@/lib/config";
import type { AppConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const m = models();
  const body: AppConfig = {
    models: m.models,
    defaultModel: m.default,
    presets: presets().map(({ id, label }) => ({ id, label })),
    examples: examples(),
    fcfaPerUsd: fcfaPerUsd(),
    n8nUrl: n8nPublicUrl(),
    workflows: WORKFLOWS,
    imageModel: process.env.IMAGE_MODEL ?? "",
  };
  return NextResponse.json(body);
}
