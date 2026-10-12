# How the workflows work (developer notes)

A technical overview for developers and AI engineers: what each n8n workflow does, how n8n receives the workflows, and how the Next.js app talks to them. For a click-by-click tour of the editor, see [n8n-beginner-guide.md](n8n-beginner-guide.md).

## 1. Split of responsibilities

```
 Browser ◄──SSE /api/stream── web (Next.js) ──POST /webhook/postpilot-*──► n8n ──► OpenRouter (chat, image, video)
    │                          │      ▲                                    │  ├──► Pollinations.ai
    └──fetch /api/* (cookie)──►│      └──POST /api/internal/* (secret)─────┘  ├──► Telegram Bot API
                               │                                              └──► Facebook Graph / LinkedIn REST
                               └──► PostgreSQL "postpilot"        n8n ──► PostgreSQL "n8n"
                                    files: /data/images, /data/videos
```

- **n8n is the agent.** It makes every LLM, image, video and social-network call, so the whole reasoning chain can be seen in the editor and in *Executions*.
- **The app is the source of truth and the UI.** It owns the database, the login, the media files (crops, ffmpeg conversion, fallback rendering) and the live updates. It holds no AI logic.
- n8n keeps no state between workflows. Everything it needs comes in the webhook payload, or it fetches it from the app (prompts, report data).

## 2. The contract between the app and n8n

**Auth.** Both directions send the header `x-postpilot-secret: $POSTPILOT_SECRET`.
- Every n8n webhook starts with an *Is this our app?* If-node that checks the header.
- Every `/api/internal/*` route calls `checkSecret()`.
- `/api/images/*` and `/api/videos/*` normally need a session cookie. `proxy.ts` also accepts the secret header there, so n8n can download media.
- The build script fails if a workflow calls the app without the header (`checkAppCallsAreSigned`).

**App → n8n** (`lib/n8n.ts → callWebhook()`, fire-and-forget, 15 s timeout):

| Webhook path | Workflow (ID) | Called from | Main payload |
|---|---|---|---|
| `postpilot-generate` | Generate drafts (`ppGenerateDrafts`) | `createRun()` | `runId, brief, organisation, preset, platforms, model, trapPlatform, media, videoSeconds` |
| `postpilot-redraft` | Redraft (`ppRedraftPost001`) | `decide()` on reject | `draftId, platform, previousText, reason, brief, model…` |
| `postpilot-approval` | Telegram approval (`ppTelegramApprov`) | after the safety check, and after each redraft (if Telegram is on) | `draftId, text, flags, mediaType, mediaPath` |
| `postpilot-publish` | Publish (`ppPublishPost001`) | `publishDraft()` | `postId, platform, text, mock, scheduledAt/scheduledUnix, mediaType, mediaPath, videoBytes` |
| `postpilot-report` | Weekly report (`ppWeeklyReport01`) | *Generate weekly report* button (also a Monday 08:00 cron inside n8n) | `trigger` |

**n8n → app** (all `POST` unless noted):

| Route | Purpose |
|---|---|
| `GET /api/internal/prompts` | All `prompts/*.md` and brand voice presets. Read on every run, so prompt edits need no restart. |
| `/api/internal/runs/:id/events` | Progress event `{ step, status, message, data?, cost? }`. This is the main channel (see §4). |
| `/api/internal/images` | Image as JSON data URL or raw bytes. The app crops it per platform, falls back to a template, and animates it for video runs. |
| `/api/internal/videos` | Raw video bytes. The app converts it to H.264 + faststart and extracts a poster frame. If the video is broken, it animates the template instead. |
| `/api/internal/decisions` | Approve/reject from Telegram. The first decision wins (row lock), and the answer tells n8n whether it was accepted. |
| `/api/internal/posts/:id` | Publish result `{ status, externalId, url, error }`. |
| `GET /api/internal/report-data`, `/api/internal/reports` | Weekly report input and output. |

## 3. How the workflows are built and served

