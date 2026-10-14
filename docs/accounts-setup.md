# Accounts setup

PostPilot runs fully in **Mock mode** with only an OpenRouter key. The other accounts are needed only for Telegram approval and Real publishing.

| Account | Needed for | Time | When to start |
|---|---|---|---|
| OpenRouter | everything (AI text + images) | 10 min | any time |
| Telegram bot | approval from the phone | 10 min | any time |
| Facebook Page + Meta app | Real Facebook publishing | 1–2 h, sometimes longer | **at least 1 week before**: new accounts and apps can be held for review or rate-limited |
| LinkedIn app | Real LinkedIn publishing | 1 h + waiting | **at least 1 week before**: the "Share on LinkedIn" product and Page verification can take time |

After every change to `.env`, run `docker compose up -d` so both containers get the new values. Then use **Settings → Test all** in the app.

## 1. OpenRouter (required)

1. Sign up at https://openrouter.ai.
2. Add a few dollars of credit (*Settings → Credits*). A full demo run costs roughly 1–5 US cents with the default model. Free `:free` models cost nothing but are rate-limited. The limit is higher once you have bought at least some credit.
3. Create a key: *Settings → Keys → Create key*.
   - Set a **credit limit** on the key (e.g. $5). Even if the key leaks, it can never spend more.
4. Put it in `.env`: `OPENROUTER_API_KEY=sk-or-...`
5. Check that `IMAGE_MODEL` is a model that can output images. On https://openrouter.ai/models, filter by *Output modalities: image*.
6. For video posts, check `VIDEO_MODEL`. https://openrouter.ai/api/v1/videos/models lists every video model with its `supported_durations` (it must allow 5–10 s) and its price per second. The default `x-ai/grok-imagine-video-1.5-lite` at 480p costs about $0.10 for 5 s and $0.20 for 10 s. Every other video model costs more.

The model list in the header comes from `config/models.json`. Model names change often, so check the IDs on openrouter.ai/models before the event and update the file. No restart is needed.

## 2. Telegram bot (optional)

1. In Telegram, open **@BotFather** and send `/newbot`. Choose a name (e.g. *PostPilot Demo*) and a username ending in `bot`.
2. BotFather replies with a **token** like `123456:ABC-...`. Put it in `.env` as `TELEGRAM_BOT_TOKEN`.
3. Open your new bot and press **Start** (or send `/start`). A bot cannot write to you before you write to it.
4. Get your **chat ID**: open **@userinfobot** and press Start. It replies with your numeric ID. Put it in `.env` as `TELEGRAM_CHAT_ID`.
   - ⚠️ Do **not** use the number at the start of the bot token: that is the bot's own ID, and a bot cannot message itself.
   - **Several people:** list their IDs separated by commas, e.g. `TELEGRAM_CHAT_ID=123456789,987654321`. Each person must open the bot and press **Start** first. Everyone gets the drafts with Approve / Reject buttons and the weekly report. The first person to press a button decides; the others get *Too late* if they press afterwards. **Settings → Telegram → Test** sends a test message to each ID.
   - To send drafts to a **group** instead (several reviewers), add the bot to the group, send a message there, and use the group's ID (a negative number, see `getUpdates` below).
   - Alternative: open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser after messaging your bot and read `"chat":{"id": ...}`.
5. Run `docker compose up -d`. The n8n container creates the credential *PostPilot Telegram bot* from the token.
6. **Let the phone reach n8n.** The Approve / Reject buttons are links to n8n:
   - Same Wi-Fi: set `N8N_WEBHOOK_URL=http://<laptop-LAN-IP>:5678/` (find the IP with `hostname -I`), then `docker compose up -d n8n`.
   - Any network (recommended at the venue): `./scripts/tunnel.sh` starts a free Cloudflare tunnel and restarts n8n with its HTTPS address. The address changes each time.
7. Switch **Telegram: On** in the header and run a brief.

## 3. Facebook Page (optional, Real mode)

You post as a **Page**, not as a person. Create a demo Page so nothing goes to a real school's audience by mistake.

