import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createRun } from "@/app/api/runs/route";
import { GET as getRun } from "@/app/api/runs/[id]/route";
import { POST as postEvent } from "@/app/api/internal/runs/[id]/events/route";
import { POST as internalDecision } from "@/app/api/internal/decisions/route";
import { POST as appDecision } from "@/app/api/drafts/[id]/decision/route";
import { POST as publish } from "@/app/api/drafts/[id]/publish/route";
import { POST as internalPost } from "@/app/api/internal/posts/[id]/route";
import { PUT as putSettings } from "@/app/api/settings/route";
import { GET as getCosts } from "@/app/api/costs/route";
import { GET as getPrompts } from "@/app/api/internal/prompts/route";
import type { RunDetail } from "@/lib/types";

const SECRET: Record<string, string> = { "x-postpilot-secret": "test-secret", "content-type": "application/json" };
const ctx = <T,>(p: T) => ({ params: Promise.resolve(p) });
const json = (body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request("http://app.test/x", { method: "POST", headers, body: JSON.stringify(body) });

// Every call to an n8n webhook is recorded instead of sent
const webhookCalls: { path: string; body: Record<string, unknown> }[] = [];

beforeEach(() => {
  webhookCalls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    webhookCalls.push({ path: String(url).replace("http://n8n.test/webhook/", ""), body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(JSON.stringify({ message: "Workflow was started" }), { status: 200 });
  }));
});

