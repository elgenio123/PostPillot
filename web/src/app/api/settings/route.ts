import { NextResponse } from "next/server";
import { getSettings, saveSettings, SettingsSchema } from "@/lib/settings";
import { handler } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getSettings());
}

export const PUT = handler(async (req: Request) => {
  const patch = SettingsSchema.partial().parse(await req.json());
  return NextResponse.json(await saveSettings(patch));
});
