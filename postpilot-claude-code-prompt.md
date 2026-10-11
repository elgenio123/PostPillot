# Build "PostPilot" — an AI social media agent demo (web app + n8n)

## 1. Context

I am building a live demo for the **AI Sandbox at the Cameroon International Tech Summit**. The audience is **schools** (teachers, school staff, students). The demo runs on one laptop, shown on a big screen, and is operated by **one demonstrator only**. Visitors watch; they do not log in or use their phones.

**Name:** PostPilot. The AI agent does the flying (drafting, images, scheduling); the human is the pilot who decides what gets published.

**Goal of the demo:** show how an AI agent can do routine social media work while a human keeps final approval.

**Demo story (about 5 minutes):**
1. The demonstrator enters a one-paragraph event brief (e.g. a school science fair).
2. The agent drafts a Facebook post and a LinkedIn post, creates a matching image, and runs a safety check. Each step is visible live on screen.
3. The drafts are sent for approval, in the app and (optionally) on the demonstrator's phone via Telegram.
4. The demonstrator rejects one draft with a reason, the agent redrafts it, then the demonstrator approves.
5. The approved post is published now or scheduled.
6. A dashboard shows posts and engagement, and a button generates a short weekly report.

**Second goal:** the demonstrator (me) is new to n8n and wants to learn it. n8n must do the real work, and the workflows must be clean, well named, and easy to read and explain to visitors.

## 2. Hard constraints

- **Free tools only.** No paid services, except the OpenRouter credits I already have.
- **Platforms: Facebook and LinkedIn only.** Do NOT add X/Twitter (its API is no longer free).
- **English only** for the interface and generated posts.
- **Runs on Linux with Docker.** Everything starts with one command (`docker compose up`).
- **Single user, local only.** No login, no user accounts.
- **Must work without accounts.** I don't have demo Facebook/LinkedIn accounts yet. A **Mock mode** must let the full flow run end to end without any social media accounts.
- **Must work offline.** Conference Wi-Fi will be bad. An **Offline mode** must run the flow up to approval with a local model and no internet.
- Secrets live in `.env` only. Provide `.env.example` with every variable explained.
- Code style: short inline comments only. No decorative comment banners like `# ---- Section ----`.

## 3. Architecture

Docker Compose services:

| Service | Role |
|---|---|
| `web` | Next.js (App Router, TypeScript, Tailwind). The UI and a small API. Owns the app database (SQLite). |
| `n8n` | Official n8n image. Does all agent work through webhook-triggered workflows. |
| `ollama` | Local LLM for Offline mode. Pull a small model on first start (e.g. a 3B model such as `qwen2.5:3b` or `llama3.2:3b`; choose one that runs on an 8–16 GB RAM laptop). |
| `tunnel` (optional, Compose profile) | Cloudflare quick tunnel (`cloudflared`, no account needed) so Telegram approval links work from the phone. |

**Flow between app and n8n:**
- The app calls n8n **webhooks** to start work (generate, redraft, publish, report).
- n8n sends **progress events** back to the app (HTTP Request nodes calling e.g. `POST /api/runs/:id/events`) so the UI timeline updates live. The app pushes events to the browser with Server-Sent Events.
- n8n sends final results (drafts, image, publish result, report) back to the app the same way.
- Use a shared secret header between app and n8n.

**Workflow import:** n8n workflows live as JSON files in the repo (`n8n/workflows/`). On startup they are imported and activated automatically (use the n8n CLI in the container entrypoint; check the current n8n docs for the exact import/activate commands). Give workflows stable IDs so the app can link to them. Credentials should be created from `.env` where possible; otherwise document the manual steps clearly. Handle the n8n owner account setup on first launch (automate if possible, otherwise document it).

## 4. Modes and settings (always visible in the app header)

- **Online / Offline switch.** Online uses OpenRouter. Offline uses Ollama for text and a template image (see below).
- **Model picker.** List of OpenRouter models from config (include at least one free model, ID ending in `:free`, for testing). In Offline mode, shows the Ollama model.
- **Publishing: Real / Mock.** Mock simulates publishing (fake post ID and URL, fake engagement numbers that grow over time) so the whole demo works without accounts.
- **Telegram approval: On / Off.**
- **Demo trap: On / Off.** When on, the agent deliberately puts one plausible mistake in one draft (e.g. wrong date or an over-promise) so the demonstrator can catch and reject it. This teaches why human approval matters. The trap must not be visible in the UI until the draft is rejected.
- **Cost counter.** Shows the cost of the current run and total today. Read real cost from OpenRouter's usage data in the response if available (check current OpenRouter docs); Offline mode shows 0. Display in USD and FCFA (configurable exchange rate in `.env`).

