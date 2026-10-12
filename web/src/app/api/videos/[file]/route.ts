import fs from "node:fs";
import path from "node:path";
import { VIDEO_DIR } from "@/lib/videos";
import type { Ctx } from "@/lib/http";

// Serves videos with byte ranges: browsers need them to seek, and n8n uploads LinkedIn videos in parts
export async function GET(req: Request, { params }: Ctx<{ file: string }>) {
  const file = path.basename((await params).file);
  const full = path.join(VIDEO_DIR, file);
  if (!/^[\w-]+\.(mp4|jpg)$/.test(file) || !fs.existsSync(full)) return new Response("Not found", { status: 404 });
  const size = fs.statSync(full).size;
  const type = file.endsWith(".mp4") ? "video/mp4" : "image/jpeg";
  const headers = { "content-type": type, "accept-ranges": "bytes", "cache-control": "public, max-age=31536000, immutable" };

  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (!m || (!m[1] && !m[2])) {
    return new Response(new Uint8Array(fs.readFileSync(full)), { headers: { ...headers, "content-length": String(size) } });
  }
  // "bytes=500-" means from 500 to the end; "bytes=-500" means the last 500 bytes
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  const chunk = Buffer.alloc(end - start + 1);
  const fd = fs.openSync(full, "r");
  try { fs.readSync(fd, chunk, 0, chunk.length, start); } finally { fs.closeSync(fd); }
  return new Response(new Uint8Array(chunk), {
    status: 206,
    headers: { ...headers, "content-length": String(chunk.length), "content-range": `bytes ${start}-${end}/${size}` },
  });
}
