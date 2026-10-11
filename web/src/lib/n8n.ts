const base = () => process.env.N8N_INTERNAL_URL ?? "http://localhost:5678";

// Starts an n8n workflow through its webhook; the shared secret proves the call comes from the app
export async function callWebhook(path: string, body: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${base()}/webhook/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-postpilot-secret": process.env.POSTPILOT_SECRET ?? "" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw new Error(`n8n is not reachable (${(err as Error).message}). Is the n8n container running?`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`n8n webhook "${path}" answered ${res.status}. Is the workflow active? ${text.slice(0, 200)}`);
  }
  return res.json().catch(() => ({}));
}

export async function n8nHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${base()}/healthz`, { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}
