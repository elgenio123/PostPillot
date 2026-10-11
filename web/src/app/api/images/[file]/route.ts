import fs from "node:fs";
import path from "node:path";
import { IMAGE_DIR } from "@/lib/images";
import type { Ctx } from "@/lib/http";

export async function GET(_req: Request, { params }: Ctx<{ file: string }>) {
  const file = path.basename((await params).file);
  const full = path.join(IMAGE_DIR, file);
  if (!/^[\w-]+\.(png|jpg)$/.test(file) || !fs.existsSync(full)) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(full)), {
    headers: { "content-type": file.endsWith(".png") ? "image/png" : "image/jpeg", "cache-control": "public, max-age=31536000, immutable" },
  });
}
