# WinLume production deploy

## Host

- Server: `38.76.188.156` (aaPanel nginx + systemd)
- App: `/opt/winlume` Next.js **standalone**, port `127.0.0.1:3001`
- Service: `winlume.service`
- Public hostname (intended): **`winlume.v2api.top`**
- nginx vhost: `/www/server/nginx/conf/winlume.v2api.top.conf` (HTTP → reverse proxy 3001)

This machine is **not** the by-your-side production host of record anymore (`by-your-side` pm2 may appear stopped).

Secrets and passwords: local gitignored `docs/INFRA.md` (or sibling by-your-side INFRA §1).

## Cloudflare (zone `v2api.top`)

Required for public HTTPS:

| Record | Type | Content | Proxy |
|--------|------|---------|--------|
| `winlume` | A | `38.76.188.156` | **DNS only** (grey cloud) recommended first, same as historical by-your-side direct style |

Then on server (after DNS propagates):

```bash
certbot certonly --webroot -w /www/wwwroot/acme-challenge -d winlume.v2api.top
# then extend nginx conf with 443 ssl server block (mirror by-your-side.v2api.top.conf style)
/www/server/nginx/sbin/nginx -t && /www/server/nginx/sbin/nginx -s reload
```

Optional Cloudflare later: orange-cloud proxy, WAF, cache rules (do **not** cache `/api/*` or `/studio` HTML aggressively).

Wrangler / Workers are **not** required for this VPS deploy path.

## GitHub Actions auto-deploy

Workflow: `.github/workflows/deploy.yml`  
Triggers: **push to `master`** (includes merged PRs) and manual `workflow_dispatch`.

### Secrets to set

Repo → Settings → Secrets and variables → Actions:

| Secret | Example |
|--------|---------|
| `DEPLOY_HOST` | `38.76.188.156` |
| `DEPLOY_USER` | `root` |
| `DEPLOY_SSH_PASSWORD` | (server password) |
| `WINLUME_GATEWAY_TOKEN` | (optional, chat gateway bearer) |
| `NEW_API_URL` | optional, default `https://v2api.top` |

Without these secrets the workflow will fail at the upload step.

## Manual package

```bash
npm ci
npm run build
node scripts/package-standalone.mjs
# produces winlume-deploy.tar.gz
```

SSH ops skill: `.agents/skills/connect-app-server/`.
