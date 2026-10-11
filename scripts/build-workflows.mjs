// Writes the five PostPilot workflows to n8n/workflows/*.json.
// Run: node scripts/build-workflows.mjs   (then restart n8n to import them)
/* eslint-disable no-undef */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Workflow } from "./lib/n8n-builder.mjs";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "n8n", "workflows");
const TELEGRAM = { telegramApi: { id: "ppTelegramCred01", name: "PostPilot Telegram bot" } };

// Shared helper appended to Code nodes that read AI answers.
// Small models often wrap JSON in ``` fences or add text around it.
function readJsonHelper() {
  function readJson(content) {
    if (!content) return null;
    const s = String(content).trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    try { return JSON.parse(s); } catch (e) {}
    const m = s.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
    return null;
  }
}

// Same check for the second attempt, which falls back to plain text if JSON still fails
function checkSecondAnswer() {
  const first = $("Answer usable?").item.json;
  const content = $json.choices?.[0]?.message?.content ?? "";
  const parsed = readJson(content);
  let ok = !!(parsed && typeof parsed.text === "string" && parsed.text.trim().length > 20);
  let text = ok ? parsed.text.trim() : "";
  // Last resort: use the plain answer as the post if it looks like one
  if (!ok && String(content).trim().length > 40 && !String(content).includes("{")) {
    ok = true;
    text = String(content).trim();
  }
  return {
    json: {
      ...first,
      ok,
      text,
      hashtags: ok && Array.isArray(parsed?.hashtags) ? parsed.hashtags : [],
      cost: first.cost + ($json.usage?.cost ?? 0),
      error: ok ? null : ($json.error?.message ?? "The AI did not return a usable post"),
    },
  };
}

