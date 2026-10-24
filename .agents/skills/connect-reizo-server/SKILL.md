---
name: connect-reizo-server
description: Connect to, inspect, deploy, and operate the Reizo production server at 40.160.139.134. Use when asked to deploy Reizo, inspect Reizo production logs or service health, update its server-side environment, or operate winlume.v2api.top.
---

# Connect Reizo Server

## Current production target — confirmed 2026-10-08

- Public origin `https://reizo-ai.com` now resolves to `40.160.139.134`; SSH user is `ubuntu`.
- The user supplied password access in the current session. Pass it through a temporary environment variable; never write it into repository files or logs. No local key for this host has been confirmed.
- Runtime: `/opt/reizo`, service `reizo`, port `3001`.
- Current release is GitHub master `3a2079d08250282df65ba583d272b6ee92998fec`, BUILD_ID `zy6nWhwhfpm1WfesMsPqk`, deployed successfully by Actions run `37873566492` on 2026-10-09. API catalogue dark appearance now covers table headers, filters, pagination, billing cards and code examples. Model rows display resolved supplier brand logos with local fallbacks. Enterprise header is now a single row with a return-to-product link in the navigation. It shares the product header scroll compaction and stable spacer, centered desktop links, right-aligned account/CTA, and visible mobile avatars. The utility row was removed at the user’s request. Enterprise dark appearance is complete, including hero, illustrations, workflow cards and security content; daytime styling is preserved. The shared product header now compacts on scroll on home, Agent, API and other product pages, with stable page spacing. It includes the October 8 design, motion and retained business functions. Immediate rollback runtime: `/opt/reizo.previous` (build `uhWgxu6EL2JVe7u68qCGz`). Preserved manual build source: `/opt/reizo-motion-build-20261008`. `/agent` now embeds the new labelled standalone showcase; the previously preserved October 6 interaction is no longer linked. All prior application routes remain. See `docs/operations/reizo-motion-20261008.md` and `docs/operations/reizo-design-20261008.md` for source scope, reconstruction, build and deployment evidence.
- User reported the server expires on 2026-10-20; recheck availability before operations after that date.
- The earlier Git/source mismatch was reconciled and merged into remote master on 2026-10-08 at `3cb68c8`. Automatic deployment succeeded; `/studio/tasks` and account/profile routes returned 200. The original local master was fast-forwarded to `3a2079d` on 2026-10-09 while preserving its unpublished staged/unstaged changes; do not reset or overwrite its existing index. Continue from fetched remote master or the attached release worktree.
- Prefer the reconciled remote master baseline and its existing deployment workflow. Preserve `.env`, `data`, and `backups`, apply migrations before restart, and retain the previous release. On 2026-10-08 the deployed environment was byte-identical to the previous release and systemd reported active/running with zero restarts.

The host and key in the legacy instructions below are historical; do not use them as the current production target.

Use this host only for Reizo paths and service operations. It may contain other services; do not modify them.

## Connection

- Host: `176.122.164.148`
- User: `root`
- Authentication: `C:\Users\XXB\.ssh\winlume-176-deploy` (local key filename kept until rotated)

Never copy, print, commit, or read back the private-key contents. Use OpenSSH in batch mode:

```powershell
ssh -i 'C:\Users\XXB\.ssh\winlume-176-deploy' `
  -o BatchMode=yes -o ConnectTimeout=20 `
  root@176.122.164.148 `
  'hostname; systemctl is-active reizo.service'
```

Each SSH invocation starts a new shell. Put dependent remote commands in one command string.

## Production Layout

- App: `/opt/reizo`
- Previous release: `/opt/reizo.previous`
- Service: `reizo.service`
- Internal address: `127.0.0.1:3001`
- Environment: `/opt/reizo/.env`
- Data: `/opt/reizo/data`
- Public site: `https://winlume.v2api.top`（域名暂未切换，仍用 winlume）

Keep `.env` and `data` across releases. Treat all values in `.env` as secrets and inspect key presence rather than their values when possible.

## Inspect And Verify

Before changes, confirm the target and current health:

```bash
systemctl is-active reizo.service
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/studio
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/api/skills
```

After a restart or deployment, require the service to remain `active` and both local endpoints to return `200`. Inspect `journalctl -u reizo -n 100 --no-pager` or `/var/log/reizo.log` only when a check fails.

## Deployment

Prefer `.github/workflows/deploy.yml`. It publishes the standalone artifact using `DEPLOY_HOST`, `DEPLOY_USER`, and `DEPLOY_SSH_PRIVATE_KEY`; set the host secret to `176.122.164.148` and keep the key only in GitHub Secrets.

Every web deploy must apply Postgres schema migrations **before** restarting `reizo.service`. The workflow does this automatically via:

```bash
cd /opt/reizo && node scripts/db-migrate.mjs
```

The package must contain `drizzle/*.sql`, `drizzle/meta/_journal.json`, and `scripts/db-migrate.mjs`. Migration failure aborts the deploy on purpose so the app never boots against a missing column/table.

For a manual release:

1. Build and package locally (`npm run build && npm run package:deploy`).
2. Upload the artifact; retain `/opt/reizo.previous` for rollback; preserve `.env` and `data`.
3. Source env (`/opt/reizo/.env`, optional `/etc/reizo/web.env`) and run `node scripts/db-migrate.mjs`.
4. Restart only `reizo.service`.

Do not delete or alter other `/opt` applications.

If a deployment health check fails, restore `/opt/reizo.previous` before broad troubleshooting and verify the same endpoints again. If login or any DB-backed path fails with `column … does not exist` / `relation … does not exist`, check migration state first:

```bash
# on the host
cd /opt/reizo && set -a && . ./.env; set +a
node scripts/db-migrate.mjs --dry-run
psql "$DATABASE_URL" -c 'SELECT id, left(hash,12) AS hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at;'
```
