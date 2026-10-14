import { NextResponse } from "next/server";
import { n8nHealthy } from "@/lib/n8n";
import { telegramChatIds } from "@/lib/config";
import type { Ctx } from "@/lib/http";

export const dynamic = "force-dynamic";

// configured: false means an optional service has no keys yet (shown as "Not set up", not as an error)
type Check = { ok: boolean; message: string; configured?: boolean };

async function getJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

const env = (k: string) => process.env[k]?.trim() ?? "";

// `send` is true only when the demonstrator clicks Test, so opening Settings sends nothing
const checks: Record<string, (send: boolean) => Promise<Check>> = {
  async n8n() {
    if (!(await n8nHealthy())) return { ok: false, message: "n8n is not answering. Run: docker compose up -d n8n" };
    const base = process.env.N8N_INTERNAL_URL ?? "http://localhost:5678";
    // An empty POST without the secret is refused by the workflow but proves the webhook is registered
    const res = await fetch(`${base}/webhook/postpilot-generate`, { method: "POST", signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (!res || res.status === 404) return { ok: false, message: "n8n runs, but the PostPilot workflows are not active" };
    return { ok: true, message: "n8n is running and the workflows are active" };
  },
  async openrouter() {
    if (!env("OPENROUTER_API_KEY")) return { ok: false, message: "OPENROUTER_API_KEY is empty in .env" };
    const r = await getJson("https://openrouter.ai/api/v1/key", { headers: { authorization: `Bearer ${env("OPENROUTER_API_KEY")}` } });
    if (!r.ok) return { ok: false, message: `OpenRouter refused the key (${r.status})` };
    const d = r.body.data ?? {};
    const limit = d.limit == null ? "no limit set" : `limit $${d.limit}`;
    return { ok: true, message: `Key works. Used $${Number(d.usage ?? 0).toFixed(4)}, ${limit}` };
  },
  async telegram(send) {
    if (!env("TELEGRAM_BOT_TOKEN") || !env("TELEGRAM_CHAT_ID")) return { ok: false, configured: false, message: "Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to .env to approve from your phone" };
    const r = await getJson(`https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/getMe`);
    if (!r.ok) return { ok: false, message: "Telegram refused the bot token" };
    const bot = r.body.result?.username;
    const ids = telegramChatIds();
    // A common mistake: the number before ":" in the token is the bot's own ID, not yours
    if (ids.includes(env("TELEGRAM_BOT_TOKEN").split(":")[0])) {
      return { ok: false, message: `TELEGRAM_CHAT_ID contains the bot's own ID. Use each person's ID from @userinfobot, after they press Start in @${bot}` };
    }
    const who = ids.length > 1 ? `${ids.length} people` : "you";
    if (!send) return { ok: true, message: `Bot @${bot} is ready for ${who}. Click Test to send a test message.` };
    // Sends a real test message to each person, so "connected" means every phone actually receives it
    const failed: string[] = [];
    for (const chatId of ids) {
      const sent = await getJson(`https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: "✅ PostPilot test: Telegram approval is connected." }),
      });
      if (!sent.ok) failed.push(`${chatId} (${sent.body.description ?? `error ${sent.status}`})`);
    }
    if (failed.length) {
      return { ok: false, message: `@${bot} cannot write to ${failed.join(", ")}. Each person must open @${bot} and press Start; also check the IDs.` };
    }
    return { ok: true, message: `Test message sent by @${bot} to ${who}. Check the phone${ids.length > 1 ? "s" : ""}.` };
  },
  async facebook() {
    if (!env("FB_PAGE_ID") || !env("FB_PAGE_TOKEN")) return { ok: false, configured: false, message: "Add FB_PAGE_ID and FB_PAGE_TOKEN to .env for Real publishing (not needed in Mock mode)" };
    const v = env("FB_GRAPH_VERSION") || "v23.0";
    const r = await getJson(`https://graph.facebook.com/${v}/${env("FB_PAGE_ID")}?fields=name&access_token=${env("FB_PAGE_TOKEN")}`);
    if (!r.ok) return { ok: false, message: r.body.error?.message ?? `Graph API error ${r.status}` };
    return { ok: true, message: `Connected to page "${r.body.name}"` };
  },
  async linkedin() {
    if (!env("LINKEDIN_TOKEN")) return { ok: false, configured: false, message: "Add LINKEDIN_TOKEN to .env for Real publishing (not needed in Mock mode)" };
    const r = await getJson("https://api.linkedin.com/v2/userinfo", { headers: { authorization: `Bearer ${env("LINKEDIN_TOKEN")}` } });
    if (!r.ok) return { ok: false, message: `LinkedIn refused the token (${r.status})` };
    const urn = `urn:li:person:${r.body.sub}`;
    const match = env("LINKEDIN_AUTHOR_URN") === urn ? "" : ` Set LINKEDIN_AUTHOR_URN=${urn}`;
    return { ok: !match, message: `Signed in as ${r.body.name}.${match}` };
  },
};

export async function GET(req: Request, { params }: Ctx<{ service: string }>) {
  const fn = checks[(await params).service];
  if (!fn) return NextResponse.json({ ok: false, message: "Unknown service" }, { status: 404 });
  try {
    return NextResponse.json(await fn(new URL(req.url).searchParams.get("send") === "1"));
  } catch (err) {
    return NextResponse.json({ ok: false, message: `Not reachable: ${(err as Error).message}` });
  }
}