1. **Source of truth:** `scripts/build-workflows.mjs` (with `scripts/lib/n8n-builder.mjs`). Code nodes are written as real JS functions and serialised. Node IDs come from a hash of their names, and workflow IDs are fixed, so the generated JSON diffs cleanly.
2. `node scripts/build-workflows.mjs` writes `n8n/workflows/0X-*.json`. **Commit these files.** `deploy.sh` refuses to deploy if they are out of date.
3. **Import into n8n:** `n8n/entrypoint.sh` runs in the n8n container (bind-mounted locally, baked into `n8n/Dockerfile` for the server).
   - It hashes the JSON files plus the DB identity. When the hash changes, it runs `n8n import:workflow`, then `n8n publish:workflow` for each ID, then starts n8n.
   - It also creates the Telegram credential from `.env` and the owner account (`setup-owner.mjs`).
4. Edits made in the n8n editor survive restarts, but the next changed import overwrites them. To keep an editor change, port it back into the builder.
5. Workflows read configuration through `$env` (`N8N_BLOCK_ENV_ACCESS_IN_NODE=false`), e.g. `OPENROUTER_API_KEY`, `IMAGE_MODEL`, `VIDEO_MODEL`, `FB_*`, `LINKEDIN_*`, `APP_INTERNAL_URL`.

> Right after n8n restarts with new workflow files, it can serve the previous version for a few seconds. Wait until `/api/health/n8n` is green before testing a change.

## 4. Run lifecycle and how the frontend follows it

```
generating ──(safety done/failed)──► awaiting_approval ──(all latest drafts approved)──► approved ──(all posts published)──► published
     └──(brief or every draft failed)──► failed
```

- n8n reports each step with *Tell app* nodes → `handleEvent()` in `lib/runs.ts`.
- Steps: `brief`, `draft_<platform>`, `image` (also used for video), `safety`, `approval`, `redraft_<platform>`. Each one is `running` → `done`/`failed`.
- `handleEvent` turns `data` into rows (drafts, safety flags, the trap), adds `cost` to the `costs` table, and moves the run status.
- Everything also lands in the `events` table, so the timeline can be rebuilt from the database at any time.
- **Live updates:** every write calls `publish()` on an in-process `EventEmitter` (`lib/bus.ts`). `GET /api/stream` turns it into Server-Sent Events, and `AppProvider` keeps one `EventSource` open.
  - Pages filter by `runId` and simply **refetch** `GET /api/runs/:id`. The SSE message is only a hint, not the data.
  - A 10 s poll covers missed events. This design assumes a single web container, because the bus is in memory.
- **Drafts are versioned.** A redraft or a human edit inserts v2, v3… and supersedes the pending one. Decisions are unique per draft.
- **Costs:** every OpenRouter call asks for `usage: { include: true }` and passes `usage.cost` back in the event. The header shows run, today and total in USD/FCFA.

## 5. The workflows

**Generate drafts** (webhook → ~50 nodes)
1. Check the secret → load prompts → build one job per platform.
2. **Loop** over the platforms: LLM call with `response_format: json_object` → validate the JSON → one stricter retry → plain-text fallback.
   - Optional **demo trap**: a second LLM call plants one mistake and returns the planted quote. The app hides it until the draft is rejected.
3. **Media.** One LLM call writes `image_prompt`, `video_prompt`, `title` and `date` (`prompts/image-prompt.md`). Then:
   - *Image run:* OpenRouter image model (`modalities: ['image']`) → Pollinations → app template. This step never fails.
   - *Video run:* `POST /api/v1/videos` (`VIDEO_MODEL`, `duration`, `16:9`, `VIDEO_RESOLUTION`) returns a job.
     - Loop: *Wait 20 s* → `GET polling_url`. A Code node counts attempts with `$runIndex` (max 36 = 12 min) and reports progress.
     - On `completed`, download `unsigned_urls[0]` (with the auth header) → `/api/internal/videos`.
     - On any failure (refused job, failed job, timeout, no file), it continues into the **image** chain. The app then animates that image into a video of the same length (ffmpeg zoompan). So a video run always ends with a video.
