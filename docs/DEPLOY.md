# WinLume production deploy

## Host

- Server: `104.160.47.89` (nginx + systemd)
- App: `/opt/winlume` Next.js **standalone**, port `127.0.0.1:3001`
- Previous release (for rollback / env copy): `/opt/winlume.previous`
- Service: `winlume.service`
- Public hostname: **`https://winlume.v2api.top`**

## Cloudflare (zone `v2api.top`)

Required for public HTTPS:

| Record | Type | Content | Proxy |
|--------|------|---------|--------|
| `winlume` | A | `104.160.47.89` | **DNS only** (grey cloud) recommended first |

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

| Secret | Required | Notes |
|--------|----------|--------|
| `DEPLOY_HOST` | Yes | `104.160.47.89` |
| `DEPLOY_USER` | Yes | `root` |
| `DEPLOY_SSH_PRIVATE_KEY` | Yes | Ed25519 key authorized on the host |
| `WINLUME_GATEWAY_TOKEN` | Optional | Chat bearer. **Only overwrites** that key when set. |
| `WINLUME_IMAGE_GATEWAY_TOKEN` | Optional | Image bearer (生图分组). **Only overwrites** when set. |
| `WINLUME_IMAGE_MODEL` | Optional | e.g. `gpt-image-2`. Only overwrites when set. |
| `NEW_API_URL` | Optional | Default `https://v2api.top` |

### How `.env` is handled on each deploy

1. Whole tree is swapped: `/opt/winlume` → `/opt/winlume.previous`, new tarball unpacked.
2. **`/opt/winlume.previous/.env` is copied back** into the new release (so you do **not** re-enter tokens every time).
3. `data/` is copied the same way.
4. GitHub secrets only **upsert** their own keys when non-empty. Empty secret ⇒ leave the value already on the server.

So: set image token once on the server **or** once as `WINLUME_IMAGE_GATEWAY_TOKEN` in GitHub Secrets; subsequent deploys keep it.

Without `DEPLOY_*` secrets the workflow will fail at the upload step.

## Manual package

```bash
npm ci
npm run build
node scripts/package-standalone.mjs
# produces winlume-deploy.tar.gz
```

## Skills corpus

Production image should include full `content/skills` (run
`IMPORT_ALL=1 node scripts/import-agency-agents.mjs` before build if regenerating).

MCP is not enabled; tools are server builtin only.

See also `content/skills/README.md` for import paths, allowlist vs full mode, and featured flags.

SSH ops skill: `.agents/skills/connect-app-server/`.
