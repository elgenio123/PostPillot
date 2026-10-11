# Demo script (about 5 minutes)

**Audience:** teachers, school staff, students. **You:** the only person using the laptop. Visitors watch the big screen.

## Before visitors arrive

- [ ] `docker compose up -d`. In the app, **Settings → Test all**: n8n and OpenRouter are green (Telegram too if you use it).
- [ ] Header: **Mock** publishing (unless you have tested Real), **Demo trap: On**, Telegram as you prefer, and a model that worked in your morning test run.
- [ ] Browser zoom 100–125%, full screen (F11), light theme.
- [ ] A second tab with the n8n editor open on **PostPilot – Generate drafts**, already logged in.
- [ ] If you use Telegram: phone unlocked, bot chat open, sound on.
- [ ] Dashboard already has 1–2 earlier runs, so it never looks empty.

## The 5 minutes

### 0:00 – Hook (20 s)

> "Who here posts on the school's Facebook page? How long does one good post take: writing, finding a picture, checking it? Let's see how an AI agent can do the routine work, while **you** keep the final say."

### 0:20 – The brief (40 s)

On the **Brief** page, click **Load example → Science fair in Yaoundé**.

> "This is all I give it: one paragraph, the school's name, and the voice: formal, student club or sports team."

Point at the right column, *How it works*.

> "The agent flies. I'm the pilot. Nothing is published unless I say so."

Click **Run agent**.

### 1:00 – Agent at work (60 s)

The timeline lights up step by step.

> "Now it reads the brief… writes a Facebook post: short and friendly… a LinkedIn post: more professional… then it creates an image for this event… and finally a **safety check**: no student names, no phone numbers, no promises the school didn't make, no wrong dates."

While it runs, click **See the workflow** (n8n tab).

> "This is the agent's brain. It is not magic, it's a flowchart. Each box is one step. This one calls the AI, this one checks the answer, and here is the safety check. Teachers could build this."

Return to the app tab.

### 2:00 – Review and the trap (90 s)

The app moves to **Review & approve**. The two posts look like real Facebook and LinkedIn posts.

> "Here are the drafts. Yellow highlights are things the safety check wants me to look at."

**The Demo trap.** One draft contains a planted mistake: a slightly wrong date or time, or a promise like "free lunch for everyone". Read both drafts **aloud, slowly**, and invite the audience:

> "Before I approve, can anyone spot a problem? Compare with the brief."

When someone finds it, or after 15 seconds you point it out, click **Reject**, choose *The date or time is wrong* (or type the reason), and click **Reject and redraft**.

A red box appears: **"Well caught! This was the demo trap."**

> "I asked the agent to hide one mistake on purpose. It looked completely normal. AI can sound confident and still be wrong. That's exactly why a human approves every post."

The agent writes v2 within seconds. Show the **v1 / v2** tabs.

> "It rewrote the post using my feedback. Version history is kept."

### 3:30 – Approve (30 s)

- Click **Approve** on the first post (confetti).
- **With Telegram on:** take the phone, show the message with the image, and press **✅ Approve** on the second post. The app shows **"Approved from Telegram"**.

> "I can approve from my phone while I'm walking around the school. Whichever answer comes first wins."

### 4:00 – Publish (40 s)

The app moves to **Publish**.

- Facebook: **Post now** → **Publish now**. Confetti, then **View post**.
- LinkedIn: **Schedule**, pick a time 2 minutes from now → **Schedule post**. A countdown appears.

> "Post now, or schedule it, for example for Monday morning when parents are online."

In Mock mode:

> "Today we're in Mock mode, so nothing really goes online, but the steps are the real ones."

### 4:40 – Dashboard and report (20 s)

Open **Dashboard**: stat cards, the engagement chart (mock numbers grow live), and the posts table.

Click **Generate weekly report**.

> "Every Monday it writes a short report: what worked, the best post, one idea for next week."

Point at the final card:

> "And the cost of this whole demo today: **X FCFA**."

### 5:00 – Close

> "The agent did the routine work: writing, picture, checks, scheduling. The human did the important part: judging. That is how we should use AI in schools."

## If something goes wrong

| Situation | What to do |
|---|---|
| A step stays *Running* for more than 60 s | Switch to a faster model in the header and run again. Meanwhile show the n8n execution. |
| The run fails (red step) | Say "and this is why we have a timeline", then click **See the workflow** and show the red node. Re-run with **Load example**. |
| The image is the **branded template** | That's the designed fallback: "When the AI image service is down, it still produces a branded picture. It never blocks." |
| The trap was not obvious | Reject anyway with "Check the dates against the brief". The trap box still explains it. |
| Telegram button does nothing | Approve in the app. "The first decision wins, from wherever it comes." |
| Internet is down | See [offline-plan.md](offline-plan.md): show an earlier run from the Dashboard and the backup video. |

Reset between visitor groups: just start a new brief. Old runs stay on the Dashboard, which helps the next demo.
