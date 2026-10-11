import { all, get, newId, now, run, tx } from "./db";
import { publish } from "./bus";
import { callWebhook } from "./n8n";
import { getSettings } from "./settings";
import { WORKFLOWS, n8nPublicUrl, type Platform } from "./config";
import { scheduleError, type Draft, type Post, type RunDetail, type SafetyFlag } from "./types";

interface RunRow {
  id: string; brief: string; organisation: string; preset: string; platforms: string; model: string;
  mock: number; telegram: number; trap: number; status: string; title: string | null;
  execution_id: string | null; error: string | null; created_at: string;
}
interface DraftRow {
  id: string; run_id: string; platform: Platform; version: number; text: string; hashtags: string;
  status: Draft["status"]; source: Draft["source"]; safety_flags: string; safety_checked: number;
  trap_planted: number; trap_quote: string | null; trap_explanation: string | null; reason: string | null; created_at: string;
}
interface DecisionRow { draft_id: string; decision: "approve" | "reject"; reason: string | null; source: "app" | "telegram"; created_at: string }
interface PostRow {
  id: string; draft_id: string; run_id: string; platform: Platform; status: Post["status"]; scheduled_at: string | null;
  published_at: string | null; external_id: string | null; url: string | null; mock: number; error: string | null; created_at: string;
}

export class UserError extends Error {}

export function toPost(r: PostRow): Post {
  return {
    id: r.id, draftId: r.draft_id, runId: r.run_id, platform: r.platform, status: r.status,
    scheduledAt: r.scheduled_at, publishedAt: r.published_at, externalId: r.external_id, url: r.url,
    mock: !!r.mock, error: r.error, createdAt: r.created_at,
  };
}

function toDraft(r: DraftRow, decision?: DecisionRow): Draft {
  return {
    id: r.id, runId: r.run_id, platform: r.platform, version: r.version, text: r.text,
    hashtags: JSON.parse(r.hashtags), status: r.status, source: r.source,
    safetyFlags: JSON.parse(r.safety_flags), safetyChecked: !!r.safety_checked, reason: r.reason, createdAt: r.created_at,
    // The planted mistake is revealed only after the human rejected that draft
    trap: r.trap_planted && r.status === "rejected" ? { quote: r.trap_quote ?? "", explanation: r.trap_explanation ?? "" } : null,
    decision: decision
      ? { decision: decision.decision, reason: decision.reason, source: decision.source, createdAt: decision.created_at }
      : null,
  };
}

const getRun = (id: string) => get<RunRow>("SELECT * FROM runs WHERE id = ?", id);
const getDraft = (id: string) => get<DraftRow>("SELECT * FROM drafts WHERE id = ?", id);

export async function addCost(runId: string | null, usd: number, label: string) {
  if (!usd || usd <= 0) return;
  await run("INSERT INTO costs (run_id, usd, label, created_at) VALUES (?, ?, ?, ?)", runId, usd, label, now());
  publish({ type: "cost", runId: runId ?? undefined });
}

export async function addEvent(runId: string, step: string, status: string, message?: string | null, extra?: { workflow?: string; executionId?: string }) {
  await run(
    "INSERT INTO events (run_id, step, status, message, workflow, execution_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    runId, step, status, message ?? null, extra?.workflow ?? null, extra?.executionId ?? null, now(),
  );
  publish({ type: "event", runId, step, status, message: message ?? undefined });
}

async function setRunStatus(runId: string, status: string, error?: string) {
  await run("UPDATE runs SET status = ?, error = COALESCE(?, error) WHERE id = ?", status, error ?? null, runId);
  publish({ type: "run", runId });
}

export interface NewRun { brief: string; organisation: string; preset: string; platforms: Platform[] }

