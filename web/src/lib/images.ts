import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { DATA_DIR, newId, now, run } from "./db";

export const IMAGE_DIR = path.join(DATA_DIR, "images");

// Per-platform sizes recommended for link/photo posts
const SIZES = { facebook: { width: 1200, height: 630 }, linkedin: { width: 1200, height: 627 } };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

// Splits a title into at most 3 lines of about `max` characters
function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if ((line + " " + word).trim().length > max && line) {
      lines.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

// Branded template: the last fallback, so it must never fail
export function templateSvg(title: string, date: string, organisation: string): string {
  const lines = wrap(title || "School event", 22);
  const titleY = 300 - (lines.length - 1) * 38;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#312E81"/><stop offset="0.6" stop-color="#3730A3"/><stop offset="1" stop-color="#0EA5E9"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1080" cy="90" r="220" fill="#F97316" opacity="0.9"/>
  <circle cx="1080" cy="90" r="150" fill="#FDBA74" opacity="0.5"/>
  <circle cx="140" cy="640" r="260" fill="#ffffff" opacity="0.06"/>
  <path d="M0 520 C 300 450, 600 600, 1200 470 L1200 630 L0 630 Z" fill="#ffffff" opacity="0.08"/>
  <text x="80" y="120" font-family="DejaVu Sans, sans-serif" font-size="30" font-weight="bold" fill="#FDBA74" letter-spacing="3">${esc(organisation.toUpperCase().slice(0, 48))}</text>
  ${lines.map((l, i) => `<text x="80" y="${titleY + i * 76}" font-family="DejaVu Sans, sans-serif" font-size="68" font-weight="bold" fill="#ffffff">${esc(l)}</text>`).join("\n  ")}
  ${date ? `<rect x="80" y="${titleY + lines.length * 76 - 20}" rx="28" width="${Math.min(1000, 60 + date.length * 20)}" height="60" fill="#F97316"/>
  <text x="110" y="${titleY + lines.length * 76 + 20}" font-family="DejaVu Sans, sans-serif" font-size="32" font-weight="bold" fill="#ffffff">${esc(date)}</text>` : ""}
  <text x="80" y="585" font-family="DejaVu Sans, sans-serif" font-size="24" fill="#E0E7FF">Made with PostPilot</text>
</svg>`;
}

export interface SavedImage { source: string; original: string; facebook: string; linkedin: string; note: string | null }

// Stores the image and creates one crop per platform; falls back to the template on any error
export async function saveRunImage(opts: {
  runId: string; source: string; data: Buffer | null; prompt?: string; title: string; date: string; organisation: string; note?: string;
}): Promise<SavedImage> {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  const id = newId();
  let source = opts.source;
  let note = opts.note ?? null;
  let input: Buffer;
  try {
    if (!opts.data || opts.data.length < 100) throw new Error("empty image");
    input = await sharp(opts.data).png().toBuffer();
  } catch (err) {
    if (opts.source !== "template") note = `${opts.source} image unusable (${(err as Error).message}), template used`;
    source = "template";
    input = await sharp(Buffer.from(templateSvg(opts.title, opts.date, opts.organisation))).png().toBuffer();
  }
  const files = { original: `${id}.png`, facebook: `${id}-facebook.jpg`, linkedin: `${id}-linkedin.jpg` };
  fs.writeFileSync(path.join(IMAGE_DIR, files.original), input);
  for (const p of ["facebook", "linkedin"] as const) {
    await sharp(input).resize({ ...SIZES[p], fit: "cover", position: sharp.strategy.attention }).jpeg({ quality: 88 })
      .toFile(path.join(IMAGE_DIR, files[p]));
  }
  await run(
    "INSERT INTO images (id, run_id, source, original, facebook, linkedin, prompt, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id, opts.runId, source, files.original, files.facebook, files.linkedin, opts.prompt ?? null, note, now(),
  );
  return { source, note, ...files };
}

export function decodeDataUrl(s: string): Buffer | null {
  const m = /^data:image\/[a-z+]+;base64,(.+)$/i.exec(s.trim());
  return m ? Buffer.from(m[1], "base64") : null;
}
