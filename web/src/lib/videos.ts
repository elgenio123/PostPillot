import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { DATA_DIR, newId, now, run } from "./db";
import { templateSvg } from "./images";

export const VIDEO_DIR = path.join(DATA_DIR, "videos");
const exec = promisify(execFile);

// ffmpeg is installed in the web image (web/Dockerfile)
async function ffmpeg(args: string[], timeoutMs = 240000) {
  await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 });
}

async function probe(file: string): Promise<{ codec: string; seconds: number }> {
  const { stdout } = await exec("ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name:format=duration", "-of", "json", file,
  ], { timeout: 30000 });
  const j = JSON.parse(stdout);
  const codec = j.streams?.[0]?.codec_name;
  if (!codec) throw new Error("no video stream");
  return { codec, seconds: Number(j.format?.duration ?? 0) };
}

// Slow zoom over a still image ("Ken Burns"), so a video post never fails
async function animate(image: Buffer, seconds: number, out: string) {
  const fps = 25;
  const tmp = path.join(os.tmpdir(), `pp-${newId()}.png`);
  // Crop to 16:9 first so the zoom does not stretch the picture
  await sharp(image).resize(1920, 1080, { fit: "cover", position: sharp.strategy.attention }).png().toFile(tmp);
  try {
    await ffmpeg([
      "-i", tmp,
      "-vf", `zoompan=z='min(zoom+0.0007,1.18)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${seconds * fps}:s=1280x720:fps=${fps},format=yuv420p`,
      "-t", String(seconds), "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-movflags", "+faststart", out,
    ]);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

// Social networks want H.264 MP4 with the index at the start; other codecs are converted
async function normalise(input: string, out: string) {
  const { codec } = await probe(input);
  const codecArgs = codec === "h264" ? ["-c", "copy"] : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac"];
  await ffmpeg(["-i", input, ...codecArgs, "-movflags", "+faststart", out]);
}

export interface SavedVideo { source: string; file: string; poster: string; seconds: number | null; bytes: number; note: string | null }

// Stores an AI video, or animates `image` (or the branded template) when there is no usable video
export async function saveRunVideo(opts: {
  runId: string; source: string; seconds: number; data?: Buffer | null; image?: Buffer | null;
  prompt?: string; title: string; date: string; organisation: string; note?: string | null;
}): Promise<SavedVideo> {
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
  const id = newId();
  const files = { file: `${id}.mp4`, poster: `${id}-poster.jpg` };
  const out = path.join(VIDEO_DIR, files.file);
  let source = opts.source;
  let note = opts.note ?? null;

  let done = false;
  if (opts.data && opts.data.length > 1000) {
    const raw = path.join(os.tmpdir(), `pp-${id}.bin`);
    fs.writeFileSync(raw, opts.data);
    try {
      await normalise(raw, out);
      done = true;
    } catch (err) {
      note = `${source} video unusable (${(err as Error).message.split("\n")[0].slice(0, 120)}), animated image used`;
    } finally {
      fs.rmSync(raw, { force: true });
    }
  }
  if (!done) {
    let image = opts.image ?? null;
    if (!image) {
      image = await sharp(Buffer.from(templateSvg(opts.title, opts.date, opts.organisation))).png().toBuffer();
      if (!source.startsWith("animated-")) source = "animated-template";
    }
    await animate(image, opts.seconds, out);
  }

  const { seconds } = await probe(out).catch(() => ({ seconds: opts.seconds }));
  await ffmpeg(["-ss", String(Math.min(1, seconds / 2)), "-i", out, "-frames:v", "1", "-q:v", "3", path.join(VIDEO_DIR, files.poster)]);
  const bytes = fs.statSync(out).size;
  await run(
    "INSERT INTO videos (id, run_id, source, file, poster, seconds, bytes, prompt, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id, opts.runId, source, files.file, files.poster, seconds || null, bytes, opts.prompt ?? null, note, now(),
  );
  return { source, ...files, seconds: seconds || null, bytes, note };
}


// Progress line shown in the app timeline once the video is saved
export function videoMessage(source: string, seconds: number | null) {
  const len = seconds ? ` (${Math.round(seconds)} s)` : "";
  return source === "openrouter" ? `Video ready from the OpenRouter video model${len}` : `The AI video was not available, so the image was animated instead${len}`;
}
