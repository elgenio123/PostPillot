import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { checkSecret } from "@/lib/auth";
import { IMAGE_DIR, decodeDataUrl, saveRunImage } from "@/lib/images";
import { saveRunVideo, videoMessage } from "@/lib/videos";
import { get } from "@/lib/db";
import { publish } from "@/lib/bus";
import { handler } from "@/lib/http";

const IMAGE_SOURCE = { openrouter: "OpenRouter AI", pollinations: "Pollinations.ai", template: "the branded template" } as Record<string, string>;

// n8n sends the painted image here, either as JSON with a data URL or as raw image bytes.
// The app crops it per platform, or draws the branded template if the image is missing or broken.
// For a video run (the AI video failed), the image is then animated into the video.
export const POST = handler(async (req: Request) => {
  const denied = checkSecret(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const type = req.headers.get("content-type") ?? "";
  let meta: Record<string, string> = Object.fromEntries(url.searchParams);
  let data: Buffer | null = null;
  if (type.includes("application/json")) {
    const body = await req.json();
    meta = { ...meta, ...body };
    data = typeof body.dataUrl === "string" ? decodeDataUrl(body.dataUrl) : null;
  } else {
    const buf = Buffer.from(await req.arrayBuffer());
    data = buf.length ? buf : null;
  }
  const runId = meta.runId;
  const runRow = await get<{ organisation: string; title: string | null; media: string; video_seconds: number | null }>(
    "SELECT organisation, title, media, video_seconds FROM runs WHERE id = ?", runId ?? "",
  );
  if (!runRow) return NextResponse.json({ error: "unknown run" }, { status: 404 });
  const title = meta.title || runRow.title || "School event";
  const saved = await saveRunImage({
    runId, source: meta.source ?? "template", data, prompt: meta.prompt,
    title, date: meta.date ?? "", organisation: runRow.organisation, note: meta.note,
  });
  const aiCost = Number(meta.aiCost ?? 0);

  if (runRow.media === "video") {
    const video = await saveRunVideo({
      runId, source: `animated-${saved.source}`, seconds: runRow.video_seconds ?? 5,
      image: fs.readFileSync(path.join(IMAGE_DIR, saved.original)),
      title, date: meta.date ?? "", organisation: runRow.organisation,
      note: `AI video unavailable: ${IMAGE_SOURCE[saved.source] ?? saved.source} image animated`,
    });
    publish({ type: "run", runId });
    return NextResponse.json({ ...saved, video, aiCost, message: videoMessage(video.source, video.seconds) });
  }
  publish({ type: "run", runId });
  return NextResponse.json({ ...saved, aiCost, message: `Image ready from ${IMAGE_SOURCE[saved.source] ?? saved.source}` });
});
