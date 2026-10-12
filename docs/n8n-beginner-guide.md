# n8n for beginners, with PostPilot

This guide assumes you have never used n8n. By the end you will be able to read every PostPilot workflow, explain it to a visitor, follow a run step by step, and make small changes yourself.

## 1. What is n8n?

n8n ("n-eight-n") is a tool for **automating work by connecting boxes**. Each box is a **node** that does one thing: receive a request, call a website, run a bit of code, send a Telegram message, wait until a certain time. You link nodes with arrows, and data flows from left to right.

A set of connected nodes is a **workflow**. PostPilot has five:

| Workflow | Started by | Job |
|---|---|---|
| PostPilot – Generate drafts | the **Run agent** button | brief → posts → image → safety check |
| PostPilot – Redraft | **Reject** with a reason | rewrite one post using the reason |
| PostPilot – Telegram approval | the app, when Telegram is on | ask on the phone, report the decision |
| PostPilot – Publish | **Publish now / Schedule** | post to Facebook / LinkedIn (or Mock) |
| PostPilot – Weekly report | Monday 08:00, or the **Generate report** button | collect numbers, write a report |

**Why n8n for an AI agent?** Every step is visible. The audience can see where the AI is called, where the safety check sits, and where a human must decide. Nothing is hidden in code.

## 2. Open the editor

1. Start PostPilot (`docker compose up -d`).
2. Open http://localhost:5678 and log in with `N8N_OWNER_EMAIL` / `N8N_OWNER_PASSWORD` from `.env`.
3. On the **Overview** page you see the five PostPilot workflows. Click one to open it.

From the app you can also click **See the workflow** on a run, or use the links on the **Settings** page.

## 3. How to read a workflow

- **Trigger nodes** (with a lightning bolt) start the workflow. PostPilot uses:
  - **Webhook**: a web address the app calls, e.g. `/webhook/postpilot-generate`.
  - **Schedule Trigger**: runs at fixed times (Monday 08:00).
- **Arrows** show the order. Some nodes have two exits:
  - **If** nodes have a *true* exit (top) and a *false* exit (bottom).
  - **Loop Over Items** has a *loop* exit (repeat for each item) and a *done* exit (after the last one).
- **Items**: data travels as a list of *items*, each holding some JSON. If a node receives 2 items, it usually runs twice. That is how "one post per platform" works.
- **Sticky notes** (the coloured boxes) explain each part in plain English. Read them first.
- **Expressions**: inside a node, text like `{{ $json.platform }}` is replaced by data at run time.
  - `$json` = the data of the current item.
  - `$('Node name').item.json` = data from an earlier node.
  - `$env.OPENROUTER_API_KEY` = a value from the `.env` file.

Double-click any node to open it. You will see its **input** on the left, its **settings** in the middle, and its **output** on the right, after a run.

### The node types PostPilot uses

| Node | Used for |
|---|---|
| Webhook | receive a request from the app |
| If | make a yes/no decision (e.g. "Answer usable?") |
| HTTP Request | call OpenRouter, Facebook, LinkedIn, Pollinations, and the app itself ("Tell app: …") |
| Code | small JavaScript steps: build a prompt, read the AI's JSON answer |
| Loop Over Items | handle Facebook, then LinkedIn |
| Wait | pause until a scheduled time |
| Telegram | send messages, and *Send and wait for response* for the Approve / Reject buttons |
| Schedule Trigger | run the weekly report |

## 4. Walkthrough of each workflow

### 4.1 PostPilot – Generate drafts

**Part 1: Start**
1. **Brief received** (Webhook): the app sends `runId`, `brief`, `organisation`, `preset`, `platforms`, `model` and `trapPlatform`.
2. **Is this our app?** (If): compares the `x-postpilot-secret` header with `POSTPILOT_SECRET`. A wrong secret means the workflow stops. This is basic security.
3. **Tell app: reading brief** (HTTP Request): sends a progress event, and the first timeline step lights up in the app. Every "Tell app" node works the same way: it POSTs to `/api/internal/runs/<id>/events`.
4. **Load prompts** (HTTP Request): fetches all files from the `prompts/` folder through the app. Edit a prompt file and the next run uses it.
5. **Prepare drafting jobs** (Code): builds one item per platform. Each item holds the full instructions for the AI: rules + brand voice + safety rules + platform rules.

