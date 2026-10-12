# Deploying PostPilot to a cloud server

PostPilot deploys with **GitHub Actions** to one Ubuntu server on **AWS EC2** (any Ubuntu VM works). Every push to `main` runs:

| Stage | What it does | Runs on |
|---|---|---|
| **Setup** | Image names, checks the workflow JSON and Compose files, decides whether to deploy | every push and PR |
| **Build** | Builds the `postpilot-web` and `postpilot-n8n` images (ARM for AWS Graviton by default) and pushes them to GitHub Container Registry (ghcr.io) | every push (PRs: build only) |
| **Test** | Type check + 28 API tests against a real PostgreSQL | every push and PR |
| **Bootstrap** | Installs Docker, swap and firewall rules, **only on a fresh server**. If the server is ready, it does nothing | `main`, when secrets exist |
| **Deploy** | Copies the Compose file, Caddyfile and `.env`, pulls the new images, restarts | `main`, when secrets exist |
| **Smoke test** | Health check, login protection, sign-in, n8n workflows active. Optional full agent run | `main`, when secrets exist |

Until the server secrets exist, the last three stages are skipped and the pipeline stays green.

On the server, only **Caddy** is exposed. It serves the app on 80/443 and n8n on 5678, and gets free HTTPS certificates when you set a domain. PostgreSQL holds both the app database (`postpilot`) and n8n's (`n8n`). Uploaded images live in a Docker volume.

## 1. Create the server on AWS

Everything below is in the AWS console (https://console.aws.amazon.com). Expected cost: about **US$17–20 per month** for a `t4g.small`, so **$100 of credits lasts about 5 months**.

### 1.1 Protect your credits first (5 min)

1. Top right → your name → **Billing and Cost Management → Budgets → Create budget**.
2. Choose the **Monthly cost budget** template, amount **$25**, your email → *Create budget*. AWS emails you before you spend more than planned.
3. *Billing → Free tier / Credits*: note when your credits and free plan end. A **free plan** account is closed after 6 months unless you upgrade to a paid plan, so upgrade before then if the server must stay up.

### 1.2 Pick the region

Top right, region selector: **Europe (Paris) eu-west-3**. It's close to Cameroon and has Graviton instances. Create everything below in this same region.

### 1.3 Create the SSH key (one key for you and for GitHub)

On your PC:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/postpilot_aws -C "postpilot-deploy" -N ""
cat ~/.ssh/postpilot_aws.pub
```

In AWS: **EC2 → Key pairs → Actions → Import key pair**. Name it `postpilot`, paste the content of `postpilot_aws.pub`, then *Import*.

### 1.4 Create the firewall (security group)

**EC2 → Security groups → Create security group**:

- Name: `postpilot-sg`. VPC: the default one.
- **Inbound rules** (*Add rule* for each, source **Anywhere-IPv4 0.0.0.0/0**):

| Type | Port | Why |
|---|---|---|
| SSH | 22 | GitHub Actions deploys over SSH. Its addresses change, so it must be open; only the key can log in |
| HTTP | 80 | Web app, and HTTPS certificate checks |
| HTTPS | 443 | Web app over HTTPS |
| Custom TCP | 5678 | n8n editor and Telegram buttons |

- Outbound: leave "All traffic". → *Create security group*.

### 1.5 Launch the server

**EC2 → Instances → Launch instances**:

| Field | Value |
|---|---|
| Name | `postpilot` |
| Image (AMI) | **Ubuntu Server 24.04 LTS**, architecture **64-bit (Arm)** |
| Instance type | **t4g.small** (2 vCPU, 2 GB; the bootstrap adds 2 GB swap). `t4g.medium` (4 GB) is smoother but costs twice as much |
| Key pair | `postpilot` |
| Network settings → Edit | *Select existing security group* → `postpilot-sg`. Auto-assign public IP: Enable |
| Storage | **20 GiB gp3** |

→ *Launch instance*.

> If you pick an Intel/AMD type instead (`t3.small`, `m7i-flex.large`…), set the GitHub variable `IMAGE_PLATFORMS` to `linux/amd64` (step 4).

### 1.6 Give it a fixed address (Elastic IP)

**EC2 → Elastic IPs → Allocate Elastic IP address → Allocate**, then select it → **Actions → Associate Elastic IP address** → instance `postpilot` → *Associate*.

Write down the IP, e.g. `13.38.120.7`. Without an Elastic IP, the address changes when the instance stops.

### 1.7 Your free HTTPS domain

AWS's `ec2-…amazonaws.com` names can't get a Let's Encrypt certificate. Use **sslip.io** instead (no account needed): replace the dots of your Elastic IP with dashes.

`13.38.120.7` → **`13-38-120-7.sslip.io`**

This is your `APP_DOMAIN`. The app will be at `https://13-38-120-7.sslip.io` and n8n at `https://13-38-120-7.sslip.io:5678`.

### 1.8 Check the connection

```bash
ssh -i ~/.ssh/postpilot_aws ubuntu@13.38.120.7
```

Answer `yes` to the fingerprint question, then `exit`. You don't need to install anything: the **Bootstrap** stage installs Docker and swap on the first deployment.

## 2. Other providers

Any Ubuntu 22.04/24.04 VM works the same way: open ports 22, 80, 443 and 5678, use a hostname for HTTPS (sslip.io works everywhere), and set `IMAGE_PLATFORMS` to match the CPU.

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
| `SSH_HOST` | the Elastic IP, e.g. `13.38.120.7` |
| `SSH_USER` | `ubuntu` |
| `SSH_PRIVATE_KEY` | the whole content of `~/.ssh/postpilot_aws` (the private key, including the BEGIN/END lines) |
| `PROD_ENV` | the server `.env`: copy [`deploy/prod.env.example`](../deploy/prod.env.example), fill it in, and paste the whole text |
| `SMOKE_EMAIL` | the app login used by the smoke test (same as `ADMIN_EMAIL`) |
| `SMOKE_PASSWORD` | its password. **Update this secret whenever you change that password in the app** |

**Variables** (*Variables* tab):

| Name | Value |
|---|---|
| `APP_URL` | `https://13-38-120-7.sslip.io` (your `APP_DOMAIN` with https://) |
| `IMAGE_PLATFORMS` | optional: only if your instance is not ARM, e.g. `linux/amd64` |

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
ssh -i ~/.ssh/postpilot_aws ubuntu@<elastic-ip>
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
