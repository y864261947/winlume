# Reizo Studio

Web-first AI workbench for Reizo: free-agent chat, skill injection,
artifacts, and native account management. Reizo is a thin BFF in front of
**new-api** (v2api.top) — new-api is the sole authority for model inference,
quota, and usage logging; Reizo owns no self-built billing engine.

Primary UI lives at **`/studio`**. Marketing pages remain under `/products`, `/pricing`, etc.

## Platform architecture

Reizo is a single Next.js process backed by one PostgreSQL database, sitting
in front of new-api:

- **Next.js web/control plane**: Auth.js credentials sessions, account and
  console UI, organizations, virtual API keys, and settings.
- **new-api** (external, `NEW_API_URL`): model inference, per-team quota, and
  usage logs. Every Reizo team maps 1:1 to a new-api user
  (`team_new_api_mapping`); every virtual `sk-...` key maps 1:1 to a new-api
  token.
- **PostgreSQL**: Reizo's own source of truth for credentials, organizations,
  memberships, and the encrypted new-api credential/token mappings. No wallet
  or usage-ledger tables — new-api owns that data.

`src/app/api/v1/[...path]/route.ts` is the only public model-inference
surface: it authenticates a virtual key, decrypts the new-api token behind
it, and streams the request through to new-api. Studio's own LLM calls use
the same decrypt-and-forward path via a hidden, non-user-visible token per
team. See
[docs/superpowers/specs/2026-08-11-reizo-new-api-integration-design.md](docs/superpowers/specs/2026-08-11-reizo-new-api-integration-design.md)
for the full design.

## Requirements

- Node.js 22+ (required by AI SDK 7)
- npm

## Environment

Copy `.env.example` to `.env.local` (or export vars in your shell):

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes in production | PostgreSQL connection for Auth.js credentials, console data, organizations, and new-api credential mappings. |
| `AUTH_SECRET` | Yes in production | Auth.js signing secret; use a distinct random value per environment. |
| `NEXTAUTH_URL` | Yes in production | Canonical public web origin. |
| `REIZO_AUTH_MODE` | No | `reizo` by default. Set `legacy` only for a tightly bounded compatibility period. |
| `NEW_API_URL` | Yes in production | new-api origin (e.g. `https://v2api.top`) — the model inference/quota/usage backend. Required, not legacy. |
| `NEW_API_ADMIN_TOKEN` | Yes in production | Personal Access Token of a dedicated new-api admin/root account. Used server-only for user creation and quota management (`POST /api/user/`, `POST /api/user/manage`). Never expose to the browser. |
| `REIZO_TOKEN_ENCRYPTION_KEY` | Yes in production | 32-byte AES-256-GCM key (hex or base64) used to encrypt every stored new-api password/PAT/token secret. No rotation mechanism — losing or changing this breaks every stored ciphertext. |
| `NEW_API_TOKEN_GROUP` | No | new-api token group used when creating team/Studio tokens. Deployment-specific — new-api's own "default" group is not guaranteed to be a live routable group; check `GET /api/user/groups` on the target new-api instance. Default: `gpt-pro`. |
| `REIZO_IMAGE_MODEL` | No | Default image model id when a tool call omits `model`. Default: `gpt-image-2` |
| `REIZO_DATA_DIR` | No | Override local data root (default: `./data`) |
| `REIZO_CHAT_PATH` | No | Override chat path (default: `/v1/chat/completions`) |
| `REIZO_AGENT_EXECUTION_MODE` | No | Default executor: `studio` (compatibility), `ai-sdk`, or `codex`. |
| `REIZO_CODEX_ENABLED` | For Codex | Must be `true` before authenticated users can invoke the coding worker. |
| `REIZO_CODEX_TRUSTED_USER_ID` | For Codex | The one authenticated user allowed to access the current global Codex workspace. |
| `REIZO_CODEX_WORKSPACE_DIR` | For Codex | Absolute path to the trusted writable workspace. |
| `REIZO_CODEX_HOME` | For Codex | Absolute isolated Codex state directory; do not reuse a developer's `CODEX_HOME`. |
| `REIZO_CODEX_MODEL` | No | Dedicated Codex model override. Omit to use the SDK default. |
| `OPENAI_API_KEY` | For API-key Codex auth | Passed only to the Codex subprocess, not to the browser. |
| `OPENAI_BASE_URL` | No | Optional Codex API endpoint override. |
| `REIZO_RUN_ALLOWED_EXECUTION_MODES` | No | Comma-separated policy allowlist. Defaults to `studio,ai-sdk`; Codex must be explicitly listed and enabled. |
| `REIZO_RUN_ALLOWED_MODELS` | No | Optional comma-separated model allowlist enforced before queueing. |
| `REIZO_RUN_MAX_DURATION_MS` | No | Per-run worker duration limit. Default: 600000. |
| `REIZO_RUN_MAX_TOOL_CALLS` | No | Per-run tool-call limit. Default: 64. |
| `REIZO_RUN_MAX_ATTEMPTS` | No | Queue retry ceiling. Default: 3. |

