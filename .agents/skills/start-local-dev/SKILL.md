---
name: start-local-dev
description: Start Reizo locally on this Ubuntu/WSL checkout — ensure Node 22, open the production-Postgres SSH tunnel on 15433, then run Next.js on the NEXTAUTH_URL port. Use when asked to "启动本地"/"本地启动"/"起一下"/"本地开发"/"帮我启动"/"环境配好了吗", start the local app, or /start-local-dev.
---

# Start local Reizo (Ubuntu / WSL)

Read `docs/INFRA.md` (gitignored) and execute it. That file is the only source: ordered start steps, the OpenSSH PEM, `.env.local`, and `.env`.

If `docs/INFRA.md` is missing, stop and tell the user.

Never paste `docs/INFRA.md`, the PEM, or env values into chat or tracked files. When reporting env, list keys only; for `DATABASE_URL` show only `user@host:port/db`.