function generateDrafts() {
  const w = new Workflow("ppGenerateDrafts", "PostPilot – Generate drafts");
  const runId = "$('Brief received').item.json.body.runId";

  w.note("## PostPilot – Generate drafts\nThe app sends an event brief here. The agent:\n1. reads the brief and the prompt files\n2. writes one post per platform\n3. paints one image\n4. runs a safety check\n\nEvery **Tell app** node sends a progress message to the app, so the audience sees each step live.", [-80, -80], 640, 300, 4);
  w.note("### 1. Start\nThe app calls this webhook. We first check the secret header, so only PostPilot can start the agent. Then we load the prompts from the app (they live in the `prompts/` folder).", [-80, 240], 1180, 300, 7);
  w.webhook("Brief received", "postpilot-generate", [0, 380]);
  w.secretCheck("Is this our app?", "Brief received", [220, 380]);
  w.tellApp("Tell app: reading brief", runId, "step: 'brief', status: 'running', message: 'Reading the brief for ' + $('Brief received').item.json.body.organisation", [440, 380]);
  w.app("Load prompts", "/api/internal/prompts", null, [660, 380], { method: "GET", continueOnFail: false });
  w.tellApp("Tell app: brief understood", runId, "step: 'brief', status: 'done', message: 'Brief read: writing for ' + $('Brief received').item.json.body.platforms.map((p) => p === 'facebook' ? 'Facebook' : 'LinkedIn').join(' and ')", [880, 380]);
  w.code("Prepare drafting jobs", function () {
    // One job per platform. The system prompt = rules + brand voice + safety rules + platform rules.
    const req = $("Brief received").first().json.body;
    const { prompts, presets } = $("Load prompts").first().json;
    const system = [prompts["draft-system"], presets[req.preset] ?? "", prompts["safety-rules"]].join("\n\n");
    return req.platforms.map((platform) => ({
      json: {
        runId: req.runId,
        platform,
        label: platform === "facebook" ? "Facebook" : "LinkedIn",
        model: req.model,
        brief: req.brief,
        organisation: req.organisation,
        trapPlatform: req.trapPlatform ?? null,
        trapPrompt: prompts["trap"],
        messages: [
          { role: "system", content: system + "\n\n" + prompts["platform-" + platform] },
          { role: "user", content: "Organisation: " + req.organisation + "\n\nEvent brief:\n" + req.brief },
        ],
      },
    }));
  }, [1100, 380], "runOnceForAllItems");
  w.chain("Brief received", "Is this our app?", "Tell app: reading brief", "Load prompts", "Tell app: brief understood", "Prepare drafting jobs");

  w.note("### 2. Write one post per platform (loop)\n**One platform at a time** repeats the steps below for Facebook, then LinkedIn.\n- **Draft post with AI** calls OpenRouter.\n- **Check the AI answer** reads the JSON. If it is broken, we **ask again** once, more strictly.\n- **Demo trap**: if switched on in the app, one draft gets a deliberate mistake (wrong date or a fake promise) so the human reviewer can catch it.", [1260, 460], 2440, 560, 5);
  w.add("One platform at a time", "n8n-nodes-base.splitInBatches", 3, { options: {} }, [1320, 380]);
  w.tellApp("Tell app: drafting", "$json.runId", "step: 'draft_' + $('One platform at a time').item.json.platform, status: 'running', message: 'Writing the ' + $('One platform at a time').item.json.label + ' post with ' + $('One platform at a time').item.json.model", [1540, 660]);
  w.ai("Draft post with AI", {
    model: "$('One platform at a time').item.json.model",
    messages: "$('One platform at a time').item.json.messages",
  }, [1760, 660]);
  w.code("Check the AI answer", function () {
    // Reads the AI answer. ok = false means "ask again".
    const job = $("One platform at a time").item.json;
    const content = $json.choices?.[0]?.message?.content ?? "";
    const parsed = readJson(content);
    const ok = !!(parsed && typeof parsed.text === "string" && parsed.text.trim().length > 20);
    return {
      json: {
        ...job,
        ok,
        text: ok ? parsed.text.trim() : "",
        hashtags: ok && Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
        raw: String(content),
        cost: $json.usage?.cost ?? 0,
        error: $json.error?.message ?? null,
      },
    };
  }, [1980, 660], "runOnceForEachItem", [readJsonHelper]);
  w.if("Answer usable?", "{{ $json.ok }}", [2200, 660]);
  w.ai("Ask again, stricter", {
    model: "$json.model",
    messages: "$json.messages.concat([{ role: 'assistant', content: $json.raw || '(empty)' }, { role: 'user', content: 'That answer was not valid. Reply again with ONLY the JSON object with the keys text and hashtags. No other words.' }])",
  }, [2420, 860]);
  w.code("Check second answer", checkSecondAnswer, [2640, 860], "runOnceForEachItem", [readJsonHelper]);
  w.if("Is this the trap draft?", "{{ $json.ok && $json.platform === $json.trapPlatform }}", [2860, 660]);
  w.ai("Plant the demo mistake", {
    model: "$json.model",
    messages: "[{ role: 'system', content: $json.trapPrompt }, { role: 'user', content: 'Event brief:\\n' + $json.brief + '\\n\\nPost:\\n' + $json.text }]",
  }, [3080, 860]);
  w.code("Read the planted mistake", function () {
    // Keeps the original draft if the trap could not be planted
    const draft = $("Is this the trap draft?").item.json;
    const p = readJson($json.choices?.[0]?.message?.content);
    const cost = draft.cost + ($json.usage?.cost ?? 0);
    if (p && typeof p.text === "string" && p.text.trim() && p.planted_quote) {
      return { json: { ...draft, text: p.text.trim(), cost, trap: { quote: p.planted_quote, explanation: p.explanation ?? "" } } };
    }
    return { json: { ...draft, cost } };
  }, [3300, 860], "runOnceForEachItem", [readJsonHelper]);
  w.code("Draft is final", function () {
    const words = $json.text ? $json.text.split(/\s+/).length : 0;
    const message = $json.ok
      ? $json.label + " draft ready (" + words + " words)"
      : "Could not write the " + $json.label + " post: " + ($json.error ?? "unknown error");
    return { json: { ...$json, message } };
  }, [3520, 660]);
  w.tellApp("Tell app: draft ready", "$json.runId", "step: 'draft_' + $json.platform, status: $json.ok ? 'done' : 'failed', message: $json.message, data: { text: $json.text, hashtags: $json.hashtags, trap: $json.trap ?? null }, cost: $json.cost", [3740, 660]);
  w.code("Back to the loop", function () {
    return { json: $("Draft is final").item.json };
  }, [3960, 660]);
  w.chain("Prepare drafting jobs", "One platform at a time");
  w.connect("One platform at a time", "Tell app: drafting", 1);
  w.chain("Tell app: drafting", "Draft post with AI", "Check the AI answer", "Answer usable?");
  w.connect("Answer usable?", "Is this the trap draft?", 0);
  w.connect("Answer usable?", "Ask again, stricter", 1);
  w.chain("Ask again, stricter", "Check second answer", "Is this the trap draft?");
  w.connect("Is this the trap draft?", "Plant the demo mistake", 0);
  w.connect("Is this the trap draft?", "Draft is final", 1);
  w.chain("Plant the demo mistake", "Read the planted mistake", "Draft is final");
  w.chain("Draft is final", "Tell app: draft ready", "Back to the loop", "One platform at a time");

  w.note("### 3. Paint one image\nOne image for the whole brief (the app crops it for each platform).\n1. The AI describes the picture.\n2. **OpenRouter** image model paints it.\n3. If that fails: free **Pollinations.ai**.\n4. If that fails too: the app draws a **branded template**. This step never fails.", [1260, 1060], 2240, 520, 6);
  w.code("All drafts written", function () {
    // The loop is finished. Continue only if at least one post was written.
    const drafts = $input.all().map((i) => i.json).filter((d) => d.ok);
    if (!drafts.length) return [];
    const first = drafts[0];
    return [{
      json: {
        runId: first.runId,
        model: first.model,
        brief: first.brief,
        organisation: first.organisation,
        drafts: drafts.map((d) => ({ platform: d.platform, text: d.text, trap: d.trap ?? null })),
      },
    }];
  }, [1320, 1240], "runOnceForAllItems");
  w.connect("One platform at a time", "All drafts written", 0);
  w.tellApp("Tell app: creating image", "$json.runId", "step: 'image', status: 'running', message: 'Imagining a picture for the event'", [1540, 1240]);
  w.ai("Describe the image", {
    model: "$('All drafts written').item.json.model",
    messages: "[{ role: 'system', content: $('Load prompts').first().json.prompts['image-prompt'] }, { role: 'user', content: 'Organisation: ' + $('All drafts written').item.json.organisation + '\\n\\nEvent brief:\\n' + $('All drafts written').item.json.brief }]",
  }, [1760, 1240]);
  w.code("Read image description", function () {
    const ctx = $("All drafts written").item.json;
    const p = readJson($json.choices?.[0]?.message?.content);
    const fallbackTitle = ctx.brief.split(/[.!?]/)[0].split(/\s+/).slice(0, 6).join(" ");
    return {
      json: {
        runId: ctx.runId,
        imagePrompt: p?.image_prompt || "Bright flat illustration of a school event in Cameroon: " + ctx.brief.slice(0, 200),
        title: p?.title || fallbackTitle,
        date: p?.date || "",
        cost: $json.usage?.cost ?? 0,
      },
    };
  }, [1980, 1240], "runOnceForEachItem", [readJsonHelper]);
  w.ai("Paint image (OpenRouter)", {
    model: "$env.IMAGE_MODEL",
    messages: "[{ role: 'user', content: 'Create a landscape 16:9 image. ' + $json.imagePrompt }]",
    json: false,
    extraBody: "modalities: ['image', 'text'], ",
  }, [2200, 1240]);
  w.if("Got an image?", "{{ !!$json.choices?.[0]?.message?.images?.[0]?.image_url?.url }}", [2420, 1240]);
  w.app("Save image in app", "/api/internal/images", "{ runId: $('Read image description').item.json.runId, source: 'openrouter', dataUrl: $json.choices[0].message.images[0].image_url.url, prompt: $('Read image description').item.json.imagePrompt, title: $('Read image description').item.json.title, date: $('Read image description').item.json.date }", [2640, 1140], { timeout: 60000 });
  w.http("Paint image (Pollinations)", {
    method: "GET",
    url: "={{ $env.POLLINATIONS_URL.replace('{prompt}', encodeURIComponent($('Read image description').item.json.imagePrompt)) }}",
    file: true,
    timeout: 90000,
    continueOnFail: true,
  }, [2640, 1380]);
  w.if("Got a Pollinations image?", "{{ !!$binary.data && String($binary.data.mimeType || '').startsWith('image/') }}", [2860, 1380]);
  w.http("Save Pollinations image in app", {
    url: "={{ $env.APP_INTERNAL_URL }}/api/internal/images",
    headers: [{ name: "x-postpilot-secret", value: "={{ $env.POSTPILOT_SECRET }}" }],
    query: [
      { name: "runId", value: "={{ $('Read image description').item.json.runId }}" },
      { name: "source", value: "pollinations" },
      { name: "title", value: "={{ $('Read image description').item.json.title }}" },
      { name: "date", value: "={{ $('Read image description').item.json.date }}" },
    ],
    binaryBody: true,
    timeout: 60000,
    continueOnFail: true,
  }, [3080, 1300]);
  w.app("Use the template image", "/api/internal/images", "{ runId: $('Read image description').item.json.runId, source: 'template', title: $('Read image description').item.json.title, date: $('Read image description').item.json.date, note: 'OpenRouter image ' + (/429/.test(JSON.stringify($('Paint image (OpenRouter)').item.json)) ? 'busy (rate limit)' : 'failed') + ', Pollinations ' + (/429/.test(JSON.stringify($json)) ? 'busy (rate limit)' : 'failed') + ': template used' }", [3080, 1480]);
  w.tellApp("Tell app: image ready", "$('Read image description').item.json.runId", "step: 'image', status: $json.source ? 'done' : 'failed', message: $json.source ? 'Image ready from ' + ({ openrouter: 'OpenRouter AI', pollinations: 'Pollinations.ai', template: 'the branded template' })[$json.source] : 'The image could not be saved', data: { title: $('Read image description').item.json.title }, cost: $('Read image description').item.json.cost + ($('Paint image (OpenRouter)').item.json.usage?.cost ?? 0)", [3300, 1240]);
  w.chain("All drafts written", "Tell app: creating image", "Describe the image", "Read image description", "Paint image (OpenRouter)", "Got an image?");
  w.connect("Got an image?", "Save image in app", 0);
  w.connect("Got an image?", "Paint image (Pollinations)", 1);
  w.chain("Paint image (Pollinations)", "Got a Pollinations image?");
  w.connect("Got a Pollinations image?", "Save Pollinations image in app", 0);
  w.connect("Got a Pollinations image?", "Use the template image", 1);
  w.chain("Save image in app", "Tell app: image ready");
  w.chain("Save Pollinations image in app", "Tell app: image ready");
  w.chain("Use the template image", "Tell app: image ready");

  w.note("### 4. Safety check\nA second AI reads all drafts against the brief and the school safety rules (student names, photos of minors, personal data, promises, wrong dates).\nIf the demo trap is on, we **hide** the warning about the planted mistake: the human must find it.", [3540, 1060], 1180, 520, 3);
  w.tellApp("Tell app: checking safety", "$('Read image description').item.json.runId", "step: 'safety', status: 'running', message: 'Checking the drafts against the school safety rules'", [3600, 1240]);
  w.code("Prepare safety check", function () {
    const ctx = $("All drafts written").item.json;
    const prompts = $("Load prompts").first().json.prompts;
    const drafts = ctx.drafts.map((d) => "### " + d.platform + "\n" + d.text).join("\n\n");
    return {
      json: {
        runId: ctx.runId,
        model: ctx.model,
        drafts: ctx.drafts,
        messages: [
          { role: "system", content: prompts["safety-check"] + "\n\n" + prompts["safety-rules"] },
          { role: "user", content: "Event brief:\n" + ctx.brief + "\n\nDrafts:\n" + drafts },
        ],
      },
    };
  }, [3820, 1240]);
  w.ai("Safety check with AI", { model: "$json.model", messages: "$json.messages" }, [4040, 1240]);
  w.code("Read flags & hide the demo trap", function () {
    const ctx = $("Prepare safety check").item.json;
    const p = readJson($json.choices?.[0]?.message?.content);
    const list = Array.isArray(p?.drafts) ? p.drafts : [];
    const drafts = ctx.drafts.map((d) => {
      const found = list.find((x) => String(x.platform).toLowerCase() === d.platform);
      let flags = Array.isArray(found?.flags) ? found.flags.filter((f) => f && f.quote) : [];
      // Demo trap: hide warnings about the planted mistake so the human has to spot it
      if (d.trap?.quote) flags = flags.filter((f) => !overlaps(f.quote, d.trap.quote));
      return { platform: d.platform, flags };
    });
    const total = drafts.reduce((s, d) => s + d.flags.length, 0);
    return { json: { runId: ctx.runId, ok: !!p, drafts, total, cost: $json.usage?.cost ?? 0 } };
  }, [4260, 1240], "runOnceForEachItem", [readJsonHelper, function overlapsHelper() {
    function overlaps(a, b) {
      const words = (s) => String(s).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
      const wa = words(a), wb = new Set(words(b));
      if (!wa.length || !wb.size) return false;
      const shared = wa.filter((x) => wb.has(x)).length;
      return shared / Math.min(wa.length, wb.size) >= 0.5;
    }
  }]);
  w.tellApp("Tell app: safety done", "$json.runId", "step: 'safety', status: $json.ok ? 'done' : 'failed', message: $json.ok ? ($json.total ? $json.total + ' point(s) for you to check' : 'No safety problems found') : 'Safety check unavailable: please review carefully', data: { drafts: $json.drafts }, cost: $json.cost", [4480, 1240]);
  w.chain("Tell app: image ready", "Tell app: checking safety", "Prepare safety check", "Safety check with AI", "Read flags & hide the demo trap", "Tell app: safety done");
  return w;
}