## 5. n8n workflows

Keep each workflow small and focused, with clear node names (e.g. "Draft Facebook post", not "HTTP Request3") and sticky notes explaining each part in plain English. These are teaching material.

1. **PostPilot – Generate drafts**
   Webhook → send "started" event → build prompt from brief + brand voice preset + safety rules → LLM drafts Facebook and LinkedIn posts (structured JSON output) → send events per platform → **Safety check** LLM step (flags: names of students, photos of minors, personal data, unverifiable promises, dates/times that don't match the brief) → create image prompt → generate image → send results to app.
   - LLM node: OpenRouter (n8n has an OpenRouter Chat Model node) or Ollama, chosen by the mode sent from the app.
   - Image, Online: OpenRouter image model first; if it fails, fall back to Pollinations.ai (free, no key). Generate **one image per brief**, then resize/crop per platform.
   - Image, Offline: a branded template background with the event title and date written on it (n8n Edit Image node if available in the container; otherwise render it in the app with a server-side library). Must never fail.
2. **PostPilot – Redraft**
   Webhook with draft + rejection reason → LLM rewrites → safety check → send result.
3. **PostPilot – Telegram approval** (only when enabled)
   Send the draft text and image to the demonstrator's Telegram with Approve / Reject (use n8n's Telegram "send and wait for response" approval if it fits; check current n8n docs). Send the decision back to the app. The app accepts the **first** decision (app or Telegram) and ignores the later one; the UI shows where the decision came from ("Approved from Telegram").
   - Telegram links point to n8n, so the phone must reach the laptop: either same Wi-Fi with `WEBHOOK_URL` set to the laptop's LAN IP, or the `tunnel` profile. Provide a script that starts the tunnel, reads the generated URL, and restarts n8n with that `WEBHOOK_URL`.
4. **PostPilot – Publish**
   Webhook with platform, text, image, and "now" or a date/time.
   - Facebook: Meta Graph API page post with photo. "Post now" or native scheduling (Facebook requires the time to be at least 10 minutes in the future; verify the current min/max in Meta docs and validate this in the UI).
   - LinkedIn: n8n LinkedIn node (free "Share on LinkedIn" product). LinkedIn has no simple native scheduling here, so for scheduled posts use an n8n **Wait** node until the chosen time, then publish.
   - Mock: skip the API calls and return fake IDs/URLs.
   - Send result (post URL, status, errors) to the app.
5. **PostPilot – Weekly report**
   Two triggers: weekly Schedule trigger + webhook for the "Generate report now" button. Fetch Facebook post engagement (likes, comments, shares, reach where available) via Graph API, or mock numbers in Mock mode. LinkedIn: no stats (show "not available" — this is fine). LLM writes a short plain-English report (what worked, best post, one suggestion). Save to app and send to Telegram if enabled.

## 6. Screens

**The UI must be highly appealing, beautiful and modern.** It is the first thing visitors see, so it should feel like a polished, premium product, not a developer tool.

Design requirements:
- **Visual style:** modern SaaS look with a strong, distinctive identity (not a generic template). A clear colour palette with one bold accent colour, soft gradients, rounded cards, subtle shadows, generous spacing. Good typography (e.g. a modern Google Font such as Inter, Manrope or Plus Jakarta Sans). Light theme by default (projectors wash out dark themes), with an optional dark mode toggle.
- **Component library:** use shadcn/ui (with Radix) and lucide icons as the base, then style them to fit the PostPilot identity. Use Framer Motion for animation.
- **Widgets:** stat cards (posts published, approval rate, cost, engagement), small charts for engagement (e.g. Recharts), status badges, progress rings, toasts for events ("Approved from Telegram"), tooltips, modals and side sheets.
- **Buttons:** clear primary / secondary / destructive styles, hover and press states, loading spinners inside buttons while waiting.
- **Transitions:** smooth page and step transitions, cards that animate in, timeline steps that light up one after another, typing effect for streamed text, a satisfying animation when a post is approved or published (e.g. a check mark burst or light confetti).
- **Skeleton loaders** everywhere data is loading (drafts, image, dashboard, reports), plus a shimmer placeholder while the image is being generated.
- **Empty states** with a friendly illustration or icon and a clear next action.
- **Projector-friendly:** high contrast, large text readable from 3 meters, no tiny details that carry meaning. Layout works on a 1920×1080 screen and on a laptop screen.
- **Respect "reduced motion"** browser settings.
- Use generic platform icons, not copied brand assets.
- Before building screens, propose the visual direction (palette, font, 1–2 sample components) and let me approve it.