**Part 2: Write one post per platform**
6. **One platform at a time** (Loop Over Items): sends the Facebook item through the loop, then the LinkedIn item.
7. **Tell app: drafting** → **Draft post with AI** (HTTP Request to OpenRouter `chat/completions`). We ask for JSON: `{"text": ..., "hashtags": [...]}`.
8. **Check the AI answer** (Code): reads the JSON. AI models sometimes return broken JSON, so this node sets `ok` to true or false.
9. **Answer usable?** (If): if not, **Ask again, stricter** repeats the question with a firmer instruction, and **Check second answer** accepts plain text as a last resort.
10. **Is this the trap draft?** (If): only when the Demo trap is on, for one platform. **Plant the demo mistake** asks the AI to change one detail (date or promise) and to report what it changed. The app keeps this secret until the draft is rejected.
11. **Draft is final** → **Tell app: draft ready**: sends the text to the app, where it appears in the timeline and on the review card.
12. **Back to the loop**: returns to *One platform at a time* for the next platform.

**Part 3: Paint one image**
13. **All drafts written** (Code): runs after the loop. It stops the workflow if no post could be written.
14. **Describe the image**: the AI writes a picture description and a short title.
15. **Paint image (OpenRouter)**: an image model returns the picture as base64 data.
16. **Got an image?** If yes, **Save image in app**. If no:
    - **Paint image (Pollinations)**: a free service, no key needed.
    - **Got a Pollinations image?** If yes, **Save Pollinations image in app**. If no, **Use the template image**: the app draws a branded picture with the event title and date. This never fails.
17. The app crops the image for Facebook (1200×630) and LinkedIn (1200×627).
18. **Video runs** (Visual = Video on the brief page) take the **Video post?** branch first. **Start the video (OpenRouter)** creates a video job, then **Wait 20 s** → **Check video status** repeats until the video is ready (a loop you can watch live in *Executions*). **Save video in app** stores it. If anything fails, the workflow paints an image instead (steps 15–16) and the app turns it into a slow-zoom video, so a video run always ends with a video.

**Part 4: Safety check**
19. **Prepare safety check** → **Safety check with AI**: a second AI call compares each draft with the brief and the school safety rules.
20. **Read flags & hide the demo trap**: reads the warnings. If the demo trap is on, it removes the warning that points at the planted mistake, so the human has to find it.
21. **Tell app: safety done**: the app highlights the flagged words and asks the human to decide.

### 4.2 PostPilot – Redraft

The same pattern, for one post: **Rejected draft received** → secret check → **Load prompts** → **Build redraft prompt**, which includes the old draft and your reason → **Redraft with AI** → check the JSON (ask again if broken) → **Safety check with AI** → **Tell app: new version ready**. The app shows it as v2, v3…

### 4.3 PostPilot – Telegram approval

1. **Draft needs approval** → secret check → **Write the Telegram message**.
2. **Has an image?** → **Download image from app** → **Send image to Telegram**.
3. **Ask for approval on Telegram**: the Telegram node's *Send and wait for response* operation. It sends the text with ✅ Approve / ❌ Reject buttons, then **pauses** the execution, for at most 2 hours. In *Executions* you will see it as *Waiting*.
4. When a button is pressed, Telegram opens a link to n8n. That is why your phone must be able to reach n8n (`N8N_WEBHOOK_URL` or `scripts/tunnel.sh`). The execution continues.
5. **Read the decision** → **Tell app the decision**. The app accepts only the **first** decision for each draft.
6. **Confirm on Telegram** says "Approved", "Rejected", or "Too late: already decided in the app".

### 4.4 PostPilot – Publish