function redraft() {
  const w = new Workflow("ppRedraftPost001", "PostPilot – Redraft");
  w.note("## PostPilot – Redraft\nThe human rejected a draft and wrote why. The agent rewrites the post using that feedback, checks it again for safety, and sends the new version (v2, v3…) back to the app.", [-80, -80], 620, 240, 4);
  w.webhook("Rejected draft received", "postpilot-redraft", [0, 300]);
  w.secretCheck("Is this our app?", "Rejected draft received", [220, 300]);
  w.app("Load prompts", "/api/internal/prompts", null, [440, 300], { method: "GET", continueOnFail: false });
  w.code("Build redraft prompt", function () {
    const req = $("Rejected draft received").item.json.body;
    const { prompts, presets } = $("Load prompts").item.json;
    const system = [prompts["draft-system"], presets[req.preset] ?? "", prompts["safety-rules"], prompts["platform-" + req.platform], prompts["redraft"]].join("\n\n");
    return {
      json: {
        runId: req.runId,
        platform: req.platform,
        label: req.platform === "facebook" ? "Facebook" : "LinkedIn",
        model: req.model,
        brief: req.brief,
        reason: req.reason,
        messages: [
          { role: "system", content: system },
          { role: "user", content: "Organisation: " + req.organisation + "\n\nEvent brief:\n" + req.brief + "\n\nPrevious draft:\n" + req.previousText + "\n\nReviewer feedback: " + req.reason },
        ],
      },
    };
  }, [660, 300]);
  w.ai("Redraft with AI", { model: "$json.model", messages: "$json.messages" }, [880, 300]);
  w.code("Check the AI answer", function () {
    const job = $("Build redraft prompt").item.json;
    const content = $json.choices?.[0]?.message?.content ?? "";
    const parsed = readJson(content);
    const ok = !!(parsed && typeof parsed.text === "string" && parsed.text.trim().length > 20);
    return {
      json: {
        ...job,
        ok,
        text: ok ? parsed.text.trim() : "",
        hashtags: ok && Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
        raw: String(content),
        cost: $json.usage?.cost ?? 0,
        error: $json.error?.message ?? null,
      },
    };
  }, [1100, 300], "runOnceForEachItem", [readJsonHelper]);
  w.if("Answer usable?", "{{ $json.ok }}", [1320, 300]);
  w.ai("Ask again, stricter", {
    model: "$json.model",
    messages: "$json.messages.concat([{ role: 'assistant', content: $json.raw || '(empty)' }, { role: 'user', content: 'That answer was not valid. Reply again with ONLY the JSON object with the keys text and hashtags. No other words.' }])",
  }, [1540, 500]);
  w.code("Check second answer", checkSecondAnswer, [1760, 500], "runOnceForEachItem", [readJsonHelper]);
  w.code("Prepare safety check", function () {
    const d = $json;
    const prompts = $("Load prompts").first().json.prompts;
    return {
      json: {
        ...d,
        safetyMessages: [
          { role: "system", content: prompts["safety-check"] + "\n\n" + prompts["safety-rules"] },
          { role: "user", content: "Event brief:\n" + d.brief + "\n\nDrafts:\n### " + d.platform + "\n" + d.text },
        ],
      },
    };
  }, [1980, 300]);
  w.ai("Safety check with AI", { model: "$json.model", messages: "$json.safetyMessages" }, [2200, 300]);
  w.code("Read safety flags", function () {
    const d = $("Prepare safety check").item.json;
    const p = readJson($json.choices?.[0]?.message?.content);
    const found = (Array.isArray(p?.drafts) ? p.drafts : [])[0];
    const flags = Array.isArray(found?.flags) ? found.flags.filter((f) => f && f.quote) : [];
    const message = d.ok
      ? "New " + d.label + " version ready" + (flags.length ? " (" + flags.length + " point(s) to check)" : "")
      : "Could not rewrite the " + d.label + " post: " + (d.error ?? "unknown error");
    return { json: { ...d, flags, message, cost: d.cost + ($json.usage?.cost ?? 0) } };
  }, [2420, 300], "runOnceForEachItem", [readJsonHelper]);
  w.tellApp("Tell app: new version ready", "$json.runId", "step: 'redraft_' + $json.platform, status: $json.ok ? 'done' : 'failed', message: $json.message, data: { text: $json.text, hashtags: $json.hashtags, flags: $json.flags, reason: $json.reason }, cost: $json.cost", [2640, 300]);
  w.chain("Rejected draft received", "Is this our app?", "Load prompts", "Build redraft prompt", "Redraft with AI", "Check the AI answer", "Answer usable?");
  w.connect("Answer usable?", "Prepare safety check", 0);
  w.connect("Answer usable?", "Ask again, stricter", 1);
  w.chain("Ask again, stricter", "Check second answer", "Prepare safety check", "Safety check with AI", "Read safety flags", "Tell app: new version ready");
  w.note("### Same pattern as Generate drafts\nAsk the AI → check the JSON → ask again once if broken → safety check → tell the app.", [860, 160], 1100, 520, 7);
  return w;
}

