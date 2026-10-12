import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createRun } from "@/app/api/runs/route";
import { GET as getRun } from "@/app/api/runs/[id]/route";
import { POST as postEvent } from "@/app/api/internal/runs/[id]/events/route";
import { POST as saveVideo } from "@/app/api/internal/videos/route";
import { POST as saveImage } from "@/app/api/internal/images/route";
import { GET as getVideoFile } from "@/app/api/videos/[file]/route";
import { POST as appDecision } from "@/app/api/drafts/[id]/decision/route";
import { POST as publish } from "@/app/api/drafts/[id]/publish/route";
import { PUT as putSettings } from "@/app/api/settings/route";
import { VIDEO_DIR } from "@/lib/videos";
import type { RunDetail } from "@/lib/types";

const SECRET = { "x-postpilot-secret": "test-secret" };
const ctx = <T,>(p: T) => ({ params: Promise.resolve(p) });
const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://app.test/x", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

// The video tests need ffmpeg, which is in the Docker test image (scripts/test.sh)
const hasFfmpeg = (() => {
  try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch { return false; }
})();

const webhookCalls: { path: string; body: Record<string, unknown> }[] = [];
beforeEach(() => {
  webhookCalls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    webhookCalls.push({ path: String(url).replace("http://n8n.test/webhook/", ""), body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response("{}", { status: 200 });
  }));
});

async function newRun(extra: Record<string, unknown>) {
  return createRun(json({ brief: "Science fair on Friday 14 November 2026 from 9:00 in the courtyard.", organisation: "Lycée Test", preset: "formal-school", platforms: ["facebook"], ...extra }));
}
const detail = async (id: string): Promise<RunDetail> => (await getRun(new Request("http://app.test"), ctx({ id }))).json();

describe("video runs", () => {
  it("send the chosen media and length to the Generate workflow", async () => {
    const res = await newRun({ media: "video", videoSeconds: 8 });
    expect(res.status).toBe(201);
    const { id } = await res.json();
    expect(webhookCalls[0].body).toMatchObject({ runId: id, media: "video", videoSeconds: 8 });
    expect(await detail(id)).toMatchObject({ media: "video", videoSeconds: 8, video: null });
  });

  it("default to an image run", async () => {
    const { id } = await (await newRun({})).json();
    expect(webhookCalls[0].body).toMatchObject({ media: "image", videoSeconds: null });
    expect((await detail(id)).media).toBe("image");
  });

  it("refuse lengths outside 5 to 10 seconds", async () => {
    expect((await newRun({ media: "video", videoSeconds: 11 })).status).toBe(400);
    expect((await newRun({ media: "video", videoSeconds: 4 })).status).toBe(400);
  });

  it("refuse video uploads without the shared secret", async () => {
    const { id } = await (await newRun({ media: "video", videoSeconds: 10 })).json();
    const res = await saveVideo(new Request(`http://app.test/api/internal/videos?runId=${id}`, { method: "POST", body: "x" }));
    expect(res.status).toBe(401);
  });
});

describe("video files", () => {
  it("serve byte ranges for seeking and LinkedIn part uploads", async () => {
    fs.mkdirSync(VIDEO_DIR, { recursive: true });
    fs.writeFileSync(path.join(VIDEO_DIR, "range-test.mp4"), Buffer.from("0123456789"));
    const get = (range?: string) => getVideoFile(new Request("http://app.test", { headers: range ? { range } : {} }), ctx({ file: "range-test.mp4" }));

    const full = await get();
    expect(full.status).toBe(200);
    expect(await full.text()).toBe("0123456789");

    const part = await get("bytes=2-5");
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await part.text()).toBe("2345");

    expect(await (await get("bytes=7-")).text()).toBe("789");
    expect(await (await get("bytes=-3")).text()).toBe("789");
    expect((await get("bytes=20-30")).status).toBe(416);
    expect((await getVideoFile(new Request("http://app.test"), ctx({ file: "../secret.mp4" }))).status).toBe(404);
  });
});

describe.skipIf(!hasFfmpeg)("video fallback (ffmpeg)", () => {
  it("animate the branded template when the AI video is broken, then publish it as a video", async () => {
    await putSettings(new Request("http://app.test", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ mock: true, trap: false }) }));
    const { id } = await (await newRun({ media: "video", videoSeconds: 5 })).json();

    const res = await saveVideo(new Request(`http://app.test/api/internal/videos?runId=${id}&source=openrouter&aiCost=0.5`, {
      method: "POST", headers: SECRET, body: new Uint8Array(5000).fill(7),
    }));
    expect(res.status).toBe(200);
    const saved = await res.json();
    expect(saved).toMatchObject({ source: "animated-template", aiCost: 0.5 });
    expect(saved.message).toContain("animated");
    expect(saved.seconds).toBeGreaterThan(4);

    const run = await detail(id);
    expect(run.video).toMatchObject({ source: "animated-template", url: `/api/videos/${saved.file}` });
    const file = await getVideoFile(new Request("http://app.test"), ctx({ file: saved.file }));
    expect(file.headers.get("content-type")).toBe("video/mp4");

    // Draft → approve → publish: n8n receives the video, not an image
    await postEvent(json({ step: "draft_facebook", status: "done", data: { text: "Join us on Friday 14 November for our science fair!", hashtags: [] } }, SECRET), ctx({ id }));
    const draft = (await detail(id)).drafts[0];
    await appDecision(json({ decision: "approve" }), ctx({ id: draft.id }));
    await publish(json({ when: "now" }), ctx({ id: draft.id }));
    const call = webhookCalls.find((c) => c.path === "postpilot-publish")!;
    expect(call.body).toMatchObject({ mediaType: "video", mediaPath: `/api/videos/${saved.file}`, imagePath: null });
    expect(call.body.videoBytes).toBeGreaterThan(1000);
  }, 120000);

  it("animate the painted image when the video model failed", async () => {
    const { id } = await (await newRun({ media: "video", videoSeconds: 5 })).json();
    const res = await saveImage(json({ runId: id, source: "template", title: "Science fair", date: "14 November" }, SECRET));
    const saved = await res.json();
    expect(saved.video).toMatchObject({ source: "animated-template" });
    const run = await detail(id);
    expect(run.image).not.toBeNull();
    expect(run.video?.note).toContain("AI video unavailable");
  }, 120000);
});
