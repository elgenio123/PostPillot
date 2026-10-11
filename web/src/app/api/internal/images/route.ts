import { NextResponse } from "next/server";
import { checkSecret } from "@/lib/auth";
import { decodeDataUrl, saveRunImage } from "@/lib/images";
import { get } from "@/lib/db";
import { publish } from "@/lib/bus";
import { handler } from "@/lib/http";

// n8n sends the painted image here, either as JSON with a data URL or as raw image bytes.
// The app crops it per platform, or draws the branded template if the image is missing or broken.
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
  const runRow = await get<{ organisation: string; title: string | null }>("SELECT organisation, title FROM runs WHERE id = ?", runId ?? "");
  if (!runRow) return NextResponse.json({ error: "unknown run" }, { status: 404 });
  const saved = await saveRunImage({
    runId, source: meta.source ?? "template", data, prompt: meta.prompt,
    title: meta.title || runRow.title || "School event", date: meta.date ?? "", organisation: runRow.organisation, note: meta.note,
  });
  publish({ type: "run", runId });
  return NextResponse.json(saved);
});
