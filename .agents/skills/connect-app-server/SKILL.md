---
name: connect-app-server
description: Connect to and operate the production app server (38.76.188.156) for WinLume — SSH, deploy standalone builds, systemd/nginx status, logs, one-off diagnostics. Use when the user asks to "上服务器"/"连接服务器"/"部署"/"重启"/"看日志"/"SSH 38.76" or operate this box. For the LLM relay (104.160.47.89 / new-api), use connect-newapi-server instead.
---

# Connecting to the app server (WinLume)

## Credentials (never commit)

Read **`docs/INFRA.md`** (gitignored) for host / user / password.  
If missing in this repo, fall back to `E:\CodeCode\by-your-side\docs\INFRA.md` §1 (same IP; do not paste the password into chat or tracked files).

- IP: `38.76.188.156`
- User: `root`
- Auth: password only (plain `ssh` hangs in non-interactive agent shells)

## Required helper

Use the bundled non-interactive runner (paramiko):

```bash
# From repo root (Windows OK if python + paramiko installed)
python .agents/skills/connect-app-server/scripts/ssh_run.py <host> <user> <password> "<command>"
python .agents/skills/connect-app-server/scripts/ssh_run.py <host> <user> <password> --put <local> <remote>
python .agents/skills/connect-app-server/scripts/ssh_run.py <host> <user> <password> --get <remote> <local>
```

Legacy path `.claude/skills/...` is obsolete for this repo; prefer `.agents/skills/connect-app-server/`.

## Windows / PowerShell pitfalls (important)

These are the real failure modes when agents call SSH from Windows:

1. **Do not let PowerShell expand `$HOME`, `$NVM_DIR`, `$_` inside remote commands.**  
   Remote bash needs those dollars. Prefer a **single-quoted** remote command string in bash, or build the remote script with PowerShell **single-quoted here-strings** (`@' ... '@`) so `$HOME` is sent literally.

   Bad (local expands `$HOME` → `C:\Users\...`):
   ```powershell
   python ssh_run.py host root pass "export NVM_DIR=\"$HOME/.nvm\" && ..."
   ```

   Good:
   ```powershell
   $cmd = @'
   export NVM_DIR="$HOME/.nvm"
   . "$NVM_DIR/nvm.sh"
   nvm use 22 >/dev/null
   systemctl status winlume --no-pager
   '@
   python .agents/skills/connect-app-server/scripts/ssh_run.py 38.76.188.156 root '<password>' $cmd
   ```

2. **One `exec_command` per call** — `cd` does not persist. Chain with `&&` / `;` in one string.

3. **Node / nvm** — system node may be 18; Node 22 is via nvm. Source nvm **before** any `node`/`npm`/`pm2` that needs 22.  
   **WinLume production does NOT use nvm for the running process** — it uses systemd + `/usr/local/bin/node`. Prefer `systemctl` for WinLume.

4. **pm2 vs systemd**  
   - WinLume: **`systemctl status|restart winlume`**, logs `/var/log/winlume.log`, unit `/etc/systemd/system/winlume.service`  
   - Historical by-your-side may still appear in `pm2 list` as **stopped** — this box is no longer the by-your-side host of record; do not restart by-your-side unless the user asks.

5. **nginx is aaPanel** — only `/www/server/nginx/conf/` is live. Edit there, then:
   ```bash
   /www/server/nginx/sbin/nginx -t && /www/server/nginx/sbin/nginx -s reload
   ```
   WinLume vhost: `/www/server/nginx/conf/winlume.v2api.top.conf` (must be `include`d from `nginx.conf`).

6. **Default server catch-all** — `nginx.conf` has a `default_server` for `v2api.top` / `_` that can swallow unknown hostnames. New public hostnames **must** have an explicit vhost + DNS A record.

7. **Timeouts** — long deploys / large SFTP: expect 30–120s; do not assume hang at 15s.

## WinLume layout (production)

| Item | Path / value |
|------|----------------|
| App dir | `/opt/winlume` (standalone Next.js) |
| Previous | `/opt/winlume.previous` (one generation backup) |
| Port | `127.0.0.1:3001` |
| Process | `winlume.service` |
| Env | `/opt/winlume/.env` (+ unit `EnvironmentFile=-/opt/winlume/.env`) |
| Skills | `/opt/winlume/content/skills` |
| Data | `/opt/winlume/data` |
| Public name | `winlume.v2api.top` (DNS A → `38.76.188.156`; HTTPS after certbot) |

Required env keys:

```env
NODE_ENV=production
PORT=3001
HOSTNAME=127.0.0.1
NEW_API_URL=https://v2api.top
WINLUME_GATEWAY_TOKEN=   # server-side chat bearer
```

## Deploy playbook (manual / agent)

```bash
# 1) Upload artifact built locally (or by CI)
python .agents/skills/connect-app-server/scripts/ssh_run.py 38.76.188.156 root '<pw>' \
  --put ./winlume-deploy.tar.gz /tmp/winlume-deploy.tar.gz

# 2) Swap on server (remote single script)
systemctl stop winlume
rm -rf /opt/winlume.previous
mv /opt/winlume /opt/winlume.previous
mkdir -p /opt/winlume
tar -xzf /tmp/winlume-deploy.tar.gz -C /opt/winlume
# keep secrets
test -f /opt/winlume.previous/.env && cp /opt/winlume.previous/.env /opt/winlume/.env
systemctl daemon-reload
systemctl restart winlume
sleep 2
systemctl is-active winlume
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/studio
```

Local package (from repo root after `npm run build`):

```powershell
# minimal standalone: server.js + node_modules + .next (+ static) + public + content/skills
```

Prefer the GitHub Actions workflow (`.github/workflows/deploy.yml`) which builds and deploys on push to `master`.

## Health checks

```bash
systemctl is-active winlume
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/studio
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/api/skills
tail -40 /var/log/winlume.log
```

## After changes

Confirm before claiming success:

1. `systemctl is-active winlume` → `active`
2. Local curl `/studio` and `/api/skills` → `200`
3. Restart count not climbing in `systemctl status winlume`
4. For nginx: `nginx -t` ok + reload; public URL only after Cloudflare DNS exists