function telegramApproval() {
  const w = new Workflow("ppTelegramApprov", "PostPilot – Telegram approval");
  w.note("## PostPilot – Telegram approval\nSends the draft and its image to the demonstrator's phone with **Approve / Reject** buttons, then waits.\nThe decision goes back to the app. The app keeps the **first** decision (app or Telegram) and ignores the later one.\n\nNeeds: Telegram credential *PostPilot Telegram bot* and a public `WEBHOOK_URL` (same Wi-Fi IP or `scripts/tunnel.sh`) so the buttons can reach n8n.", [-80, -120], 700, 300, 4);
  w.webhook("Draft needs approval", "postpilot-approval", [0, 300]);
  w.secretCheck("Is this our app?", "Draft needs approval", [220, 300]);
  w.code("Write the Telegram message", function () {
    const d = $("Draft needs approval").item.json.body;
    const label = d.platform === "facebook" ? "Facebook" : "LinkedIn";
    const flags = Array.isArray(d.flags) ? d.flags : [];
    const notes = flags.length ? "\n\n⚠️ Safety notes:\n" + flags.map((f) => "• " + f.explanation).join("\n") : "";
    const message = "📝 " + label + " draft v" + d.version + " for " + d.organisation + "\n\n" + d.text + notes;
    return { json: { ...d, label, message: message.slice(0, 3900), caption: label + " post image (draft v" + d.version + ")" } };
  }, [440, 300]);
  w.if("Has an image?", "{{ !!$json.imagePath }}", [660, 300]);
  w.http("Download image from app", { method: "GET", url: "={{ $env.APP_INTERNAL_URL }}{{ $json.imagePath }}", file: true, continueOnFail: true }, [880, 160]);
  w.add("Send image to Telegram", "n8n-nodes-base.telegram", 1.2, {
    operation: "sendPhoto",
    chatId: "={{ $env.TELEGRAM_CHAT_ID }}",
    binaryData: true,
    binaryPropertyName: "data",
    additionalFields: { caption: "={{ $('Write the Telegram message').item.json.caption }}" },
  }, [1100, 160], { credentials: TELEGRAM, onError: "continueRegularOutput" });
  w.add("Ask for approval on Telegram", "n8n-nodes-base.telegram", 1.2, {
    operation: "sendAndWait",
    chatId: "={{ $env.TELEGRAM_CHAT_ID }}",
    message: "={{ $('Write the Telegram message').item.json.message }}",
    approvalOptions: { values: { approvalType: "double", approveLabel: "✅ Approve", disapproveLabel: "❌ Reject" } },
    options: { limitWaitTime: { values: { limitType: "afterTimeInterval", resumeAmount: 2, resumeUnit: "hours" } }, appendAttribution: false },
  }, [1320, 300], { credentials: TELEGRAM, webhookId: "6f0b5e1e-3c0a-4b8e-9a51-9a0f2a7c1d01" });
  w.code("Read the decision", function () {
    // data.approved is true or false when a button was pressed; missing when the wait timed out
    const approved = $json.data?.approved;
    const d = $("Write the Telegram message").item.json;
    if (approved === undefined) return { json: { pressed: false } };
    return {
      json: {
        pressed: true,
        draftId: d.draftId,
        decision: approved ? "approve" : "reject",
        reason: approved ? null : "Rejected on Telegram: check every fact against the brief and improve the post.",
      },
    };
  }, [1540, 300]);
  w.if("Was a button pressed?", "{{ $json.pressed }}", [1760, 300]);
  w.app("Tell app the decision", "/api/internal/decisions", "{ draftId: $json.draftId, decision: $json.decision, reason: $json.reason, source: 'telegram' }", [1980, 300]);
  w.add("Confirm on Telegram", "n8n-nodes-base.telegram", 1.2, {
    operation: "sendMessage",
    chatId: "={{ $env.TELEGRAM_CHAT_ID }}",
    text: "={{ $json.accepted ? ($('Read the decision').item.json.decision === 'approve' ? '✅ Approved. PostPilot will take it from here.' : '↩️ Rejected. The agent is writing a new version.') : 'ℹ️ Too late: this draft was already decided in the app (' + $json.existing + ').' }}",
    additionalFields: { appendAttribution: false },
  }, [2200, 300], { credentials: TELEGRAM, onError: "continueRegularOutput" });
  w.chain("Draft needs approval", "Is this our app?", "Write the Telegram message", "Has an image?");
  w.connect("Has an image?", "Download image from app", 0);
  w.connect("Has an image?", "Ask for approval on Telegram", 1);
  w.chain("Download image from app", "Send image to Telegram", "Ask for approval on Telegram", "Read the decision", "Was a button pressed?");
  w.connect("Was a button pressed?", "Tell app the decision", 0);
  w.chain("Tell app the decision", "Confirm on Telegram");
  w.note("### Waiting for a human\n**Ask for approval on Telegram** pauses this execution until a button is pressed (max 2 hours). You can see it under *Executions* with the status *Waiting*.", [1240, 460], 600, 200, 6);
  return w;
}

