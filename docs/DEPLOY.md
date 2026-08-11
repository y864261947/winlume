# Reizo production deployment

## Runtime topology

Reizo is a single Next.js process in front of one PostgreSQL database and
one external service, new-api:

| Component | Location | Owns |
| --- | --- | --- |
| Next.js web/control plane | `127.0.0.1:3001` on the Reizo host | Auth.js, account and console UI, Studio, `/api/v1/*` proxy. |
| new-api | external (`NEW_API_URL`, e.g. `https://v2api.top`) | Model inference, per-team quota, usage logs. |
| PostgreSQL | private network, Reizo host | Users, organizations, memberships, encrypted new-api credential/token mappings. No wallet or usage-ledger tables. |

nginx terminates public TLS and forwards everything to port `3001` — there is
no second protocol listener to route around. `/api/v1/*` is a normal Next.js
route, not a separate process.

There used to be a second process here (a Go gateway doing streaming proxy
and its own wallet accounting) and, before that, a direct new-api
integration retired during that gateway's rollout. Both are gone: the
Go gateway was decommissioned and its source deleted; new-api is the
integration again, this time as the sole quota/inference authority behind a
thin Reizo proxy rather than something Reizo's own billing engine dual-wrote
against. See
[docs/superpowers/specs/2026-08-11-reizo-new-api-integration-design.md](superpowers/specs/2026-08-11-reizo-new-api-integration-design.md)
for the full design and rationale.

## Host

- App directory: `/opt/reizo` (Next.js standalone package), port `127.0.0.1:3001`
- Previous release: `/opt/reizo.previous` (rollback target)
- Service: `reizo.service`
- Environment: `/opt/reizo/.env` (optional `/etc/reizo/web.env`, loaded after
  and takes precedence for the same key)
- Data: `/opt/reizo/data`
- Public site: configure the production DNS name and nginx virtual host for
  this environment

Existing operational host credentials remain in the gitignored
`docs/INFRA.md`. Connection details for both the Reizo host and the new-api
host are also captured in this repo's Claude skills
(`connect-reizo-server`, and the new-api box's own `connect-new-api-server-*`
skill) if you're operating with an agent.

## Required secrets and environment

`/opt/reizo/.env` (owner-only permissions; never commit real values or put
them in CI logs):

```bash
NODE_ENV=production
PORT=3001
HOSTNAME=127.0.0.1
NEXTAUTH_URL=https://winlume.example
AUTH_SECRET=replace-with-a-long-random-secret
DATABASE_URL=postgres://reizo:...
REIZO_AUTH_MODE=reizo

# new-api — required, not legacy/optional.
NEW_API_URL=https://v2api.top
# PAT of a dedicated new-api admin/root account. Server-only; mints new
# team accounts and manages quota (POST /api/user/, POST /api/user/manage).
NEW_API_ADMIN_TOKEN=replace-with-a-new-api-admin-pat
# AES-256-GCM key (32 bytes, hex or base64) encrypting every stored new-api
# password/PAT/token secret. Generate with: openssl rand -hex 32
# No rotation mechanism — losing or changing this breaks every stored
# ciphertext (every team's PAT, every virtual key's underlying new-api sk).
REIZO_TOKEN_ENCRYPTION_KEY=replace-with-openssl-rand--hex-32-output
# Optional — deployment-specific new-api token group for team/Studio tokens.
# Check GET /api/user/groups on the target new-api instance before assuming
# its "default" group (a GORM column default, not necessarily a live
# routable group) actually works. Default here: gpt-pro.
# NEW_API_TOKEN_GROUP=gpt-pro
```

## Database and migration

### Automatic on every deploy

The production GitHub Actions workflow (`.github/workflows/deploy.yml`) runs
schema migrations **after** unpacking the new release and restoring `.env`,
and **before** restarting `reizo.service`:

```bash
# remote host, WorkingDirectory=/opt/reizo
node scripts/db-migrate.mjs
```

The standalone tarball ships:

- `drizzle/*.sql` and `drizzle/meta/_journal.json`
- `scripts/db-migrate.mjs` (depends only on `pg`, no `drizzle-kit` on the host)

If migrations fail, the deploy aborts and the new process is **not** started
— code that expects new columns/tables must never come up against an old
schema.

`scripts/db-migrate.mjs` is compatible with drizzle-kit's
`drizzle.__drizzle_migrations` journal. On a database that already has
tables but an empty journal, it auto-baselines migrations whose effects are
already present, then applies only the remaining ones.

**Destructive migrations**: some migrations (e.g. `0007_reizo_new_api_integration.sql`,
which drops the old wallet/billing-engine tables) are drop-only, forward-only
changes. Take a `pg_dump` immediately before any deploy that includes one,
even if the dropped data is otherwise disposable — cheap insurance against an
unrelated table being caught by mistake:

```bash
cd /opt/reizo && set -a && . ./.env; set +a
pg_dump "$DATABASE_URL" -Fc -f /root/reizo-pre-<change>-$(date +%Y%m%d%H%M%S).dump
```

### Manual / local

From a full repo checkout (dev machines, emergency ops):

```bash
npm ci
# Prefer the production-compatible runner (also works locally):
npm run db:migrate:prod
# Or drizzle-kit's own runner (requires drizzle-kit):
npm run db:migrate
```

On the production host after a manual unpack:

```bash
cd /opt/reizo
set -a && . ./.env && [ -f /etc/reizo/web.env ] && . /etc/reizo/web.env; set +a
node scripts/db-migrate.mjs
# optional: node scripts/db-migrate.mjs --dry-run
```

## Web package and deploy

Standard path: push to `master`. `.github/workflows/deploy.yml` builds,
packages the standalone artifact, ships it to the host, stops `reizo`, swaps
`/opt/reizo` → `/opt/reizo.previous` and unpacks the new release, preserves
`.env`/`data`, runs migrations, and restarts `reizo.service` — health-checking
`GET /studio` (must return `200`) before declaring success.

Manual release, if needed:

```bash
npm ci
npm run build
npm run package:deploy
# produces reizo-deploy.tar.gz
```

Unpack into `/opt/reizo`, preserve `.env` and `data/`, run
`node scripts/db-migrate.mjs`, then restart only `reizo.service`. Do not
delete or alter other `/opt` applications.

`reizo.service`:

```ini
[Unit]
Description=Reizo Next.js Studio
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/reizo
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=HOSTNAME=127.0.0.1
EnvironmentFile=-/opt/reizo/.env
EnvironmentFile=-/etc/reizo/web.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
StandardOutput=append:/var/log/reizo.log
StandardError=append:/var/log/reizo.log

[Install]
WantedBy=multi-user.target
```

Rollback: restore `/opt/reizo.previous` (and the pre-deploy `pg_dump` if a
destructive migration already ran), restart `reizo.service`, re-verify the
health endpoints below.

## Health checks

```bash
systemctl is-active reizo.service
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/studio
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/api/skills
```

Both HTTP checks must return `200`. Inspect `journalctl -u reizo -n 100
--no-pager` or `/var/log/reizo.log` only when a check fails.

## nginx routing

```nginx
location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
    proxy_read_timeout 3600;
}
```

`/api/v1/*` streaming responses (SSE chat completions) go through this same
location block — do not cache `/api/`, `/studio`, or streaming responses.

## Skills corpus

The production web image should include the full `content/skills` corpus. Run
`IMPORT_ALL=1 node scripts/import-agency-agents.mjs` before the web build when
regenerating it. MCP is not enabled; tools are server builtins only.
