# PostPilot

**An AI agent drafts your school's social media posts. You decide what gets published.**

PostPilot is a live demo for the AI Sandbox at the Cameroon International Tech Summit. You give it a one-paragraph event brief. It then:

1. writes a Facebook post and a LinkedIn post,
2. creates a matching image, or a 5–10 second video (you choose on the brief page),
3. runs a safety check (no student names, no personal data, no promises the brief does not make, no wrong dates),
4. asks **you** to approve, edit or reject each draft, in the app or on your phone through Telegram,
5. publishes now or at a scheduled time,
6. shows engagement on a dashboard and writes a short weekly report.

The AI agent does the flying. The human is the pilot.

All the agent work happens in **n8n** workflows that you can open and show to visitors. The web app is the cockpit.

```
 Browser ──► web (Next.js, login) ──webhooks──► n8n ──► OpenRouter (text, images, videos)
               │                                 │
               └──────── PostgreSQL ─────────────┘   (databases "postpilot" and "n8n")
    ▲             ▲                                 │──► Pollinations.ai (free image fallback)
    └── live SSE ─┴──────── progress events ◄───────┘──► Telegram / Facebook / LinkedIn
```

## Quick start (under 10 minutes)

You need Linux with Docker and Docker Compose, plus an [OpenRouter](https://openrouter.ai) API key.

```bash
cp .env.example .env
# Edit .env: set OPENROUTER_API_KEY, and long random values (openssl rand -hex 24)
# for POSTPILOT_SECRET and POSTGRES_PASSWORD
docker compose up -d --build
```

The first build downloads the n8n and Node images and the app dependencies. On a slow connection this can take a while, so do it before the event.

Then open:

| What | Address | Login |
|---|---|---|
| PostPilot app | http://localhost:3000 | `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env` (default `admin@postpilot.local` / `PostPilot2026!`). Change it after the first sign-in |
| n8n editor | http://localhost:5678 | `N8N_OWNER_EMAIL` / `N8N_OWNER_PASSWORD` from `.env` (default `demo@postpilot.local` / `PostPilot2026`) |

Next:

1. Go to **Settings** in the app and click **Test all**. n8n and OpenRouter must be green.
2. Go to **Brief**, click **Load example**, then **Run agent**.

On first start the app creates its tables and the default login in PostgreSQL, and the n8n container imports the five workflows from `n8n/workflows/`, activates them and creates the owner account. Follow it with `docker compose logs -f n8n` and look for lines starting with `[postpilot]`.

## Modes (always visible in the header)

| Switch | What it does |
|---|---|
| **Model** | The OpenRouter model that writes the posts. Edit the list in `config/models.json`. It includes a free `:free` model for testing. |
| **Publishing: Mock / Real** | **Mock** (default) never contacts Facebook or LinkedIn. It creates fake post links and fake engagement that grows over time, so the whole demo works without social accounts. **Real** posts to your Facebook Page and LinkedIn profile. |
| **Telegram: On / Off** | Also sends each draft to your phone with Approve / Reject buttons. The first decision wins, whether it comes from the app or Telegram. |
| **Demo trap: On / Off** | The agent hides one plausible mistake in one draft (wrong date or a fake promise). It is revealed only after you reject that draft. It shows why a human must approve. |
| **Cost counter** | Real cost reported by OpenRouter for this run and for today, in USD and FCFA (`FCFA_PER_USD` in `.env`). |

There is no local AI model: PostPilot needs internet access to reach OpenRouter. See [docs/offline-plan.md](docs/offline-plan.md) for what to do when the conference Wi-Fi fails.

## Project layout

```
docker-compose.yml        local stack: PostgreSQL + web + n8n (+ optional Cloudflare tunnel)
deploy/                   server stack (Caddy HTTPS), bootstrap script, prod .env template
.github/workflows/        CI/CD pipeline
.env.example              every setting, explained
config/                   models.json (model picker), examples.json (6 example briefs)
prompts/                  every AI prompt as an editable Markdown file, plus brand voice presets
n8n/workflows/            the 5 workflows (imported automatically)
n8n/entrypoint.sh         imports and activates the workflows, creates the Telegram credential and the owner
web/                      Next.js app (UI, API, login)
scripts/                  deploy.sh, tunnel.sh, test.sh, smoke.sh, build-workflows.mjs
docs/                     setup guides, n8n beginner guide, demo script
```

You can change the prompts in `prompts/` at any time. They are read on every run, so no restart is needed.

## Documentation

- [docs/deployment.md](docs/deployment.md): deploy to AWS EC2 (or any Ubuntu server) from your PC with `./scripts/deploy.sh`, or with GitHub Actions.
- [docs/accounts-setup.md](docs/accounts-setup.md): OpenRouter, Telegram, Facebook and LinkedIn step by step. **Start several days before the event.**
- [docs/workflows.md](docs/workflows.md): developer notes: what each workflow does, the app ⇄ n8n contract, and how the frontend follows a run.
- [docs/n8n-beginner-guide.md](docs/n8n-beginner-guide.md): learn n8n through the PostPilot workflows.
- [docs/demo-script.md](docs/demo-script.md): the 5-minute demo, what to say and when.
- [docs/offline-plan.md](docs/offline-plan.md): plan B for bad internet, and how to record a backup video.

## Tests

Both run in Docker; nothing is installed on your computer.

```bash
./scripts/test.sh     # type check + 28 API and auth tests (throwaway PostgreSQL)
./scripts/smoke.sh    # quick checks: health, login protection, sign-in, n8n
SMOKE_FULL=true ./scripts/smoke.sh   # also the whole agent story, Mock mode
```

The full smoke test uses real OpenRouter calls: about $0.03 with the default model, or free with a `:free` model (`SMOKE_MODEL=<id>`). It runs the whole story: brief, drafts, rejection and redraft, approval, publish now, scheduled publish, and weekly report.

## Troubleshooting

| Problem | Fix |
|---|---|
| Settings shows **n8n: workflows are not active** | `docker compose logs n8n \| grep postpilot`. Force a re-import with `N8N_FORCE_REIMPORT=true docker compose up -d n8n`, or open each workflow in n8n and switch it to Active/Published. |
| A run stops at **Drafting** with "The AI did not return a usable post" | Check the OpenRouter key and credit on the Settings page. Free models are rate-limited, so try a paid model from the picker. |
| The image is always the **branded template** | The OpenRouter image model failed (check `IMAGE_MODEL` and your credit) and Pollinations was unreachable. The demo still works. |
| Telegram buttons do nothing | Your phone cannot reach n8n. Set `N8N_WEBHOOK_URL=http://<laptop-LAN-IP>:5678/` (same Wi-Fi) and run `docker compose up -d n8n`, or run `./scripts/tunnel.sh`. |
| Telegram toggle is on but no message arrives | Check the token in Settings. You must send `/start` to your bot once. After changing the token, run `docker compose up -d n8n`. |
| I edited a workflow in n8n and want the original back | `N8N_FORCE_REIMPORT=true docker compose up -d n8n`. Your edits are overwritten. |
| A video run shows an **animated image** instead of an AI video | The video model refused or failed (check `VIDEO_MODEL`, its supported durations on openrouter.ai, and your credit). The reason is in the timeline. |
| Start from scratch | `docker compose down -v` deletes all data (PostgreSQL, images, n8n). |
| Forgot the app password | `docker compose exec db psql -U postpilot -d postpilot -c "DELETE FROM users"` then `docker compose restart web`: the default login from `.env` is created again. |
| Facebook says the scheduled time is invalid | It must be between 10 minutes and 30 days ahead. The app checks this before sending. |
