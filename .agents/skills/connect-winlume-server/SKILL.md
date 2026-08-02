---
name: connect-winlume-server
description: Connect to, inspect, deploy, and operate the WinLume production server at 176.122.164.148. Use when asked to deploy WinLume, inspect WinLume production logs or service health, update its server-side environment, or operate winlume.v2api.top.
---

# Connect WinLume Server

Use this host only for WinLume paths and service operations. It may contain other services; do not modify them.

## Connection

- Host: `176.122.164.148`
- User: `root`
- Authentication: `C:\Users\XXB\.ssh\winlume-176-deploy`

Never copy, print, commit, or read back the private-key contents. Use OpenSSH in batch mode:

```powershell
ssh -i 'C:\Users\XXB\.ssh\winlume-176-deploy' `
  -o BatchMode=yes -o ConnectTimeout=20 `
  root@176.122.164.148 `
  'hostname; systemctl is-active winlume.service'
```

Each SSH invocation starts a new shell. Put dependent remote commands in one command string.

## Production Layout

- App: `/opt/winlume`
- Previous release: `/opt/winlume.previous`
- Service: `winlume.service`
- Internal address: `127.0.0.1:3001`
- Environment: `/opt/winlume/.env`
- Data: `/opt/winlume/data`
- Public site: `https://winlume.v2api.top`

Keep `.env` and `data` across releases. Treat all values in `.env` as secrets and inspect key presence rather than their values when possible.

## Inspect And Verify

Before changes, confirm the target and current health:

```bash
systemctl is-active winlume.service
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/studio
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/api/skills
```

After a restart or deployment, require the service to remain `active` and both local endpoints to return `200`. Inspect `journalctl -u winlume -n 100 --no-pager` or `/var/log/winlume.log` only when a check fails.

## Deployment

Prefer `.github/workflows/deploy.yml`. It publishes the standalone artifact using `DEPLOY_HOST`, `DEPLOY_USER`, and `DEPLOY_SSH_PRIVATE_KEY`; set the host secret to `176.122.164.148` and keep the key only in GitHub Secrets.

For a manual release, first build and package locally, upload the artifact, retain `/opt/winlume.previous` for rollback, preserve `.env` and `data`, then restart only `winlume.service`. Do not delete or alter other `/opt` applications.

If a deployment health check fails, restore `/opt/winlume.previous` before broad troubleshooting and verify the same endpoints again.
