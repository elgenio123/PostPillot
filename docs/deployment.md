# Deploying PostPilot to a cloud server

PostPilot deploys with **GitHub Actions** to one Linux VM on a free tier (Oracle Cloud or Azure). Every push to `main` runs:

| Stage | What it does | Runs on |
|---|---|---|
| **Setup** | Image names, checks the workflow JSON and Compose files, decides whether to deploy | every push and PR |
| **Build** | Builds the `postpilot-web` and `postpilot-n8n` images for **amd64 + arm64** and pushes them to GitHub Container Registry (ghcr.io) | every push (PRs: build only) |
| **Test** | Type check + 28 API tests against a real PostgreSQL | every push and PR |
| **Bootstrap** | Installs Docker, swap and firewall rules, **only on a fresh server**. If the server is ready, it does nothing | `main`, when secrets exist |
| **Deploy** | Copies the Compose file, Caddyfile and `.env`, pulls the new images, restarts | `main`, when secrets exist |
| **Smoke test** | Health check, login protection, sign-in, n8n workflows active. Optional full agent run | `main`, when secrets exist |

Until the server secrets exist, the last three stages are skipped and the pipeline stays green.

On the server, only **Caddy** is exposed. It serves the app on 80/443 and n8n on 5678, and gets free HTTPS certificates when you set a domain. PostgreSQL holds both the app database (`postpilot`) and n8n's (`n8n`). Uploaded images live in a Docker volume.

## 1. Create the server

Use an **Ubuntu 24.04 or 22.04** image. The bootstrap script supports Ubuntu/Debian only.

### Option A: Oracle Cloud Always Free (recommended: up to 4 ARM CPUs and 24 GB RAM, free forever)

1. Sign up at https://cloud.oracle.com (a card is needed for verification; Always Free resources are not charged).
2. *Compute → Instances → Create instance*:
   - Image: **Canonical Ubuntu 24.04**.
   - Shape: **Ampere → VM.Standard.A1.Flex**, 2 OCPU / 12 GB is plenty. If Oracle says "out of capacity", try another availability domain or try later.
   - Networking: keep "Assign a public IPv4 address".
   - SSH keys: upload your **personal** public key (for your own access).
3. Open the ports. Go to the instance → *Subnet* → *Security List* → *Add Ingress Rules*, with source `0.0.0.0/0`, TCP, destination ports **80, 443, 5678**.
   (Ubuntu on Oracle also blocks ports with iptables. The bootstrap stage fixes that.)
4. Hostname for HTTPS: Oracle gives no free domain name. Use **sslip.io**, which needs no account: if the IP is `141.147.10.20`, your domain is `141-147-10-20.sslip.io`. Let's Encrypt works with it.
5. SSH user: `ubuntu`.

### Option B: Azure free account (12 months free B1s, x86)

1. Sign up at https://azure.microsoft.com/free.
2. *Virtual machines → Create*:
   - Image: **Ubuntu Server 24.04 LTS**. Size: **B1s** (free 12 months; 1 GB RAM, so the bootstrap adds 2 GB swap. B2s is smoother if you have credit).
   - Authentication: SSH public key, username e.g. `azureuser`.
   - Inbound ports: allow **SSH (22), HTTP (80), HTTPS (443)**.
3. After creation: VM → *Networking* → *Add inbound port rule* → TCP **5678** (n8n, for Telegram buttons and the editor).
4. Free domain name: VM → *Public IP address* → *Configuration* → **DNS name label** (e.g. `postpilot-demo`) → Save. Your domain is `postpilot-demo.<region>.cloudapp.azure.com`. Also set the IP *Assignment* to **Static**.
5. SSH user: the username you chose.

## 2. Give GitHub access to the server

Create a key pair **only for deployments** on your PC:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/postpilot_deploy -C "github-actions-postpilot" -N ""
```

Add the public key to the server:

```bash
ssh ubuntu@<server-ip> "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys" < ~/.ssh/postpilot_deploy.pub
```

The SSH user needs passwordless `sudo`. That is the default for `ubuntu` on Oracle and for the admin user on Azure.

## 3. Push the code to GitHub

```bash
git add -A && git commit -m "PostPilot"
git remote add origin git@github.com:<you>/postpilot.git
git push -u origin main
```

The first run builds and tests. Deploy stages are skipped until step 4.

## 4. Add the secrets

GitHub → your repository → *Settings → Secrets and variables → Actions*.

**Secrets** (*New repository secret*):

| Name | Value |
|---|---|
| `SSH_HOST` | server public IP, e.g. `141.147.10.20` |
| `SSH_USER` | `ubuntu` (Oracle) or your Azure username |
| `SSH_PRIVATE_KEY` | the whole content of `~/.ssh/postpilot_deploy` (the private key, including the BEGIN/END lines) |
| `PROD_ENV` | the server `.env`: copy [`deploy/prod.env.example`](../deploy/prod.env.example), fill it in, and paste the whole text |
| `SMOKE_EMAIL` | the app login used by the smoke test (same as `ADMIN_EMAIL`) |
| `SMOKE_PASSWORD` | its password. **Update this secret whenever you change that password in the app** |

**Variables** (*Variables* tab):

| Name | Value |
|---|---|
| `APP_URL` | `https://<your domain>` (or `http://<ip>` without a domain) |

Optional: *Settings → Environments → production → Required reviewers* makes every deployment wait for your approval.

Generate the random values for `PROD_ENV` with `openssl rand -hex 24`. Use letters and digits only for `POSTGRES_PASSWORD`.

## 5. Deploy

Push to `main`, or run *Actions → CI/CD → Run workflow*. Tick **full_smoke** to also run the whole agent story (costs a few cents). Then:

1. Open `APP_URL` and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
2. Change the password (orange banner), then update the `SMOKE_PASSWORD` secret.
3. Open n8n at `https://<domain>:5678` and sign in with `N8N_OWNER_EMAIL` / `N8N_OWNER_PASSWORD`.
4. Telegram buttons work directly: n8n's public address is the server, so no tunnel is needed.

The first HTTPS request can take ~30 s while Caddy gets the certificate.

## Operating the server

```bash
ssh ubuntu@<server-ip>
cd /opt/postpilot
docker compose ps                      # status
docker compose logs -f web n8n         # logs
docker compose restart n8n             # restart one service
```

**Backup the databases** (app + n8n):

```bash
docker compose exec -T db pg_dumpall -U postpilot | gzip > ~/postpilot-$(date +%F).sql.gz
```

**Restore** onto an empty stack: `gunzip -c backup.sql.gz | docker compose exec -T db psql -U postpilot -d postgres`.

**Roll back:** in *Actions*, open the last good run of an older commit and click *Re-run all jobs*. It redeploys that commit's images.

**Change a setting** (API keys, Telegram…): update the `PROD_ENV` secret and re-run the workflow. Note that `ADMIN_*` and `N8N_OWNER_*` only apply on the very first start. Change those passwords in the app and in n8n instead.

## Security notes

- Every page and API route needs a signed-in session, except `/login`, `/api/health` and the n8n callbacks, which are protected by `POSTPILOT_SECRET`.
- Sessions are random 256-bit tokens in an httpOnly, SameSite=Lax cookie (Secure over HTTPS). Only a SHA-256 hash is stored. They expire after 7 days.
- Passwords are hashed with scrypt. Five wrong passwords from the same address lock that email for 10 minutes.
- The n8n editor is reachable on port 5678 (needed for the Telegram buttons). Use a strong `N8N_OWNER_PASSWORD`.
- Container images on ghcr.io are private by default. The deploy job logs in with a short-lived token.