1. **Brief**
   - Event brief textarea.
   - School / organisation name.
   - Brand voice preset dropdown: *Formal school*, *Student club*, *Sports team* (each preset is a prompt snippet stored in config, easy to edit).
   - Platforms: Facebook, LinkedIn (checkboxes).
   - "Load example" button with 3 ready briefs set in Cameroon (e.g. a secondary school science fair in Yaoundé, a university open day in Buea, an inter-school football final in Douala). Use realistic but fictional names.
   - Big "Run agent" button.
2. **Agent at work**
   Live vertical timeline: Reading brief → Drafting Facebook → Drafting LinkedIn → Creating image → Safety check → Sent for approval. Each step shows status (waiting, running, done, failed), duration, and text appearing as it arrives. A "See the workflow" button opens the matching n8n workflow (and the current execution if possible) in a new tab.
3. **Review & approve**
   One preview card per platform that looks like a real Facebook / LinkedIn post (page name, avatar, text, image, like/comment bar). Under each: **Approve**, **Edit** (inline text edit), **Reject** (asks for a reason, then triggers Redraft and shows the new version; keep version history v1, v2…). Safety flags are highlighted inside the text with a short explanation.
4. **Schedule**
   For each approved post: "Post now" or "Schedule" with a date/time picker (validated per platform). Shows result with link to the live post (or mock link).
5. **Dashboard**
   List of runs and posts with status (draft, approved, scheduled, published, failed). Engagement numbers for Facebook (or mock). "Generate weekly report" button and list of past reports. Final card: "Total cost of this demo: X FCFA".

Also a small **Settings** page: check connections (n8n, Ollama, OpenRouter, Facebook, LinkedIn, Telegram) with green/red status and a "test" button each. This helps the demonstrator before the audience arrives.

## 7. Data (SQLite, app side)

Suggested tables: `runs` (brief, preset, mode, model, status, cost), `drafts` (run, platform, text, version, status, safety flags, trap flag), `images` (run, path, source: openrouter / pollinations / template), `decisions` (draft, approve/reject, reason, source: app / telegram, time), `posts` (draft, platform, status, scheduled time, external ID, URL, mock flag), `events` (run, step, status, message, time), `reports` (period, text, numbers). Adjust as you see fit.

## 8. Prompts and safety

- Keep all prompts in editable files (e.g. `prompts/*.md`), not hidden in code, so I can show and tweak them.
- Platform rules: Facebook friendly and short with a clear call to action; LinkedIn more professional, a bit longer. Suitable hashtags. No made-up facts: only use details from the brief.
- Safety rules for schools: no student names, no promises not in the brief, no personal phone numbers or addresses unless in the brief as official contact, respectful tone.
- Small local models give messy JSON: validate output, retry once, and fall back gracefully.

## 9. Documentation to write

- `README.md`: what PostPilot is, quick start in under 10 minutes, modes, troubleshooting.
- `docs/accounts-setup.md`: step-by-step for: OpenRouter key (and setting a spending limit), Telegram bot with BotFather and getting my chat ID, creating a demo Facebook Page + Meta developer app + long-lived Page access token, LinkedIn developer app with "Share on LinkedIn". Note which steps take time and should be done days before the event.
- `docs/n8n-beginner-guide.md`: for a total n8n beginner. What n8n is, how to open the editor, how to read a workflow, then a walkthrough of each PostPilot workflow node by node, how to view executions and debug, and 3 small exercises (e.g. add a new brand voice preset, add a Discord/email notification, change the report schedule).
- `docs/demo-script.md`: a 5-minute script for the demonstrator, with what to say at each step and how to use the Demo trap.
- `docs/offline-plan.md`: how to run in Offline + Mock mode, and how to record a short screen video of real publishing to show when there is no internet.

## 10. How to work

1. First, read this prompt and **ask me any questions** before writing code. Then propose a short plan (folder structure, phases).
2. Build in phases and make each phase work before moving on:
   1. Docker Compose + n8n + app skeleton + **Mock mode end to end** (fake LLM responses allowed at first).
   2. Real LLM drafts (OpenRouter + Ollama), live timeline, redraft.
   3. Images (OpenRouter → Pollinations → template).
   4. Telegram approval.
   5. Facebook and LinkedIn real publishing and scheduling.
   6. Dashboard and weekly report.
   7. Documentation and polish.
3. After each phase, tell me what works, what I need to set up, and how to test it.
4. Where you are unsure about current API details (n8n nodes and CLI, OpenRouter, Meta Graph API, LinkedIn API, Telegram), check the official docs instead of guessing.
5. Add basic tests for the API routes and one end-to-end smoke test that runs the full flow in Offline + Mock mode.
