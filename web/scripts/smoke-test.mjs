// Smoke test against a running PostPilot (local or deployed).
// Light (default in CI): health, sign-in, pages, settings and n8n workflows.
// Full (SMOKE_FULL=true): also the whole agent story in Mock mode with real OpenRouter calls:
// brief → drafts → reject + redraft → approve → publish now + schedule → report. Settings are restored afterwards.
// Env: APP_URL (default http://localhost:3000), SMOKE_EMAIL / SMOKE_PASSWORD (fall back to ADMIN_*), SMOKE_MODEL.
const APP = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.SMOKE_EMAIL || process.env.ADMIN_EMAIL;
const PASSWORD = process.env.SMOKE_PASSWORD || process.env.ADMIN_PASSWORD;
const FULL = process.env.SMOKE_FULL === "true";
const started = Date.now();
let cookie = "";

const log = (msg) => console.log(`[${((Date.now() - started) / 1000).toFixed(0).padStart(4)}s] ${msg}`);

async function call(path, method = "GET", body) {
  const headers = { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) };
  const res = await fetch(APP + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${json.error ?? ""}`);
  return json;
}

async function waitFor(label, fn, timeoutS) {
  const end = Date.now() + timeoutS * 1000;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

const latest = (run, platform) => run.drafts.filter((d) => d.platform === platform).at(-1);

async function fullStory(config) {
  const before = await call("/api/settings");
  const model = process.env.SMOKE_MODEL ?? config.defaultModel;
  await call("/api/settings", "PUT", { mock: true, telegram: false, trap: false, model });
  log(`Settings: Mock publishing, model ${model}`);
  try {
    const ex = config.examples[0];
    const { id } = await call("/api/runs", "POST", { brief: ex.brief, organisation: ex.organisation, preset: ex.preset, platforms: ["facebook", "linkedin"] });
    log(`Run created: ${APP}/runs/${id}`);

    let run = await waitFor("drafts + safety check", async () => {
      const r = await call(`/api/runs/${id}`);
      if (r.status === "failed") throw new Error(`Run failed: ${r.error}`);
      return r.status === "awaiting_approval" ? r : null;
    }, 300);
    log(`Drafts ready: ${run.drafts.map((d) => `${d.platform} (${d.text.split(/\s+/).length} words, ${d.safetyFlags.length} flags)`).join(", ")}`);
    if (!run.image) throw new Error("No image was saved");
    log(`Image: ${run.image.source}`);

    await call(`/api/drafts/${latest(run, "facebook").id}/decision`, "POST", { decision: "reject", reason: "Make it shorter and more formal" });
    log("Rejected the Facebook draft; waiting for v2");
    run = await waitFor("Facebook v2", async () => {
      const r = await call(`/api/runs/${id}`);
      return latest(r, "facebook").version >= 2 ? r : null;
    }, 180);

    for (const p of ["facebook", "linkedin"]) await call(`/api/drafts/${latest(run, p).id}/decision`, "POST", { decision: "approve" });
    log("Approved both drafts");

    await call(`/api/drafts/${latest(run, "facebook").id}/publish`, "POST", { when: "now" });
    await call(`/api/drafts/${latest(run, "linkedin").id}/publish`, "POST", { when: new Date(Date.now() + 75 * 1000).toISOString() });
    log("Facebook: post now. LinkedIn: scheduled in 75 s");
    run = await waitFor("both posts published", async () => {
      const r = await call(`/api/runs/${id}`);
      if (r.posts.some((p) => p.status === "failed")) throw new Error("A post failed: " + r.posts.map((p) => p.error).join("; "));
      return r.posts.length === 2 && r.posts.every((p) => p.status === "published") ? r : null;
    }, 200);
    log("Both posts published (mock)");

    const count = (await call("/api/reports")).length;
    await call("/api/reports", "POST");
    const reports = await waitFor("weekly report", async () => {
      const r = await call("/api/reports");
      return r.length > count ? r : null;
    }, 180);
    log(`Report: "${reports[0].title}"`);
    const costs = await call(`/api/costs?runId=${id}`);
    log(`Cost of this run: $${costs.runUsd.toFixed(4)} (${Math.round(costs.runUsd * config.fcfaPerUsd)} FCFA)`);
  } finally {
    await call("/api/settings", "PUT", before);
    log("Settings restored");
  }
}

try {
  log(`Testing ${APP}${FULL ? " (full story)" : ""}`);
  const health = await fetch(`${APP}/api/health`).then((r) => r.json());
  if (!health.ok) throw new Error("/api/health is not ok");
  log("Health: app and database are up");

  const unauth = await fetch(`${APP}/api/settings`);
  if (unauth.status !== 401) throw new Error(`API answered ${unauth.status} without a session (expected 401)`);
  const page = await fetch(`${APP}/dashboard`, { redirect: "manual" });
  if (![307, 308].includes(page.status) || !page.headers.get("location")?.includes("/login")) throw new Error("Pages are not protected by the login");
  log("Without a session: API refused, pages redirect to /login");

  if (!EMAIL || !PASSWORD) {
    log("SMOKE_EMAIL / SMOKE_PASSWORD not set: skipping the signed-in checks");
  } else {
    const res = await fetch(`${APP}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
    if (!res.ok) throw new Error(`Sign-in failed (${res.status})`);
    cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
    log(`Signed in as ${EMAIL}`);

    const config = await call("/api/config");
    await call("/api/settings");
    const n8n = await call("/api/health/n8n");
    if (!n8n.ok) throw new Error(`n8n: ${n8n.message}`);
    log("n8n is running and the workflows are active");
    const home = await fetch(`${APP}/`, { headers: { cookie } });
    if (!home.ok) throw new Error(`Home page answered ${home.status}`);
    log("Pages load when signed in");

    if (FULL) await fullStory(config);
    await call("/api/auth/logout", "POST");
  }
  log("SMOKE TEST PASSED");
} catch (err) {
  log(`SMOKE TEST FAILED: ${err.message}`);
  process.exit(1);
}