export async function createRun(input: NewRun): Promise<string> {
  const s = await getSettings();
  const id = newId();
  // The trap goes into one randomly chosen platform so the demonstrator has to read carefully
  const trapPlatform = s.trap ? input.platforms[Math.floor(Math.random() * input.platforms.length)] : null;
  await run(
    `INSERT INTO runs (id, brief, organisation, preset, platforms, model, mock, telegram, trap, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'generating', ?)`,
    id, input.brief, input.organisation, input.preset, JSON.stringify(input.platforms), s.model,
    s.mock ? 1 : 0, s.telegram ? 1 : 0, s.trap ? 1 : 0, now(),
  );
  try {
    await callWebhook("postpilot-generate", {
      runId: id, brief: input.brief, organisation: input.organisation, preset: input.preset,
      platforms: input.platforms, model: s.model, trapPlatform,
    });
  } catch (err) {
    await addEvent(id, "brief", "failed", (err as Error).message);
    await setRunStatus(id, "failed", (err as Error).message);
  }
  return id;
}

export async function listRuns() {
  const rows = await all<RunRow & { cost: number }>(
    `SELECT r.*, COALESCE((SELECT SUM(usd) FROM costs c WHERE c.run_id = r.id), 0) AS cost
     FROM runs r ORDER BY r.created_at DESC LIMIT 50`,
  );
  return rows.map((r) => ({
    id: r.id, title: r.title, organisation: r.organisation, status: r.status, model: r.model, mock: !!r.mock,
    platforms: JSON.parse(r.platforms) as Platform[], createdAt: r.created_at, costUsd: Number(r.cost), brief: r.brief,
  }));
}

export async function getRunDetail(id: string): Promise<RunDetail | null> {
  const r = await getRun(id);
  if (!r) return null;
  const [decisionRows, draftRows, img, cost, events, posts] = await Promise.all([
    all<DecisionRow>("SELECT d.* FROM decisions d JOIN drafts x ON x.id = d.draft_id WHERE x.run_id = ?", id),
    all<DraftRow>("SELECT * FROM drafts WHERE run_id = ? ORDER BY platform, version", id),
    get<{ source: string; original: string; facebook: string; linkedin: string; note: string | null }>(
      "SELECT * FROM images WHERE run_id = ? ORDER BY created_at DESC LIMIT 1", id,
    ),
    get<{ total: number }>("SELECT COALESCE(SUM(usd), 0) AS total FROM costs WHERE run_id = ?", id),
    all<{ id: number; step: string; status: string; message: string | null; created_at: string }>(
      "SELECT * FROM events WHERE run_id = ? ORDER BY id", id,
    ),
    all<PostRow>("SELECT * FROM posts WHERE run_id = ? ORDER BY created_at", id),
  ]);
  const decisions = new Map(decisionRows.map((d) => [d.draft_id, d]));
  const base = n8nPublicUrl();
  return {
    id: r.id, brief: r.brief, organisation: r.organisation, preset: r.preset, platforms: JSON.parse(r.platforms),
    model: r.model, mock: !!r.mock, telegram: !!r.telegram, trap: !!r.trap, status: r.status, title: r.title,
    error: r.error, createdAt: r.created_at, costUsd: Number(cost?.total ?? 0),
    workflowUrl: `${base}/workflow/${WORKFLOWS.generate}`,
    executionUrl: r.execution_id ? `${base}/workflow/${WORKFLOWS.generate}/executions/${r.execution_id}` : null,
    drafts: draftRows.map((d) => toDraft(d, decisions.get(d.id))),
    events: events.map((e) => ({ id: e.id, step: e.step, status: e.status as RunDetail["events"][number]["status"], message: e.message, createdAt: e.created_at })),
    image: img
      ? {
          source: img.source as "openrouter", note: img.note,
          original: `/api/images/${img.original}`, facebook: `/api/images/${img.facebook}`, linkedin: `/api/images/${img.linkedin}`,
        }
      : null,
    posts: posts.map(toPost),
  };
}

function latestDraft(runId: string, platform: string) {
  return get<DraftRow>("SELECT * FROM drafts WHERE run_id = ? AND platform = ? ORDER BY version DESC LIMIT 1", runId, platform);
}