4. **Safety check:** one LLM call over all drafts, using `safety-check.md` + `safety-rules.md`, which returns quoted flags. Flags that overlap the planted trap are removed. Then *Tell app: safety done*, and the app hands over to the human.

**Redraft:** same draft → validate → retry → safety pattern for a single platform, with the reviewer's reason in the prompt. The result arrives as step `redraft_<platform>`.

**Telegram approval:**
1. Sends the media (`sendPhoto` / `sendVideo`).
2. A *Send and wait* node pauses the execution until a button is pressed (max 2 h). The execution shows as *Waiting*, and Telegram's button calls n8n's public `N8N_WEBHOOK_URL`.
3. The decision goes to `/api/internal/decisions`, and the reply message says whether it arrived in time.

**Publish:**
- *Mock:* optional Wait until `scheduledAt` → fake ID and `/mock-post/:id` URL.
- *Facebook:* image → `/{page}/photos`, video → `graph-video…/{page}/videos`. Scheduling is native (`published=false` + `scheduled_publish_time`, 10 min to 30 days).
- *LinkedIn:* a Wait node handles scheduling.
  - Image: `images?action=initializeUpload` → PUT → `/rest/posts`.
  - Video: `videos?action=initializeUpload` gives one upload URL per ~4 MB part. Each part is fetched from the app with an HTTP `Range` header, PUT to LinkedIn, and its ETag collected. Then `finalizeUpload`, then poll `/rest/videos/{urn}` until `AVAILABLE`, then `/rest/posts`.
- Every branch ends in `/api/internal/posts/:id`.

**Weekly report:** cron or webhook → `/api/internal/report-data` → Facebook Graph stats for real posts (mock posts carry simulated engagement) → LLM writes the report → saved in the app → optionally sent to Telegram.

## 6. Media pipeline in the app

| File | Role |
|---|---|
| `lib/images.ts` | `sharp`: saves the original + Facebook 1200×630 / LinkedIn 1200×627 crops (attention crop). The SVG template is the last fallback. |
| `lib/videos.ts` | `ffmpeg`/`ffprobe` (installed in `web/Dockerfile`): remux or transcode to H.264 + `faststart`, poster JPEG, Ken Burns animation of an image. |
| `app/api/images/[file]`, `app/api/videos/[file]` | Serve media files. Video supports `Range` (browser seeking and LinkedIn part uploads). |

Files live in the `web-data` volume (`/data`). Rows (`images`, `videos`) point to them. A run's `media` column (`image` | `video`) and `video_seconds` decide which one the review, publish and Telegram steps use (`postMedia()` in `lib/runs.ts`).

## 7. Changing things

| You want to… | Do this |
|---|---|
| Change wording, tone or rules | Edit `prompts/*.md`. Next run, no restart (n8n loads them through the app). |
| Change models | Text models: `config/models.json` (header picker). Media models: `IMAGE_MODEL`, `VIDEO_MODEL`, `VIDEO_RESOLUTION` in `.env` (restart n8n). |
| Change a workflow | Edit `scripts/build-workflows.mjs` → `node scripts/build-workflows.mjs` → restart n8n (re-imported because the hash changed) → commit the JSON. |
| Add a timeline step | Emit a new `step` from a *Tell app* node, add its label in `STEP_LABELS` (`lib/types.ts`) and, if it should always show, in `timelineSteps()`. |
| Add a workflow | Give it a fixed ID in the builder, add it to `WORKFLOW_IDS` in `n8n/entrypoint.sh` and to `WORKFLOWS` in `lib/config.ts`, and start it with `callWebhook()`. |

Debugging tip: every run page has **See the workflow**, which opens the exact n8n execution. Failed HTTP nodes use *continue on fail*, so the error JSON is visible in the node output instead of stopping the execution.
