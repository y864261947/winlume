# WinLume Studio

Web-first AI workbench for WinLume: free-agent chat, skill injection,
artifacts, native account management, and gateway-backed billing.

Primary UI lives at **`/studio`**. Marketing pages remain under `/products`, `/pricing`, etc.

## Native platform architecture

WinLume runs as two cooperating services backed by one PostgreSQL database:

- **Next.js web/control plane**: Auth.js credentials sessions, account and
  console UI, organizations, API keys, wallets, and settings.
- **Fastify protocol gateway**: OpenAI-compatible API proxying, external
  API-key verification, streaming, and wallet reservation/settlement.
- **PostgreSQL**: the source of truth for credentials, keys, organizations,
  immutable wallet ledger entries, usage, subscriptions, and payment records.

In native mode, the web service reaches the gateway through
`WINLUME_GATEWAY_URL` (default `http://127.0.0.1:4010`) using a shared internal
token. The gateway is deliberately a separate process, not a Next Route
Handler. `NEW_API_URL` is retained only for an explicit legacy compatibility
window and the one-time migration; native authentication and the standalone
gateway do not use it.

## Requirements

- Node.js 22+ (required by AI SDK 7)
- npm

## Environment

Copy `.env.example` to `.env.local` (or export vars in your shell):

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes in native production | PostgreSQL connection for Auth.js credentials, console data, API keys, wallets, and gateway verification/accounting. |
| `AUTH_SECRET` | Yes in production | Auth.js signing secret; use a distinct random value per environment. |
| `NEXTAUTH_URL` | Yes in production | Canonical public web origin. |
| `WINLUME_AUTH_MODE` | No | `winlume` by default. Set `legacy` only for a tightly bounded new-api compatibility period. |
| `WINLUME_GATEWAY_URL` | No | Native gateway origin for server-side Studio calls. Default: `http://127.0.0.1:4010`. |
| `WINLUME_GATEWAY_INTERNAL_TOKEN` | For ops endpoints | Shared server-to-server token for the gateway's ops-only surface (`/internal/billing/shadow-events`, `/metrics`) and the Go server's Studio-token auth path. Not used by WinLume's own chat/image traffic anymore — see `WINLUME_SERVICE_KEY`. Never expose it to the browser. |
| `WINLUME_SERVICE_KEY` | Yes for native Studio | Service-account Bearer token WinLume's own chat and image calls send to the gateway (`Authorization: Bearer <key>`). Provision one with `create-service-account`. |
| `WINLUME_GATEWAY_ADMIN_TOKEN` | Only if `/gateway-admin` is deployed | Shared secret the `/gateway-admin` Next.js routes use to call the Go gateway's `/internal/admin/*` service-account management API. Server-only; never expose it to the browser. |
| `NEW_API_URL` | Legacy only | Old NewAPI origin. Leave unset after cutover; it is not a native gateway upstream. |
| `WINLUME_GATEWAY_TOKEN` | Legacy only | Server-side Bearer token for the legacy chat transport. Leave unset in native mode. |
| `WINLUME_IMAGE_GATEWAY_TOKEN` | Legacy only | Separate server-side Bearer token for the legacy image transport. Native Studio uses `WINLUME_SERVICE_KEY`; leave unset after cutover. |
| `WINLUME_IMAGE_MODEL` | No | Default image model id when a tool call omits `model`. Default: `gpt-image-2` |
| `WINLUME_DATA_DIR` | No | Override local data root (default: `./data`) |
| `WINLUME_CHAT_PATH` | No | Override chat path (default: `/v1/chat/completions`) |
| `WINLUME_AGENT_EXECUTION_MODE` | No | Default executor: `studio` (compatibility), `ai-sdk`, or `codex`. |
| `WINLUME_CODEX_ENABLED` | For Codex | Must be `true` before authenticated users can invoke the coding worker. |
| `WINLUME_CODEX_TRUSTED_USER_ID` | For Codex | The one authenticated user allowed to access the current global Codex workspace. |
| `WINLUME_CODEX_WORKSPACE_DIR` | For Codex | Absolute path to the trusted writable workspace. |
| `WINLUME_CODEX_HOME` | For Codex | Absolute isolated Codex state directory; do not reuse a developer's `CODEX_HOME`. |
| `WINLUME_CODEX_MODEL` | No | Dedicated Codex model override. Omit to use the SDK default. |
| `OPENAI_API_KEY` | For API-key Codex auth | Passed only to the Codex subprocess, not to the browser. |
| `OPENAI_BASE_URL` | No | Optional Codex API endpoint override. |
| `WINLUME_RUN_ALLOWED_EXECUTION_MODES` | No | Comma-separated policy allowlist. Defaults to `studio,ai-sdk`; Codex must be explicitly listed and enabled. |
| `WINLUME_RUN_ALLOWED_MODELS` | No | Optional comma-separated model allowlist enforced before queueing. |
| `WINLUME_RUN_MAX_DURATION_MS` | No | Per-run worker duration limit. Default: 600000. |
| `WINLUME_RUN_MAX_TOOL_CALLS` | No | Per-run tool-call limit. Default: 64. |
| `WINLUME_RUN_MAX_ATTEMPTS` | No | Queue retry ceiling. Default: 3. |