async function insertDraft(d: {
  runId: string; platform: string; text: string; hashtags?: string[]; source: Draft["source"];
  flags?: SafetyFlag[]; safetyChecked?: boolean; trap?: { quote: string; explanation: string } | null; reason?: string | null;
}): Promise<string> {
  const prev = await latestDraft(d.runId, d.platform);
  const id = newId();
  // Older pending versions are replaced by the new one
  if (prev && prev.status === "pending") await run("UPDATE drafts SET status = 'superseded' WHERE id = ?", prev.id);
  await run(
    `INSERT INTO drafts (id, run_id, platform, version, text, hashtags, status, source, safety_flags, safety_checked,
       trap_planted, trap_quote, trap_explanation, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, d.runId, d.platform, (prev?.version ?? 0) + 1, d.text, JSON.stringify(d.hashtags ?? []), d.source,
    JSON.stringify(d.flags ?? []), d.safetyChecked ? 1 : 0, d.trap ? 1 : 0, d.trap?.quote ?? null,
    d.trap?.explanation ?? null, d.reason ?? null, now(),
  );
  return id;
}

const cleanFlags = (flags: unknown): SafetyFlag[] =>
  Array.isArray(flags)
    ? flags
        .filter((f) => f && typeof f.quote === "string")
        .map((f) => ({ quote: String(f.quote), category: String(f.category ?? "other"), explanation: String(f.explanation ?? "") }))
    : [];

export interface IncomingEvent {
  step: string;
  status: "running" | "done" | "failed";
  message?: string;
  data?: Record<string, unknown>;
  cost?: number;
  executionId?: string;
  workflow?: string;
}

// Progress and results reported by n8n
export async function handleEvent(runId: string, e: IncomingEvent) {
  const r = await getRun(runId);
  if (!r) throw new UserError("unknown run");
  if (e.cost) await addCost(runId, Number(e.cost), e.step);
  if (e.executionId && e.workflow === WORKFLOWS.generate && !r.execution_id) {
    await run("UPDATE runs SET execution_id = ? WHERE id = ?", e.executionId, runId);
  }
  const data = e.data ?? {};

  if (typeof data.title === "string" && data.title.trim() && !r.title) {
    await run("UPDATE runs SET title = ? WHERE id = ?", data.title.trim(), runId);
  }

  if (e.step.startsWith("draft_") && e.status === "done" && typeof data.text === "string") {
    const trap = data.trap as { quote?: string; explanation?: string } | undefined;
    await insertDraft({
      runId, platform: e.step.slice(6), text: data.text, hashtags: (data.hashtags as string[]) ?? [], source: "agent",
      trap: trap?.quote ? { quote: trap.quote, explanation: trap.explanation ?? "" } : null,
    });
  }

  if (e.step.startsWith("redraft_") && e.status === "done" && typeof data.text === "string") {
    await insertDraft({
      runId, platform: e.step.slice(8), text: data.text, hashtags: (data.hashtags as string[]) ?? [], source: "redraft",
      flags: cleanFlags(data.flags), safetyChecked: true, reason: (data.reason as string) ?? null,
    });
  }

  if (e.step === "safety" && e.status === "done") {
    const list = (data.drafts as { platform: string; flags: unknown }[]) ?? [];
    for (const p of JSON.parse(r.platforms) as string[]) {
      const d = await latestDraft(runId, p);
      const found = list.find((x) => x.platform === p);
      if (d) await run("UPDATE drafts SET safety_flags = ?, safety_checked = 1 WHERE id = ?", JSON.stringify(cleanFlags(found?.flags)), d.id);
    }
  }

  await addEvent(runId, e.step, e.status, e.message, { workflow: e.workflow, executionId: e.executionId });

  if (e.status === "failed" && (e.step.startsWith("draft_") || e.step === "brief")) {
    await setRunStatus(runId, "failed", e.message);
  }

  // Generation is finished once the safety check is done: hand over to the human
  if (e.step === "safety" && (e.status === "done" || e.status === "failed")) {
    await setRunStatus(runId, "awaiting_approval");
    const via = r.telegram ? "in the app and on Telegram" : "in the app";
    await addEvent(runId, "approval", "done", `Waiting for your decision ${via}`);
    if (r.telegram) await sendToTelegram(runId);
  }
  if (e.step.startsWith("redraft_") && e.status === "done" && r.telegram) {
    await sendToTelegram(runId, e.step.slice(8));
  }
  if (e.step.startsWith("redraft_")) publish({ type: "run", runId });
}

async function sendToTelegram(runId: string, onlyPlatform?: string) {
  const detail = await getRunDetail(runId);
  if (!detail) return;
  for (const d of detail.drafts) {
    if (d.status !== "pending" || (onlyPlatform && d.platform !== onlyPlatform)) continue;
    const img = detail.image ? (d.platform === "facebook" ? detail.image.facebook : detail.image.linkedin) : null;
    try {
      await callWebhook("postpilot-approval", {
        runId, draftId: d.id, platform: d.platform, version: d.version, text: d.text,
        organisation: detail.organisation, imagePath: img, flags: d.safetyFlags,
      });
    } catch (err) {
      await addEvent(runId, "approval", "failed", `Telegram not reached: ${(err as Error).message}`);
    }
  }
}

export interface DecisionResult { accepted: boolean; draft: Draft; existing?: string }

// First decision wins (app or Telegram); later ones are ignored
export async function decide(draftId: string, decision: "approve" | "reject", reason: string | null, source: "app" | "telegram"): Promise<DecisionResult> {
  const result = await tx(async () => {
    // Row lock: a simultaneous decision waits here, then sees the first one
    const d = await get<DraftRow>("SELECT * FROM drafts WHERE id = ? FOR UPDATE", draftId);
    if (!d) throw new UserError("Draft not found");
    const prior = await get<DecisionRow>("SELECT * FROM decisions WHERE draft_id = ?", draftId);
    if (prior || d.status !== "pending") {
      return { accepted: false, existing: prior ? `${prior.decision} from ${prior.source}` : d.status, d };
    }
    await run("INSERT INTO decisions (id, draft_id, decision, reason, source, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      newId(), draftId, decision, reason, source, now());
    await run("UPDATE drafts SET status = ? WHERE id = ?", decision === "approve" ? "approved" : "rejected", draftId);
    return { accepted: true, existing: undefined, d };
  });
  const d = result.d;
  if (result.accepted) {
    publish({ type: "decision", runId: d.run_id, draftId, platform: d.platform, decision, source });
    if (decision === "approve") await maybeMarkApproved(d.run_id);
    if (decision === "reject") await startRedraft(d, reason ?? "");
  }
  const fresh = (await getRunDetail(d.run_id))!.drafts.find((x) => x.id === draftId)!;
  return { accepted: result.accepted, draft: fresh, existing: result.existing };
}

async function maybeMarkApproved(runId: string) {
  const r = (await getRun(runId))!;
  const latest = await Promise.all((JSON.parse(r.platforms) as string[]).map((p) => latestDraft(runId, p)));
  if (latest.every((d) => d?.status === "approved") && r.status === "awaiting_approval") await setRunStatus(runId, "approved");
}

async function startRedraft(d: DraftRow, reason: string) {
  const r = (await getRun(d.run_id))!;
  const why = reason.trim() || "The reviewer rejected this draft. Check every fact against the brief and improve it.";
  await addEvent(r.id, `redraft_${d.platform}`, "running", `Rewriting: "${why}"`);
  try {
    await callWebhook("postpilot-redraft", {
      runId: r.id, draftId: d.id, platform: d.platform, previousText: d.text, reason: why,
      brief: r.brief, organisation: r.organisation, preset: r.preset, model: r.model,
    });
  } catch (err) {
    await addEvent(r.id, `redraft_${d.platform}`, "failed", (err as Error).message);
  }
}

// A human edit becomes a new version; flags that no longer match the text are dropped
export async function editDraft(draftId: string, text: string): Promise<string> {
  const d = await getDraft(draftId);
  if (!d) throw new UserError("Draft not found");
  if (d.status !== "pending") throw new UserError("Only drafts waiting for review can be edited");
  if (!text.trim()) throw new UserError("The post cannot be empty");
  const flags = cleanFlags(JSON.parse(d.safety_flags)).filter((f) => text.includes(f.quote));
  const trapStill = d.trap_planted && d.trap_quote && text.includes(d.trap_quote);
  const id = await insertDraft({
    runId: d.run_id, platform: d.platform, text, hashtags: JSON.parse(d.hashtags), source: "human_edit",
    flags, safetyChecked: !!d.safety_checked,
    trap: trapStill ? { quote: d.trap_quote!, explanation: d.trap_explanation ?? "" } : null,
  });
  publish({ type: "run", runId: d.run_id });
  return id;
}

export async function publishDraft(draftId: string, when: string): Promise<Post> {
  const d = await getDraft(draftId);
  if (!d) throw new UserError("Draft not found");
  if (d.status !== "approved") throw new UserError("Approve the draft before publishing");
  const r = (await getRun(d.run_id))!;
  const active = await get<PostRow>("SELECT * FROM posts WHERE draft_id = ? AND status != 'failed'", draftId);
  if (active) throw new UserError("This post is already published or scheduled");
  const mock = (await getSettings()).mock;

  let scheduledAt: string | null = null;
  if (when !== "now") {
    const date = new Date(when);
    const err = scheduleError(d.platform, mock, date);
    if (err) throw new UserError(err);
    scheduledAt = date.toISOString();
  }
  const img = await get<{ facebook: string; linkedin: string }>("SELECT * FROM images WHERE run_id = ? ORDER BY created_at DESC LIMIT 1", d.run_id);
  const id = newId();
  await run(
    `INSERT INTO posts (id, draft_id, run_id, platform, status, scheduled_at, mock, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id, draftId, d.run_id, d.platform, scheduledAt ? "scheduled" : "publishing", scheduledAt, mock ? 1 : 0, now(),
  );
  try {
    await callWebhook("postpilot-publish", {
      postId: id, runId: d.run_id, platform: d.platform, text: d.text, organisation: r.organisation,
      imagePath: img ? `/api/images/${d.platform === "facebook" ? img.facebook : img.linkedin}` : null,
      mock, scheduledAt,
      scheduledUnix: scheduledAt ? Math.floor(new Date(scheduledAt).getTime() / 1000) : null,
    });
  } catch (err) {
    await run("UPDATE posts SET status = 'failed', error = ? WHERE id = ?", (err as Error).message, id);
  }
  const post = toPost((await get<PostRow>("SELECT * FROM posts WHERE id = ?", id))!);
  publish({ type: "post", runId: d.run_id, postId: id, platform: d.platform, status: post.status });
  return post;
}

export async function updatePost(postId: string, p: { status: string; externalId?: string; url?: string; error?: string }) {
  const row = await get<PostRow>("SELECT * FROM posts WHERE id = ?", postId);
  if (!row) throw new UserError("unknown post");
  await run(
    `UPDATE posts SET status = ?, external_id = COALESCE(?, external_id), url = COALESCE(?, url), error = ?,
       published_at = CASE WHEN ? = 'published' THEN ? ELSE published_at END WHERE id = ?`,
    p.status, p.externalId ?? null, p.url ?? null, p.error ?? null, p.status, now(), postId,
  );
  if (p.status === "published") {
    const pending = (await get<{ n: number }>("SELECT COUNT(*)::int AS n FROM posts WHERE run_id = ? AND status != 'published'", row.run_id))!.n;
    if (pending === 0) await setRunStatus(row.run_id, "published");
  }
  publish({ type: "post", runId: row.run_id, postId, platform: row.platform, status: p.status });
}
