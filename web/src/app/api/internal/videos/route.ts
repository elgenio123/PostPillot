import { NextResponse } from "next/server";
import { checkSecret } from "@/lib/auth";
import { get } from "@/lib/db";
import { saveRunVideo, videoMessage } from "@/lib/videos";
import { publish } from "@/lib/bus";
import { handler } from "@/lib/http";

// n8n sends the AI video here as raw bytes (details in the query string).
// The app converts it for the social networks and makes a poster frame; a broken video becomes an animated template.
export const POST = handler(async (req: Request) => {
  const denied = checkSecret(req);
  if (denied) return denied;
  const meta = Object.fromEntries(new URL(req.url).searchParams);
  const runRow = await get<{ organisation: string; title: string | null; video_seconds: number | null }>(
    "SELECT organisation, title, video_seconds FROM runs WHERE id = ?", meta.runId ?? "",
  );
  if (!runRow) return NextResponse.json({ error: "unknown run" }, { status: 404 });
  const data = Buffer.from(await req.arrayBuffer());
  const saved = await saveRunVideo({
    runId: meta.runId, source: meta.source ?? "openrouter", data, seconds: runRow.video_seconds ?? 5,
    title: meta.title || runRow.title || "School event", date: meta.date ?? "", organisation: runRow.organisation,
  });
  publish({ type: "run", runId: meta.runId });
  return NextResponse.json({ ...saved, aiCost: Number(meta.aiCost ?? 0), message: videoMessage(saved.source, saved.seconds) });
});