1. **Create a Page**: on Facebook, *Pages → Create new Page* (e.g. "PostPilot Demo School"). You must be its admin.
2. **Create a Meta developer account**: https://developers.facebook.com → *Get started*. You may need to verify a phone number.
3. **Create an app**: *My Apps → Create app*. Choose the use case for managing Pages / *Other → Business*, then give it a name.
4. **Get a user token with Page permissions**:
   1. Open the **Graph API Explorer**: https://developers.facebook.com/tools/explorer
   2. Select your app at the top right.
   3. Under *User or Page*, choose *Get User Access Token* and add these permissions: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_read_user_content`.
   4. Click *Generate Access Token* and allow access to your demo Page.
5. **Make it long-lived** (short tokens expire in about 1 hour):
   1. Open the **Access Token Debugger**: https://developers.facebook.com/tools/debug/accesstoken
   2. Paste the token and click *Extend Access Token*. Copy the long-lived user token.
6. **Get the Page token**: in the Graph API Explorer, paste the long-lived user token and run `GET me/accounts`. Copy your Page's `id` and `access_token`.
   - A Page token taken from a long-lived user token does not expire.
7. Put them in `.env`:
   ```
   FB_PAGE_ID=1234567890
   FB_PAGE_TOKEN=EAAG...
   ```
8. `docker compose up -d`, then **Settings → Facebook → Test** should show your Page name.

Notes:
- While the app is in **Development mode**, only people with a role on the app may see the posts it creates. To show posts to everyone, switch the app to **Live**, which needs a privacy policy URL. Test this days before the event.
- Scheduling: Facebook accepts times **between 10 minutes and 30 days** ahead. PostPilot checks this in the UI. Check the current limits in the [Pages API docs](https://developers.facebook.com/docs/pages-api/posts) before the event.
- If Meta changes its Graph API, update `FB_GRAPH_VERSION` (e.g. `v23.0`) to a version listed in the docs.

## 4. LinkedIn (optional, Real mode)

PostPilot posts on **your personal LinkedIn profile** using the free *Share on LinkedIn* product. Posting as a company page needs a partner-only API.

1. LinkedIn requires every developer app to be linked to a **LinkedIn Page**. If you have none, create one: *For Business → Create a Company Page*. A demo page is fine.
2. Go to https://developer.linkedin.com → *Create app*. Choose the Page, upload a logo, and accept the terms.
3. Verify the app with the Page. On the *Settings* tab, click *Verify* and send the link to the Page admin, which may be you.
4. On the **Products** tab, request:
   - **Share on LinkedIn** (scope `w_member_social`)
   - **Sign In with LinkedIn using OpenID Connect** (scopes `openid`, `profile`)
   These are usually approved instantly, but can take longer.
5. **Generate a token**: in the developer portal open *Docs and tools → OAuth Token Tools* (Token generator). Select your app and tick `openid`, `profile` and `w_member_social`. Click *Request access token* and sign in. Copy the token. It is valid for **60 days**, so note the expiry date.
6. Put it in `.env`: `LINKEDIN_TOKEN=AQ...`
7. `docker compose up -d`, then **Settings → LinkedIn → Test**. The message shows your **member URN**. Copy it into `.env`:
   ```
   LINKEDIN_AUTHOR_URN=urn:li:person:AbC123xyz
   ```
   and run `docker compose up -d` again.
8. `LINKEDIN_API_VERSION` must be a recent month (format `YYYYMM`, less than one year old). If posting fails with a version error, set it to the current or previous month.

9. `LINKEDIN_VISIBILITY` sets who can see the posts: `PUBLIC` (anyone) or `CONNECTIONS` (only your 1st-degree connections). Keep `CONNECTIONS` while testing, then switch to `PUBLIC` for the real event. Restart n8n after changing it.

Testing without showing test posts to anyone:
- LinkedIn has no "only me" visibility. `CONNECTIONS` is the most private option the API offers.
- Safest: create a separate test LinkedIn account with no connections, and generate the token while signed in with it. Its posts are then seen by nobody.
- Otherwise, delete each test post right after checking it: open the post link from the run page, then *⋯ → Delete*.
- Use Mock mode for rehearsals, and Real mode only for one final check.

Notes:
- LinkedIn has no simple free scheduling, so scheduled LinkedIn posts wait inside n8n (a **Wait** node) and post at the chosen time. Keep the laptop and Docker running until then.
- LinkedIn statistics need a partner API, so the dashboard shows "not available" for LinkedIn. This is expected.

## Checklist for the day before

- [ ] **Settings → Test all**: everything you need is green.
- [ ] One full run in **Mock** mode with the model you will use on stage.
- [ ] If you use Real mode: one real post to each platform (then delete it), and the backup video recorded ([offline-plan.md](offline-plan.md)).
- [ ] Telegram: test a button press from your phone **on the venue network** (or via `scripts/tunnel.sh`).
- [ ] LinkedIn token not expiring during the event.
- [ ] OpenRouter credit left and a credit limit set on the key.