async function settings(patch: Record<string, unknown>) {
  await putSettings(new Request("http://app.test/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }));
}

async function newRun(platforms = ["facebook", "linkedin"]) {
  const res = await createRun(json({ brief: "Science fair on Friday 14 November 2026 from 9:00 in the courtyard.", organisation: "Lycée Test", preset: "formal-school", platforms }));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function event(runId: string, body: Record<string, unknown>, headers = SECRET) {
  return postEvent(json(body, headers), ctx({ id: runId }));
}

async function detail(runId: string): Promise<RunDetail> {
  return (await getRun(new Request("http://app.test"), ctx({ id: runId }))).json();
}

// Simulates the Generate drafts workflow reporting back
async function generate(runId: string, trap?: { platform: string; quote: string }) {
  for (const p of ["facebook", "linkedin"]) {
    await event(runId, {
      step: `draft_${p}`, status: "done", cost: 0.001,
      data: { text: `Join us on Friday 15 November! (${p})`, hashtags: ["#Science"], trap: trap?.platform === p ? { quote: trap.quote, explanation: "The brief says 14 November." } : null },
    });
  }
  await event(runId, { step: "safety", status: "done", data: { drafts: [{ platform: "facebook", flags: [{ quote: "Join us", category: "tone", explanation: "test" }] }] } });
}

describe("internal routes", () => {
  it("refuse calls without the shared secret", async () => {
    const id = await newRun();
    expect((await event(id, { step: "brief", status: "running" }, { "content-type": "application/json" })).status).toBe(401);
    expect((await getPrompts(new Request("http://app.test"))).status).toBe(401);
  });

  it("serve prompt files and presets to n8n", async () => {
    const res = await getPrompts(new Request("http://app.test", { headers: SECRET }));
    const body = await res.json();
    expect(body.prompts["draft-system"]).toContain("PostPilot");
    expect(Object.keys(body.presets)).toEqual(["formal-school", "sports-team", "student-club"]);
  });
});

describe("run lifecycle", () => {
  it("starts the Generate workflow with the current settings", async () => {
    await settings({ trap: false, model: "test/model" });
    const id = await newRun();
    expect(webhookCalls[0].path).toBe("postpilot-generate");
    expect(webhookCalls[0].body).toMatchObject({ runId: id, model: "test/model", trapPlatform: null });
  });

  it("stores drafts and flags, then waits for approval", async () => {
    const id = await newRun();
    await generate(id);
    const run = await detail(id);
    expect(run.status).toBe("awaiting_approval");
    expect(run.drafts).toHaveLength(2);
    expect(run.drafts.find((d) => d.platform === "facebook")!.safetyFlags).toHaveLength(1);
    expect(run.events.at(-1)).toMatchObject({ step: "approval", status: "done" });
  });

  it("rejects a run with an invalid brief", async () => {
    const res = await createRun(json({ brief: "short", organisation: "X", preset: "formal-school", platforms: [] }));
    expect(res.status).toBe(400);
  });
});

describe("telegram", () => {
  it("asks every person listed in TELEGRAM_CHAT_ID for approval", async () => {
    vi.stubEnv("TELEGRAM_CHAT_ID", "111, 222");
    await settings({ telegram: true, trap: false });
    const id = await newRun(["facebook"]);
    await event(id, { step: "draft_facebook", status: "done", data: { text: "Join us on Friday 14 November!", hashtags: [] } });
    await event(id, { step: "safety", status: "done", data: { drafts: [] } });
    const asks = webhookCalls.filter((c) => c.path === "postpilot-approval");
    expect(asks.map((c) => c.body.chatId)).toEqual(["111", "222"]);
    expect(asks[0].body.draftId).toBe(asks[1].body.draftId);
    await settings({ telegram: false });
    vi.unstubAllEnvs();
  });
});

describe("decisions", () => {
  it("accept the first decision and ignore the later one", async () => {
    const id = await newRun();
    await generate(id);
    const draft = (await detail(id)).drafts[0];
    const first = await appDecision(json({ decision: "approve" }), ctx({ id: draft.id }));
    expect(first.status).toBe(200);
    const late = await internalDecision(json({ draftId: draft.id, decision: "reject", source: "telegram" }, SECRET));
    expect(await late.json()).toMatchObject({ accepted: false });
    const after = (await detail(id)).drafts.find((d) => d.id === draft.id)!;
    expect(after.status).toBe("approved");
    expect(after.decision).toMatchObject({ decision: "approve", source: "app" });
  });

  it("record where a Telegram decision came from", async () => {
    const id = await newRun();
    await generate(id);
    const draft = (await detail(id)).drafts[1];
    await internalDecision(json({ draftId: draft.id, decision: "approve", source: "telegram" }, SECRET));
    expect((await detail(id)).drafts[1].decision?.source).toBe("telegram");
  });

  it("start a redraft on rejection and keep version history", async () => {
    const id = await newRun();
    await generate(id);
    const fb = (await detail(id)).drafts.find((d) => d.platform === "facebook")!;
    await appDecision(json({ decision: "reject", reason: "Wrong date" }), ctx({ id: fb.id }));
    const call = webhookCalls.find((c) => c.path === "postpilot-redraft")!;
    expect(call.body).toMatchObject({ draftId: fb.id, reason: "Wrong date", platform: "facebook" });
    await event(id, { step: "redraft_facebook", status: "done", data: { text: "Join us on Friday 14 November!", hashtags: [], flags: [] } });
    const versions = (await detail(id)).drafts.filter((d) => d.platform === "facebook");
    expect(versions.map((v) => [v.version, v.status])).toEqual([[1, "rejected"], [2, "pending"]]);
  });

  it("keep the demo trap hidden until the draft is rejected", async () => {
    const id = await newRun();
    await generate(id, { platform: "linkedin", quote: "15 November" });
    const li = (await detail(id)).drafts.find((d) => d.platform === "linkedin")!;
    expect(li.trap).toBeNull();
    expect(JSON.stringify(await (await getRun(new Request("http://app.test"), ctx({ id }))).json())).not.toContain("brief says 14");
    await appDecision(json({ decision: "reject", reason: "wrong date" }), ctx({ id: li.id }));
    const rejected = (await detail(id)).drafts.find((d) => d.id === li.id)!;
    expect(rejected.trap).toMatchObject({ quote: "15 November" });
  });
});

describe("publishing", () => {
  async function approvedDraft() {
    const id = await newRun(["facebook"]);
    await event(id, { step: "draft_facebook", status: "done", data: { text: "Hello parents!", hashtags: [] } });
    await event(id, { step: "safety", status: "done", data: { drafts: [] } });
    const d = (await detail(id)).drafts[0];
    await appDecision(json({ decision: "approve" }), ctx({ id: d.id }));
    return { runId: id, draftId: d.id };
  }

  it("refuses to publish a draft that is not approved", async () => {
    const id = await newRun(["facebook"]);
    await event(id, { step: "draft_facebook", status: "done", data: { text: "Hello parents!", hashtags: [] } });
    const d = (await detail(id)).drafts[0];
    const res = await publish(json({ when: "now" }), ctx({ id: d.id }));
    expect(res.status).toBe(400);
  });

  it("validates the Facebook scheduling window in Real mode", async () => {
    await settings({ mock: false });
    const { draftId } = await approvedDraft();
    const soon = new Date(Date.now() + 5 * 60000).toISOString();
    const res = await publish(json({ when: soon }), ctx({ id: draftId }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("10 minutes");
    await settings({ mock: true });
  });

  it("publishes in Mock mode and records the result from n8n", async () => {
    await settings({ mock: true });
    const { runId, draftId } = await approvedDraft();
    const res = await publish(json({ when: "now" }), ctx({ id: draftId }));
    const post = await res.json();
    expect(post.status).toBe("publishing");
    expect(webhookCalls.find((c) => c.path === "postpilot-publish")!.body).toMatchObject({ postId: post.id, mock: true, scheduledAt: null });
    await internalPost(json({ status: "published", externalId: "mock_1", url: `/mock-post/${post.id}` }, SECRET), ctx({ id: post.id }));
    const run = await detail(runId);
    expect(run.posts[0]).toMatchObject({ status: "published", externalId: "mock_1" });
    expect(run.status).toBe("published");
    const again = await publish(json({ when: "now" }), ctx({ id: draftId }));
    expect(again.status).toBe(400);
  });
});

describe("costs", () => {
  it("adds up OpenRouter costs per run", async () => {
    const id = await newRun();
    await event(id, { step: "brief", status: "done", cost: 0.002 });
    await event(id, { step: "image", status: "done", cost: 0.03 });
    const res = await getCosts(new Request(`http://app.test/api/costs?runId=${id}`));
    const c = await res.json();
    expect(c.runUsd).toBeCloseTo(0.032);
    expect(c.todayUsd).toBeGreaterThanOrEqual(0.032);
  });
});
