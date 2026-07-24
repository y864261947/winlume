# WinLume Studio

Web-first AI workbench for WinLume: free-agent chat, skill injection, artifacts, and gateway-backed billing.

Primary UI lives at **`/studio`**. Marketing pages remain under `/products`, `/pricing`, etc.

## Requirements

- Node.js 20+ (recommended)
- npm

## Environment

Copy `.env.example` to `.env.local` (or export vars in your shell):

| Variable | Required | Description |
|----------|----------|-------------|
| `NEW_API_URL` | No | NewAPI-compatible gateway origin. Default: `https://v2api.top` |
| `WINLUME_GATEWAY_TOKEN` | Yes for real chat | Server-side Bearer token for `/v1/chat/completions`. Never expose to the browser. |
| `WINLUME_DATA_DIR` | No | Override local data root (default: `./data`) |
| `WINLUME_CHAT_PATH` | No | Override chat path (default: `/v1/chat/completions`) |

```bash
# .env.local example
NEW_API_URL=https://v2api.top
WINLUME_GATEWAY_TOKEN=sk-your-token
```

## Develop

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — the app redirects into Studio (`/studio`).

| Script | Purpose |
|--------|---------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm start` | Serve production build |
| `npm test` | Vitest unit tests |
| `npm run lint` | ESLint |

## Skills import

Curated agent skills live under `content/skills/{id}/SKILL.md`.

To re-import from [agency-agents-zh](https://github.com/) (or a local clone):

```bash
# optional: point at source tree
set AGENCY_AGENTS_DIR=E:\CodeCode\agency-agents-zh   # Windows PowerShell
# export AGENCY_AGENTS_DIR=../agency-agents-zh        # bash

node scripts/import-agency-agents.mjs
```

Defaults also try `E:/CodeCode/agency-agents-zh` and `../agency-agents-zh`.

## Data directory

Runtime session / artifact storage (web host):

```
data/
  users/{userId}/sessions.json
  users/{userId}/sessions/{sessionId}.json
  users/{userId}/artifacts.json
  blobs/{userId}/{artifactId}
```

- Gitignored under `/data/users/`, `/data/blobs/`, etc. (see `.gitignore`)
- Override root with `WINLUME_DATA_DIR`
- Auth for Studio APIs uses header `x-winlume-user` (from `localStorage` key `winlume:gateway-user-id` after login)

## Studio notes

- **Login required** for chat, sessions, and model calls (client blocks send + opens login; server returns 401).
- **Default model** preference: Settings → 默认模型 (`localStorage` `winlume:default-model`).
- Marketing “立即体验” CTAs open **Studio** (not the old mock ExperienceModal workflow).

## Stack

- Next.js App Router + React
- Vitest
- Tailwind CSS v4
- OpenAI-compatible streaming via NewAPI gateway

## License

Private / project-internal unless otherwise stated.
