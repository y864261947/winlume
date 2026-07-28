---
name: connect-newapi-server
description: Connect to and operate the new-api server (104.160.47.89) — the LLM relay/proxy panel that backs by-your-side's v2api.top channels. Use this whenever the user asks to check new-api, look up SMTP/mail credentials, query the new-api Postgres database, check channel/relay config, or otherwise wants something inspected or changed on that specific box (not the app server at 38.76.188.156 — use connect-app-server for that one). Trigger on things like "去new-api看下"/"查一下new-api数据库"/"104.160.47.89"/"relay面板"/"中转站配置", or when by-your-side needs a credential (SMTP, OAuth, etc.) that might already be configured somewhere else — this box's admin panel is the first place to check before asking the user to generate a new one.
---

# Connecting to the new-api server

This is a **separate machine** from the by-your-side app server (38.76.188.156) — it runs
`new-api`, a self-hosted LLM relay/proxy panel that by-your-side's `.env` channels
(`RELAY_CHANNEL_*`) point at via `v2api.top`. Plain `ssh user@host` hangs on the interactive
prompt in this environment — use `scripts/ssh_run.py` (paramiko-based, non-interactive) instead.

**As of 2026-07-12, password auth is disabled on this box** — sshd only accepts `publickey`.
Use the `--key` flag with the private key supplied separately by the operator.

## Connection details

- Host: `104.160.47.89`
- User: `root`
- Authentication: Ed25519 private key only; the old password no longer works
- Private key: provide the local path through `--key`; do not copy the key into this skill

The skill directory is self-contained and does not require the project's `docs/INFRA.md`.
That file contains unrelated production credentials and must not be distributed with this
skill.

## Local setup

Python and the `paramiko` dependency are required. From the skill directory, install the
dependency with:

```powershell
python -m pip install -r requirements.txt
```

Use a Python version supported by the installed Paramiko release, preferably Python 3.8 or
newer.

## Running a command

```bash
python <skill-dir>/scripts/ssh_run.py 104.160.47.89 root --key <keyfile> "<command>"
```

On Windows PowerShell, use the same command with quoted paths:

```powershell
python "<skill-dir>\scripts\ssh_run.py" 104.160.47.89 root --key "<keyfile>" "hostname && whoami"
```

(Password auth (`<host> <user> <password> "<command>"`) is kept in the script for other boxes
that still use it, but does not work against this server anymore.)

Each call opens a fresh non-interactive shell — chain related steps with `&&` in one command
string rather than relying on shell state (like `cd`) persisting between calls.

## Why you'd come here from a by-your-side session

new-api's admin panel stores operational settings (SMTP mail credentials, email verification
toggles, OAuth-adjacent settings, etc.) in its Postgres database, **not** in a `.env` file. If
by-your-side (or some other project) needs a credential like this, it's worth checking here
first — there's a good chance it's already configured and you can reuse it instead of asking the
user to go generate a brand new one.

## Deployment shape

- Go binary, deployed **natively** via a release-tracker script (not Docker, even though the
  repo ships a `docker-compose.yml` — that's unused on this box)
- Source: `/opt/new-api`; running releases: `/opt/new-api-native/releases/<timestamp>/`
- systemd services: `new-api-native.service` (the app) and `new-api-redis.service`, both
  `Requires=`'d by the app unit alongside `postgresql-16.service`
- Runtime config: `/etc/new-api/native.env` — has the Postgres DSN (`SQL_DSN`), Redis connection
  string, and Cloudflare R2 media storage credentials. Passwords in the DSN are URL-encoded
  (e.g. `%2F` for `/`) — don't hand-edit without re-encoding correctly.

```bash
... 'systemctl status new-api-native --no-pager'
... 'journalctl -u new-api-native -n 100 --no-pager'
```

## Querying the database

`psql` is installed directly on the box. Pull the DSN out of `/etc/new-api/native.env` first
(it changes per-deploy only rarely, but don't hardcode it into a new file — read it fresh):

```bash
... 'grep SQL_DSN /etc/new-api/native.env'
... "psql '<dsn-from-above>' -c \"SELECT key, value FROM options WHERE key ILIKE '%smtp%';\""
```

Useful tables: `options` (global panel config, key-value), `channels` (the upstream model
providers new-api relays to), `logs` (request/usage logs), `users`.

## Available LLM channels

If asked to check what channels/models a given API key on this relay can reach, hit the
OpenAI-compatible models endpoint directly rather than digging through the DB:

```bash
curl -s https://v2api.top/v1/models -H "Authorization: Bearer <key>"
```

Keep in mind: not every model on this relay reliably follows a system prompt / stays in
character for by-your-side's companion-persona use case — some (notably the "官逆" reverse-
engineered channels) have been observed dropping the system prompt entirely or breaking
character under direct questioning. Treat channel behavior as deployment-specific and verify
it before changing the active channel.

## After any change here

This box is shared infrastructure other things may depend on (it's the relay for possibly more
than just by-your-side) — treat it more conservatively than the app server. Confirm
`systemctl status new-api-native` is still `active (running)` after any config or restart, and
don't touch `channels` table rows or panel settings you didn't come here to change.
