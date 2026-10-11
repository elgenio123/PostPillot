// Creates the n8n owner account from .env on first launch, so nobody has to fill in the setup form.
const base = `http://localhost:${process.env.N8N_PORT ?? 5678}`;
const email = process.env.N8N_OWNER_EMAIL;
const password = process.env.N8N_OWNER_PASSWORD;
const log = (msg) => console.log(`[postpilot] ${msg}`);

// Waits until the REST API answers (it starts a few seconds after /healthz)
async function waitForN8n() {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`${base}/rest/settings`);
      if (res.ok && (res.headers.get("content-type") ?? "").includes("json")) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

if (!email || !password) {
  log("N8N_OWNER_EMAIL / N8N_OWNER_PASSWORD not set; create the owner in the browser on first visit");
} else if (await waitForN8n()) {
  const settings = await fetch(`${base}/rest/settings`).then((r) => r.json()).catch(() => null);
  const needsSetup = settings?.data?.userManagement?.showSetupOnFirstLoad;
  if (needsSetup === false) {
    log("n8n owner already exists");
  } else {
    const res = await fetch(`${base}/rest/owner/setup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, firstName: "PostPilot", lastName: "Demo" }),
    });
    log(res.ok ? `n8n owner created: ${email}` : `Owner setup failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
} else {
  log("n8n did not start in time; owner not created");
}
