# Plan B: bad internet at the venue

PostPilot does **not** use a local AI model. All text and images come from OpenRouter over the internet. Without internet the agent cannot write new drafts. This page explains how to keep the demo going anyway.

## What needs internet

| Part | Needs internet? |
|---|---|
| App, dashboard, past runs, mock post pages | **No**. Everything is local |
| n8n editor and executions (showing the workflows) | **No** |
| Writing drafts, redraft, safety check, weekly report (OpenRouter) | Yes, but very little data (a few KB per call) |
| AI image (OpenRouter / Pollinations) | Yes, about 1–2 MB per image. Without it, the **branded template** is used automatically |
| Mock publishing | **No** |
| Telegram approval | Yes (phone and laptop) |
| Real Facebook / LinkedIn publishing | Yes |

Text calls are small, so a **phone hotspot** is usually enough even when the venue Wi-Fi is bad.

## Before the event

1. **Do several full runs at home**, with all three example briefs, so the Dashboard has history and good images. These runs stay in the database (`web-data` volume) and work offline.
2. **Pin a reliable model** in the header. Test it on a phone hotspot to check its speed.
3. **Record a backup video** of the full story, including real publishing (below).
4. Put the video on the laptop desktop. Don't rely on streaming it.

## Running on poor internet

1. Connect the laptop to a **phone hotspot** rather than the venue Wi-Fi.
2. Keep **Publishing: Mock** and **Telegram: Off**. Mock needs no network, and Telegram needs both devices online.
3. Choose a fast model. If image generation is slow, you can leave it: the agent falls back to Pollinations, then to the template, by itself.

## No internet at all

1. Open the **Dashboard** and click an earlier run. Its timeline, the review cards with highlights and the trap reveal (if it was rejected), and the published mock post are all still there.
2. Walk through the story with that run: *"Here is what the agent produced for this brief this morning…"*
3. Open the n8n editor, open **Executions**, click that earlier run, and show the data flowing through each node. This works fully offline and is often the most interesting part for technical visitors.
4. Play the backup video for the parts that need the internet: live drafting, Telegram, real publishing.

## Recording the backup video (about 15 minutes)

Record it on a good connection, with **Real** publishing if your accounts are ready (see [accounts-setup.md](accounts-setup.md)).

Tools (free): **OBS Studio** (`sudo apt install obs-studio`), or the built-in GNOME recorder (**Ctrl+Shift+Alt+R** starts and stops; the file goes to `~/Videos`). For the phone, use the phone's own screen recorder.

Script (2–3 minutes, follow [demo-script.md](demo-script.md)):

1. Set the browser to 1920×1080, full screen, light theme, zoom 125%.
2. Header: **Real** publishing, **Telegram: On**, **Demo trap: On**.
3. Load the science fair example → **Run agent**. Let the full timeline play.
4. Review: reject the trapped draft with a reason, show v2, approve one post in the app.
5. Approve the other post **on the phone** (record the phone screen too, or film it with a second phone).
6. Publish Facebook **now**. Click **View post** to show it live on the real Page.
7. Schedule LinkedIn 2–3 minutes ahead. Keep recording until it appears on your LinkedIn profile.
8. Dashboard → **Generate weekly report**.
9. Afterwards, delete the real test posts if you want.

Tips: close notifications (`Do not disturb`), hide bookmarks, and use a clean browser profile. Keep the raw video under 3 minutes. Visitors stay longer if it is short.