1. **Post to publish** → secret check → **Mock publishing?**
2. **Mock** (top): if scheduled, **Wait until the scheduled time (mock)**. Then **Make a fake post** creates a fake ID and a link to a mock post page, and **Tell app: published (mock)** reports it.
3. **Facebook?** (Real mode):
   - Facebook: **Download image for Facebook** → **Post photo to Facebook Page**, a multipart upload to the Graph API `/{page-id}/photos`. For a later time the URL adds `published=false&scheduled_publish_time=...`, and Facebook does the scheduling itself → **Read Facebook answer** → **Tell app: Facebook result**.
   - LinkedIn: **Wait until the scheduled time** (only when scheduled) → **Prepare LinkedIn text**, which escapes special characters and turns #tags into LinkedIn hashtags → **Get a LinkedIn upload slot** → **Download image for LinkedIn** → **Upload image to LinkedIn** → **Create LinkedIn post** → **Read LinkedIn answer** → **Tell app: LinkedIn result**.

### 4.5 PostPilot – Weekly report

1. Two triggers: **Every Monday at 08:00** and **Report button pressed**, which goes through the secret check.
2. **Get posts of the last 7 days**: the app returns settings and posts. Mock posts already include their fake numbers.
3. **Posts needing Facebook numbers** → **Real Facebook post?** → **Get Facebook numbers** from the Graph API, for real posts only.
4. **Combine all numbers** → **Load prompts** → **Write report with AI**, using `prompts/report.md` → **Read the report**, with a plain-text fallback.
5. **Save report in app** → **Telegram on?** → **Send report to Telegram**.

## 5. Watch a run and debug

1. Click **Executions** at the top of a workflow, or *Overview → Executions* for all workflows.
2. Each line is one run: *Succeeded*, *Error* or *Waiting*.
3. Click one. The workflow opens in read-only mode with **green ticks** on the nodes that ran and the **number of items** on each arrow.
4. Click any node to see exactly what it received and returned. For example:
   - **Draft post with AI** output: the raw OpenRouter answer, including `usage.cost`.
   - **Read flags & hide the demo trap**: which warnings were found.
5. A red node shows the error message. Common causes:
   - `401` from OpenRouter: wrong `OPENROUTER_API_KEY`.
   - `ECONNREFUSED web:3000`: the app container is not running.
   - Telegram `chat not found`: wrong `TELEGRAM_CHAT_ID`, or you never pressed Start in your bot.

**Try a node by hand:** open a workflow and click **Execute workflow**. For webhook workflows, n8n shows a *test URL* and waits for a request. It is easier to start a run from the app and look at the execution afterwards.

**Making changes:** edit, then click **Save** (and **Publish**, if your n8n version asks for it). Your edits survive restarts. To return to the original workflows, run `N8N_FORCE_REIMPORT=true docker compose up -d n8n`.

## 6. Exercises

### Exercise 1: Add a brand voice preset (5 minutes, no n8n change)

1. Create `prompts/presets/parents-association.md`:
   ```
   Brand voice: Parents association.
   Warm and practical, written by parents for parents. Focus on what families need to know: time, place, what to bring.
   ```
2. Reload the app. *Parents association* appears in the **Brand voice** list.
3. Run a brief with it, then open the execution of **Generate drafts** and click **Prepare drafting jobs**. Your text is inside the system prompt.

**What you learned:** the workflow loads prompts from the app on every run (**Load prompts** node), so content changes need no workflow change.

### Exercise 2: Get an email or Discord message when a post is published (15 minutes)

1. Open **PostPilot – Publish**.
2. Drag a new arrow from **Tell app: published (mock)** to a new node:
   - Email: search for **Send Email** (needs SMTP credentials, e.g. a Gmail app password).
   - Discord: create a webhook in a Discord channel (*Channel settings → Integrations → Webhooks*). Then add an **HTTP Request** node: method POST, URL = the Discord webhook, body JSON `{ "content": "New post published: {{ $('Make a fake post').item.json.url }}" }`.
3. Save, publish a post in Mock mode, and check your inbox or channel.

**What you learned:** adding a notification is one node at the end of the right branch.

### Exercise 3: Change the report schedule (5 minutes)

1. Open **PostPilot – Weekly report** and double-click **Every Monday at 08:00**.
2. Change it to *Every Friday at 16:00*, and rename the node to match.
3. Save. In the executions list you will see the next automatic run at the new time.

**Bonus:** change `prompts/report.md` so the report ends with a motivational sentence for the communication team.
