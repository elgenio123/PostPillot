import { NextResponse } from "next/server";
import { reports } from "@/lib/dashboard";
import { callWebhook } from "@/lib/n8n";
import { handler } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await reports());
}

// "Generate report now": the Weekly report workflow does the work and posts the result back
export const POST = handler(async () => {
  await callWebhook("postpilot-report", { trigger: "button" });
  return NextResponse.json({ started: true }, { status: 202 });
});