```bash
# .env.local example
DATABASE_URL=postgres://reizo:...
AUTH_SECRET=replace-with-a-random-secret
REIZO_AUTH_MODE=reizo
NEW_API_URL=https://v2api.top
NEW_API_ADMIN_TOKEN=replace-with-a-new-api-admin-pat
REIZO_TOKEN_ENCRYPTION_KEY=replace-with-a-32-byte-hex-or-base64-key
```

## Agent runtimes

Reizo keeps one control plane for authentication, sessions, cancellation,
tools, artifacts, and SSE events. The selected executor supplies the model or
coding runtime behind that contract:

- `studio` keeps the original OpenAI-compatible transport (now pointed at new-api) and is the default.
- `ai-sdk` uses Vercel AI SDK for model streaming while the existing Reizo runtime still executes and persists tools.
- `codex` runs the OpenAI Codex SDK as a server-side coding specialist with a resumable thread per Reizo session.

Enable the AI SDK transport globally with:

```bash
REIZO_AGENT_EXECUTION_MODE=ai-sdk
```

Codex is disabled by default. Until projects have isolated workspaces or
containers, enable it for one trusted operator only and give it dedicated state:

```bash
REIZO_AGENT_EXECUTION_MODE=codex
REIZO_CODEX_ENABLED=true
REIZO_CODEX_TRUSTED_USER_ID=your-auth-user-id
REIZO_CODEX_WORKSPACE_DIR=/absolute/path/to/trusted/workspace
REIZO_CODEX_HOME=/absolute/path/to/reizo-codex-home
OPENAI_API_KEY=sk-your-openai-key
REIZO_RUN_ALLOWED_EXECUTION_MODES=studio,ai-sdk,codex
```

The Codex worker uses `workspace-write`, denies escalation, command network
access, web search, and ambient MCP configuration, and receives an allowlisted
subset of the server environment. The browser cannot choose its workspace,
Codex home, or provider credentials. Tool deny/approval policy is checked
before Codex launches; this web transport intentionally rejects Codex runs that
would need an interactive approval.

## Durable runs and projects

Each chat turn is now a durable run: the chat route creates a versioned run
record, queues it, streams persisted events over SSE, and supports replay at
`GET /api/runs/{runId}/events?after={sequence}`. `POST /api/chat/stop` records
cancellation before interrupting the in-process worker.

The included adapters are intentionally local/single-node:

- `data/runs/runs.json` is the durable run and event log.
- The in-process queue is restarted by the web process and recovers queued
  runs. A run interrupted after execution starts is marked failed rather than
  replayed automatically, preventing duplicate messages, tool calls, or edits.
- A production deployment should retain the `RunStore`/`RunQueue` interfaces
  and replace these adapters with PostgreSQL and Redis/BullMQ plus a separate
  worker process.

Projects group many chats around shared instructions, pinned skills, and
artifacts. They are currently user-owned; deleting a project detaches its chats
without deleting their conversation history.

The account/team phase should replace the current `userId` containment checks
with organization membership and project roles, plus an isolated workspace or
container per project/organization before Codex is opened to multiple users.
The run envelope already has `organizationId`, idempotency is scoped, and the
project/store boundaries are where tenant-aware database adapters and
per-organization API-key resolution belong. Keep provider credentials
server-side and resolve them in the worker, never from browser-supplied model
configuration.

## Develop

```bash
npm install
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — the app redirects into Studio (`/studio`).

| Script | Purpose |
|--------|---------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm start` | Serve production build |
| `npm run db:migrate` | Apply Reizo PostgreSQL migrations (drizzle-kit) |
| `npm run db:migrate:prod` | Apply migrations with the standalone-safe runner (used in production deploy) |
| `npm test` | Vitest unit tests |
| `npm run lint` | ESLint |

## Deployment

Production deploys automatically on push to `master` via
`.github/workflows/deploy.yml`: build, package the standalone Next.js
artifact, ship it to the host, run pending Postgres migrations, then restart
`reizo.service`. See [docs/DEPLOY.md](docs/DEPLOY.md) for the current
production layout and manual-release fallback.

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
  users/{userId}/projects.json
  users/{userId}/projects/{projectId}.json
  users/{userId}/artifacts.json
  blobs/{userId}/{artifactId}
  runs/runs.json
```

- Gitignored under `/data/users/`, `/data/blobs/`, etc. (see `.gitignore`)
- Override root with `REIZO_DATA_DIR`
- Auth for Studio APIs uses the server-side Auth.js session.

## Studio notes

- **Login required** for chat, sessions, and model calls (client blocks send + opens login; server returns 401).
- **Default model** preference: Settings → 默认模型 (`localStorage` `reizo:default-model`).
- Marketing “立即体验” CTAs open **Studio** (not the old mock ExperienceModal workflow).

## Stack

- Next.js App Router + React
- new-api (external) as the model inference/quota/usage backend
- PostgreSQL + Drizzle platform data layer
- Vercel AI SDK model transport
- OpenAI Codex SDK coding executor
- Vitest
- Tailwind CSS v4
- OpenAI-compatible streaming, proxied through Reizo to new-api

## License

Private / project-internal unless otherwise stated.
