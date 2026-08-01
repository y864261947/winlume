# WinLume Studio

Web-first AI workbench for WinLume: free-agent chat, skill injection, artifacts, and gateway-backed billing.

Primary UI lives at **`/studio`**. Marketing pages remain under `/products`, `/pricing`, etc.

## Requirements

- Node.js 22+ (required by AI SDK 7)
- npm

## Environment

Copy `.env.example` to `.env.local` (or export vars in your shell):

| Variable | Required | Description |
|----------|----------|-------------|
| `NEW_API_URL` | No | NewAPI-compatible gateway origin. Default: `https://v2api.top` |
| `WINLUME_GATEWAY_TOKEN` | Yes for real chat | Server-side Bearer token for `/v1/chat/completions`. Never expose to the browser. |
| `WINLUME_IMAGE_GATEWAY_TOKEN` | Yes for image generation | Separate server-side Bearer token for `/v1/images/generations` and `/v1/images/edits`. Different channel/token from chat — never expose to the browser. |
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
NEW_API_URL=https://v2api.top
WINLUME_GATEWAY_TOKEN=sk-your-token
WINLUME_IMAGE_GATEWAY_TOKEN=sk-your-image-token
```

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
- Vercel AI SDK model transport
- OpenAI Codex SDK coding executor
- Vitest
- Tailwind CSS v4
- OpenAI-compatible streaming via NewAPI gateway

## License

Private / project-internal unless otherwise stated.