```bash
# .env.local example
DATABASE_URL=postgres://winlume:...
AUTH_SECRET=replace-with-a-random-secret
WINLUME_AUTH_MODE=winlume
WINLUME_GATEWAY_URL=http://127.0.0.1:4010
WINLUME_GATEWAY_INTERNAL_TOKEN=replace-with-a-separate-random-secret
WINLUME_SERVICE_KEY=wl_replace-with-a-service-account-key
WINLUME_GATEWAY_OPENAI_UPSTREAM_URL=https://provider.example/v1
WINLUME_GATEWAY_OPENAI_UPSTREAM_API_KEY=provider-service-key
```

Gateway-specific configuration, including database API-key verification and
wallet accounting, is documented in [services/gateway/README.md](services/gateway/README.md).

## Agent runtimes

WinLume keeps one control plane for authentication, sessions, cancellation,
tools, artifacts, and SSE events. The selected executor supplies the model or
coding runtime behind that contract:

- `studio` keeps the original OpenAI-compatible gateway transport and is the default.
- `ai-sdk` uses Vercel AI SDK for model streaming while the existing WinLume runtime still executes and persists tools.
- `codex` runs the OpenAI Codex SDK as a server-side coding specialist with a resumable thread per WinLume session.

Enable the AI SDK transport globally with:

```bash
WINLUME_AGENT_EXECUTION_MODE=ai-sdk
```

Codex is disabled by default. Until projects have isolated workspaces or
containers, enable it for one trusted operator only and give it dedicated state:

```bash
WINLUME_AGENT_EXECUTION_MODE=codex
WINLUME_CODEX_ENABLED=true
WINLUME_CODEX_TRUSTED_USER_ID=your-auth-user-id
WINLUME_CODEX_WORKSPACE_DIR=/absolute/path/to/trusted/workspace
WINLUME_CODEX_HOME=/absolute/path/to/winlume-codex-home
OPENAI_API_KEY=sk-your-openai-key
WINLUME_RUN_ALLOWED_EXECUTION_MODES=studio,ai-sdk,codex
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
npm run gateway:dev
```

Open [http://localhost:3000](http://localhost:3000) — the app redirects into Studio (`/studio`).

| Script | Purpose |
|--------|---------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm start` | Serve production build |
| `npm run gateway:dev` | Watch and run the standalone Fastify gateway |
| `npm run gateway:start` | Run the standalone Fastify gateway without watch mode |
| `npm run db:migrate` | Apply WinLume PostgreSQL migrations |
| `npm run migration:new-api:dry-run` | Validate a new-api migration without writing data |
| `npm run migration:new-api -- --apply ...` | Apply a reviewed new-api migration explicitly |
| `npm test` | Vitest unit tests |
| `npm run test:gateway` | Gateway-specific tests |
| `npm run lint` | ESLint |

## new-api cutover

Before stopping old new-api, deploy the WinLume schema, import a reviewed
snapshot, configure the standalone gateway upstreams/channels, and reconcile
users, keys, balances, usage, subscriptions, and payment records. Old
sessions, OAuth credentials, MFA, and passkeys are intentionally not imported;
users enroll those again in WinLume. The migration is dry-run by default and
requires `--apply` for writes. See [docs/MIGRATE_NEW_API.md](docs/MIGRATE_NEW_API.md)
for the controlled procedure and [docs/DEPLOY.md](docs/DEPLOY.md) for the
dual-process deployment and shutdown checklist.

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
- Override root with `WINLUME_DATA_DIR`
- Auth for Studio APIs uses the server-side Auth.js session.

## Studio notes

- **Login required** for chat, sessions, and model calls (client blocks send + opens login; server returns 401).
- **Default model** preference: Settings → 默认模型 (`localStorage` `winlume:default-model`).
- Marketing “立即体验” CTAs open **Studio** (not the old mock ExperienceModal workflow).

## Stack

- Next.js App Router + React
- Fastify standalone OpenAI-compatible protocol gateway
- PostgreSQL + Drizzle platform data layer
- Vercel AI SDK model transport
- OpenAI Codex SDK coding executor
- Vitest
- Tailwind CSS v4
- OpenAI-compatible streaming via the WinLume gateway

## License

Private / project-internal unless otherwise stated.