function publishPost() {
  const w = new Workflow("ppPublishPost001", "PostPilot – Publish");
  const req = "$('Post to publish').item.json.body";
  w.note("## PostPilot – Publish\nPublishes one approved post, now or at a chosen time.\n- **Mock mode**: no social network is called; we create a fake post ID and link.\n- **Facebook**: Graph API photo post. Facebook schedules natively (10 min – 30 days ahead).\n- **LinkedIn**: no simple native scheduling, so a **Wait** node pauses until the chosen time, then posts.", [-80, -120], 760, 300, 4);
  w.webhook("Post to publish", "postpilot-publish", [0, 400]);
  w.secretCheck("Is this our app?", "Post to publish", [220, 400]);
  w.if("Mock publishing?", `{{ ${req}.mock }}`, [440, 400]);
  w.chain("Post to publish", "Is this our app?", "Mock publishing?");

  w.note("### Mock mode\nPerfect for demos without accounts. Scheduled mock posts still wait for their time, so the dashboard changes live.", [600, 0], 960, 340, 7);
  w.if("Scheduled for later? (mock)", `{{ !!${req}.scheduledAt }}`, [660, 180]);
  w.add("Wait until the scheduled time (mock)", "n8n-nodes-base.wait", 1.1, { resume: "specificTime", dateTime: `={{ ${req}.scheduledAt }}` }, [880, 100], { webhookId: "7a1c2e33-5b8d-4f0e-a1c2-2b3d4e5f6a01" });
  w.code("Make a fake post", function () {
    const req = $("Post to publish").item.json.body;
    return { json: { postId: req.postId, status: "published", externalId: "mock_" + Math.random().toString(36).slice(2, 10), url: "/mock-post/" + req.postId } };
  }, [1100, 180]);
  w.app("Tell app: published (mock)", "/api/internal/posts/{{ $json.postId }}", "{ status: $json.status, externalId: $json.externalId, url: $json.url }", [1320, 180]);
  w.connect("Mock publishing?", "Scheduled for later? (mock)", 0);
  w.connect("Scheduled for later? (mock)", "Wait until the scheduled time (mock)", 0);
  w.connect("Scheduled for later? (mock)", "Make a fake post", 1);
  w.chain("Wait until the scheduled time (mock)", "Make a fake post", "Tell app: published (mock)");

  w.if("Facebook?", `{{ ${req}.platform === 'facebook' }}`, [660, 640]);
  w.connect("Mock publishing?", "Facebook?", 1);
  w.note("### Facebook Page\nDownload the image from the app, then send it with the text to `/{page-id}/photos`. For a later time we add `published=false` and `scheduled_publish_time`.", [820, 380], 920, 360, 5);
  w.http("Download image for Facebook", { method: "GET", url: `={{ $env.APP_INTERNAL_URL }}{{ ${req}.imagePath }}`, file: true, continueOnFail: true }, [880, 560]);
  w.http("Post photo to Facebook Page", {
    url: `=https://graph.facebook.com/{{ $env.FB_GRAPH_VERSION || 'v23.0' }}/{{ $env.FB_PAGE_ID }}/photos{{ ${req}.scheduledUnix ? '?published=false&unpublished_content_type=SCHEDULED&scheduled_publish_time=' + ${req}.scheduledUnix : '' }}`,
    form: [
      { parameterType: "formBinaryData", name: "source", inputDataFieldName: "data" },
      { name: "caption", value: `={{ ${req}.text }}` },
      { name: "access_token", value: "={{ $env.FB_PAGE_TOKEN }}" },
    ],
    timeout: 60000,
    continueOnFail: true,
  }, [1100, 560]);
  w.code("Read Facebook answer", function () {
    const req = $("Post to publish").item.json.body;
    if ($json.error) {
      const e = $json.error;
      return { json: { postId: req.postId, status: "failed", error: "Facebook: " + (e.description || e.message || JSON.stringify(e)) } };
    }
    const id = $json.post_id || $json.id;
    return { json: { postId: req.postId, status: req.scheduledAt ? "scheduled" : "published", externalId: id, url: "https://www.facebook.com/" + id } };
  }, [1320, 560]);
  w.app("Tell app: Facebook result", "/api/internal/posts/{{ $json.postId }}", "{ status: $json.status, externalId: $json.externalId, url: $json.url, error: $json.error }", [1540, 560]);
  w.connect("Facebook?", "Download image for Facebook", 0);
  w.chain("Download image for Facebook", "Post photo to Facebook Page", "Read Facebook answer", "Tell app: Facebook result");

  w.note("### LinkedIn\n1. Wait until the chosen time (if scheduled).\n2. Ask LinkedIn for an upload slot, upload the image.\n3. Create the post with the image.\nLinkedIn text uses a special format, so we escape symbols and turn #tags into LinkedIn hashtags.", [820, 780], 1820, 380, 6);
  w.if("Scheduled for later? (LinkedIn)", `{{ !!${req}.scheduledAt }}`, [880, 960]);
  w.add("Wait until the scheduled time", "n8n-nodes-base.wait", 1.1, { resume: "specificTime", dateTime: `={{ ${req}.scheduledAt }}` }, [1100, 880], { webhookId: "8b2d3f44-6c9e-4a1f-b2d3-3c4e5f6a7b02" });
  w.code("Prepare LinkedIn text", function () {
    const req = $("Post to publish").item.json.body;
    // LinkedIn "little text" format: reserved symbols must be escaped, hashtags use a template
    const tags = [];
    let t = req.text.replace(/#([\p{L}\p{N}_]+)/gu, (m, tag) => { tags.push(tag); return "\u0000" + (tags.length - 1) + "\u0000"; });
    t = t.replace(/[\\|{}@\[\]()<>#*_~]/g, (c) => "\\" + c);
    t = t.replace(/\u0000(\d+)\u0000/g, (m, i) => "{hashtag|\\#|" + tags[Number(i)] + "}");
    return { json: { postId: req.postId, commentary: t, imagePath: req.imagePath } };
  }, [1320, 960]);
  const liHeaders = [
    { name: "Authorization", value: "=Bearer {{ $env.LINKEDIN_TOKEN }}" },
    { name: "LinkedIn-Version", value: "={{ $env.LINKEDIN_API_VERSION }}" },
    { name: "X-Restli-Protocol-Version", value: "2.0.0" },
  ];
  w.http("Get a LinkedIn upload slot", {
    url: "https://api.linkedin.com/rest/images?action=initializeUpload",
    headers: liHeaders,
    json: "{ initializeUploadRequest: { owner: $env.LINKEDIN_AUTHOR_URN } }",
    continueOnFail: true,
  }, [1540, 960]);
  w.http("Download image for LinkedIn", { method: "GET", url: "={{ $env.APP_INTERNAL_URL }}{{ $('Prepare LinkedIn text').item.json.imagePath }}", file: true, continueOnFail: true }, [1760, 960]);
  w.http("Upload image to LinkedIn", {
    method: "PUT",
    url: "={{ $('Get a LinkedIn upload slot').item.json.value?.uploadUrl }}",
    headers: [{ name: "Authorization", value: "=Bearer {{ $env.LINKEDIN_TOKEN }}" }],
    binaryBody: true,
    timeout: 60000,
    continueOnFail: true,
  }, [1980, 960]);
  w.http("Create LinkedIn post", {
    url: "https://api.linkedin.com/rest/posts",
    headers: liHeaders,
    json: "{ author: $env.LINKEDIN_AUTHOR_URN, commentary: $('Prepare LinkedIn text').item.json.commentary, visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, content: { media: { id: $('Get a LinkedIn upload slot').item.json.value?.image, altText: 'Event illustration' } }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false }",
    fullResponse: true,
    continueOnFail: true,
  }, [2200, 960]);
  w.code("Read LinkedIn answer", function () {
    const postId = $("Prepare LinkedIn text").item.json.postId;
    const slot = $("Get a LinkedIn upload slot").item.json;
    const err = slot.error || $("Upload image to LinkedIn").item.json.error || $json.error;
    if (err) return { json: { postId, status: "failed", error: "LinkedIn: " + (err.description || err.message || JSON.stringify(err)) } };
    const urn = $json.headers?.["x-restli-id"] || $json.headers?.["x-linkedin-id"];
    return { json: { postId, status: "published", externalId: urn, url: urn ? "https://www.linkedin.com/feed/update/" + urn + "/" : null } };
  }, [2420, 960]);
  w.app("Tell app: LinkedIn result", "/api/internal/posts/{{ $json.postId }}", "{ status: $json.status, externalId: $json.externalId, url: $json.url, error: $json.error }", [2640, 960]);
  w.connect("Facebook?", "Scheduled for later? (LinkedIn)", 1);
  w.connect("Scheduled for later? (LinkedIn)", "Wait until the scheduled time", 0);
  w.connect("Scheduled for later? (LinkedIn)", "Prepare LinkedIn text", 1);
  w.chain("Wait until the scheduled time", "Prepare LinkedIn text", "Get a LinkedIn upload slot", "Download image for LinkedIn", "Upload image to LinkedIn", "Create LinkedIn post", "Read LinkedIn answer", "Tell app: LinkedIn result");
  return w;
}

function weeklyReport() {
  const w = new Workflow("ppWeeklyReport01", "PostPilot – Weekly report");
  w.note("## PostPilot – Weekly report\nTwo ways to start: **every Monday at 08:00**, or the **Generate report** button in the app.\nWe collect last week's posts and their numbers (Facebook Graph API, or fake numbers in Mock mode; LinkedIn has no free statistics), then the AI writes a short plain-English report.", [-80, -120], 720, 280, 4);
  w.add("Every Monday at 08:00", "n8n-nodes-base.scheduleTrigger", 1.2, {
    rule: { interval: [{ field: "weeks", weeksInterval: 1, triggerAtDay: [1], triggerAtHour: 8 }] },
  }, [0, 220]);
  w.webhook("Report button pressed", "postpilot-report", [0, 440]);
  w.secretCheck("Is this our app?", "Report button pressed", [220, 440]);
  w.app("Get posts of the last 7 days", "/api/internal/report-data", null, [440, 300], { method: "GET", continueOnFail: false });
  w.connect("Every Monday at 08:00", "Get posts of the last 7 days");
  w.chain("Report button pressed", "Is this our app?", "Get posts of the last 7 days");
  w.code("Posts needing Facebook numbers", function () {
    const posts = $input.first().json.posts.filter((p) => p.needsFacebookStats);
    return posts.length ? posts.map((p) => ({ json: p })) : [{ json: { none: true } }];
  }, [660, 300], "runOnceForAllItems");
  w.if("Real Facebook post?", "{{ !$json.none }}", [880, 300]);
  w.http("Get Facebook numbers", {
    method: "GET",
    url: "=https://graph.facebook.com/{{ $env.FB_GRAPH_VERSION || 'v23.0' }}/{{ $json.externalId }}?fields=reactions.summary(total_count),comments.summary(total_count),shares&access_token={{ $env.FB_PAGE_TOKEN }}",
    continueOnFail: true,
  }, [1100, 200]);
  w.code("Combine all numbers", function () {
    const data = $("Get posts of the last 7 days").first().json;
    const real = {};
    try {
      for (const it of $("Get Facebook numbers").all()) {
        const j = it.json;
        if (j.id) real[j.id] = { likes: j.reactions?.summary?.total_count ?? 0, comments: j.comments?.summary?.total_count ?? 0, shares: j.shares?.count ?? 0, reach: 0 };
      }
    } catch (e) { /* no real Facebook posts this week */ }
    const posts = data.posts.map((p) => {
      const n = p.mock ? p.engagement : real[p.externalId] ?? null;
      const stats = p.mock ? "mock" : p.platform === "linkedin" ? "not available" : n ? "facebook" : "not available";
      return { title: p.title, platform: p.platform, status: p.status, excerpt: p.excerpt, stats, likes: n?.likes ?? 0, comments: n?.comments ?? 0, shares: n?.shares ?? 0, reach: n?.reach ?? 0 };
    });
    const totals = posts.reduce((t, p) => ({ likes: t.likes + p.likes, comments: t.comments + p.comments, shares: t.shares + p.shares }), { likes: 0, comments: 0, shares: 0 });
    return [{ json: { settings: data.settings, periodStart: data.periodStart, periodEnd: data.periodEnd, posts, totals } }];
  }, [1320, 300], "runOnceForAllItems");
  w.connect("Real Facebook post?", "Get Facebook numbers", 0);
  w.connect("Real Facebook post?", "Combine all numbers", 1);
  w.chain("Get posts of the last 7 days", "Posts needing Facebook numbers", "Real Facebook post?");
  w.chain("Get Facebook numbers", "Combine all numbers");
  // The report prompt is loaded from the app so it stays editable in prompts/report.md
  w.app("Load prompts", "/api/internal/prompts", null, [1540, 120], { method: "GET", continueOnFail: false });
  w.ai("Write report with AI", {
    model: "$('Combine all numbers').item.json.settings.model",
    messages: "[{ role: 'system', content: $json.prompts.report }, { role: 'user', content: 'Numbers for the week:\\n' + JSON.stringify({ posts: $('Combine all numbers').item.json.posts, totals: $('Combine all numbers').item.json.totals }, null, 2) }]",
  }, [1760, 300]);
  w.code("Read the report", function () {
    const ctx = $("Combine all numbers").item.json;
    const p = readJson($json.choices?.[0]?.message?.content);
    const t = ctx.totals;
    // Plain summary if the AI is unavailable
    const fallback = "This week: " + ctx.posts.length + " post(s), " + t.likes + " likes, " + t.comments + " comments, " + t.shares + " shares. LinkedIn statistics are not available.";
    return {
      json: {
        title: p?.title || "Weekly social media report",
        text: p?.report || fallback,
        numbers: { posts: ctx.posts, totals: t },
        periodStart: ctx.periodStart,
        periodEnd: ctx.periodEnd,
        cost: $json.usage?.cost ?? 0,
        telegram: !!ctx.settings.telegram,
      },
    };
  }, [1980, 300], "runOnceForEachItem", [readJsonHelper]);
  w.app("Save report in app", "/api/internal/reports", "{ title: $json.title, text: $json.text, numbers: $json.numbers, periodStart: $json.periodStart, periodEnd: $json.periodEnd, cost: $json.cost }", [2200, 300]);
  w.if("Telegram on?", "{{ $('Read the report').item.json.telegram }}", [2420, 300]);
  w.add("Send report to Telegram", "n8n-nodes-base.telegram", 1.2, {
    operation: "sendMessage",
    chatId: "={{ $env.TELEGRAM_CHAT_ID }}",
    text: "=📊 {{ $('Read the report').item.json.title }}\n\n{{ $('Read the report').item.json.text }}",
    additionalFields: { appendAttribution: false },
  }, [2640, 220], { credentials: TELEGRAM, onError: "continueRegularOutput" });
  w.chain("Combine all numbers", "Load prompts", "Write report with AI", "Read the report", "Save report in app", "Telegram on?");
  w.connect("Telegram on?", "Send report to Telegram", 0);
  return w;
}

fs.mkdirSync(OUT, { recursive: true });
const files = {
  "01-generate-drafts.json": generateDrafts(),
  "02-redraft.json": redraft(),
  "03-telegram-approval.json": telegramApproval(),
  "04-publish.json": publishPost(),
  "05-weekly-report.json": weeklyReport(),
};
for (const [file, wf] of Object.entries(files)) {
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(wf.toJSON(), null, 2) + "\n");
  console.log(`${file}: ${wf.nodes.filter((n) => !n.type.endsWith("stickyNote")).length} nodes`);
}
