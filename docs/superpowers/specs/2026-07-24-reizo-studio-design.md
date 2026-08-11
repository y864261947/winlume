# Reizo Studio — Design Spec

**Date:** 2026-07-24  
**Status:** Approved for planning (product decisions locked in design discussion)  
**Product:** Reizo free-agent workbench (Web first, desktop-ready later)

---

## 1. Goal

Rebuild Reizo from a thin marketing/catalog site into a **Web Agent Studio**: multi-model free chat, skills, tool loop, and first-class artifacts — with a clear path to a **desktop shell** later without rewriting the core.

**Primary user promise**

> Open the workbench, talk to an agent, optionally attach skills and files, get real outputs you can preview and keep.

**Non-goals for MVP**

- Full marketing landing as the main product surface (comes later)
- Desktop packaging, local terminal, global hotkeys, browser automation (Phase Desktop)
- Fixed multi-step orchestration as the main architecture (templates are entry chips only)
- Cloning NewMax or Open Design source code

---

## 2. Reference strategy (phased)

| Phase | Primary reference | Secondary | Content |
|-------|-------------------|-----------|---------|
| **Web (now)** | **Open Design** — Studio layout, Skill protocol, Artifact/Preview, event stream | NewMax — free-agent habits, per-message skills, gateway billing UX | `agency-agents-zh` role bodies |
| **Desktop (later)** | **NewMax** — Electron shell, local FS/workspace, terminal, OS integration | Keep Web core contracts unchanged | same skills |

**Rule:** Domain contracts (`Session`, `Skill`, `Artifact`, `Provider`, SSE events) are **platform-agnostic**. Web and desktop are **hosts** that implement the same contracts with different tool backends.

```text
┌──────────────────────────────────────────┐
│  Host: Web (Next.js)  |  Desktop (later) │
│  UI shell + host tools                   │
└──────────────────┬───────────────────────┘
                   │ shared contracts
┌──────────────────▼───────────────────────┐
│  Agent Runtime · Skill Registry          │
│  Artifact Store · Provider Gateway       │
└──────────────────────────────────────────┘
```

---

## 3. Product decisions (locked)

| Decision | Choice |
|----------|--------|
| Runtime style | **Free agent** (not template orchestration as core) |
| MVP surface | **Pure Web** (Next.js App Router) |
| Architecture primary ref | **Open Design–inspired Studio** |
| Desktop | **Deferred**; leave extension points |
| Billing / auth | Existing **NewAPI-style gateway** (`NEW_API_URL`) |
| Skills content | Import curated set from **agency-agents-zh** (+ optional OD-style frontmatter) |
| Landing page | **Later**; Studio is default app entry |
| Scene chips (Demo 6 tasks) | **Optional entry only** — prefill prompt + recommended skills |

---

## 4. Information architecture

### 4.1 Routes

| Route | Purpose |
|-------|---------|
| `/` | Redirect to `/studio` |
| `/studio` | Studio shell; new session composer |
| `/studio/c/[sessionId]` | Active conversation + artifact panel |
| `/studio/skills` | Skill browser / enable |
| `/studio/artifacts` | Global artifact library |
| `/studio/settings` | Model prefs, account, gateway info |
| `/api/auth/*`, `/api/account/*`, `/api/catalog/*` | Keep gateway proxy |
| `/api/sessions`, `/api/chat`, `/api/skills`, `/api/artifacts` | New Studio APIs |
| `/marketing` or hidden | Optional later home for landing; not MVP default |

### 4.2 Studio chrome (Open Design–inspired)

```text
┌────────────┬─────────────────────────┬──────────────┬─────────────┐
│ Sidebar    │ Chat + tool timeline    │ Artifacts    │ Preview     │
│            │                         │ (session)    │ (selected)  │
│ New chat   │ messages                │ tree/list    │ md / html   │
│ Sessions   │ streaming               │              │ image later │
│ Skills     │                         │              │             │
│ Artifacts  │ Composer: model / /skill│              │             │
│ Settings   │ attach / send           │              │             │
│ Balance    │                         │              │             │
└────────────┴─────────────────────────┴──────────────┴─────────────┘
```

- Narrow viewports: stack to chat-first; artifacts/preview as drawers/tabs.
- MVP may collapse Preview into the Artifacts column (select file → inline preview) if three columns are too heavy — **layout must still treat artifacts as first-class**, not only chat bubbles.

### 4.3 Sidebar items (map from Demo + OD)

| Nav | Maps to |
|-----|---------|
| 新对话 | New session |
| 最近 | Session list |
| 能力 / Skills | Skill registry UI |
| 作品 | Global artifacts |
| 设置 | Settings + account |
| Chip rail on empty state | Demo-like scenes as **prefill only** |

---

## 5. Domain model

Platform-agnostic types (TypeScript shapes; storage can evolve).

### 5.1 Core entities

```ts
// Identity
UserRef: { gatewayUserId: string }

// Conversation
Session: {
  id: string
  userId: string
  title: string
  model: string
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>  // e.g. suggested skill chips used
}

Message: {
  id: string
  sessionId: string
  role: "user" | "assistant" | "system" | "tool"
  content: string
  skillIds?: string[]          // skills bound to THIS user turn
  toolCalls?: ToolCallRecord[]
  attachments?: string[]       // attachment ids
  createdAt: string
}

// Capabilities
Skill: {
  id: string
  name: string
  description: string
  category: string
  triggers?: string[]
  examplePrompt?: string
  systemPrompt: string         // body / role instructions
  preview?: "markdown" | "html" | "none"
  source: "bundled" | "imported" | "user"
  enabled: boolean
}

// Outputs
Artifact: {
  id: string
  userId: string
  sessionId: string
  messageId?: string
  name: string
  kind: "markdown" | "html" | "text" | "json" | "image" | "binary"
  mimeType: string
  storageKey: string           // host-relative path or object key
  createdAt: string
}

Attachment: {
  id: string
  userId: string
  sessionId: string
  name: string
  mimeType: string
  storageKey: string
  createdAt: string
}

// Provider
ModelRef: {
  id: string                   // gateway model id
  displayName: string
  provider?: string
}
```

### 5.2 Host ports (desktop-ready)

All host-specific behavior goes behind interfaces so desktop can swap implementations later.

| Port | Web MVP | Desktop later |
|------|---------|---------------|
| `SessionStore` | SQLite or filesystem under `data/` | Local app data dir |
| `ArtifactStore` | Server disk / object storage | Project workspace folder |
| `ToolBackend` | Server-safe tools only | + FS, terminal, browser (NewMax-like) |
| `SecretStore` | Env + gateway cookies | OS keychain + local config |
| `Auth` | Gateway session proxy | Same gateway + device link optional |

**Do not** put Electron or Node-pty imports in UI or pure domain modules.

---

## 6. Agent runtime

### 6.1 Loop (free agent)

```text
User message (+ skillIds, attachments)
  → auth + quota check (gateway)
  → build messages:
       system (base studio policy)
       + injected skill system sections (this turn only)
       + history
       + user content (+ attachment summaries)
  → stream Provider.chat(tools)
  → if tool_calls: execute via ToolBackend → append tool results → continue
  → max tool rounds (default 8)
  → emit done; update session title if first turn
```

Skills are **per user message** (NewMax habit): selection clears after send unless user re-selects.

### 6.2 SSE event contract (align Open Design adapter events)

Server → client event types:

| type | payload (conceptual) |
|------|----------------------|
| `session` | `{ sessionId }` |
| `text_delta` | `{ text }` |
| `thinking` | `{ text }` (optional) |
| `tool_call` | `{ id, name, input }` |
| `tool_result` | `{ id, ok, summary }` |
| `file_write` / `artifact` | `{ artifactId, name, kind }` |
| `error` | `{ message, code? }` |
| `done` | `{ reason: "completed" \| "cancelled" \| "error" }` |

Client can cancel via abort / `POST` cancel when implemented.

### 6.3 Provider

- Single **OpenAI-compatible** client pointing at gateway (`NEW_API_URL` or dedicated chat base).
- Model list from existing plaza/catalog where possible.
- Session stores selected `model`.
- Failover / multi-provider routing = **P1+**, not MVP required.

### 6.4 MVP tools (web-safe)

| Tool | Purpose |
|------|---------|
| `write_artifact` | Persist markdown/html/text/json into ArtifactStore |
| `read_artifact` | Read user’s artifact by id |
| `list_artifacts` | List artifacts for current session |
| `read_attachment` | Read uploaded text-like attachment (size-capped) |

**Explicitly not in Web MVP:** shell, unrestricted FS, browser control.

Desktop later adds tools behind the same registry with capability flags (`host: "web" | "desktop" | "all"`).

### 6.5 Base system policy (studio)

Short fixed policy:

- Prefer writing durable outputs via `write_artifact` for long docs.
- Respect skill instructions when skills are attached.
- Do not claim tools that are unavailable.
- Chinese-first UX copy in product UI; model language follows user.

---

## 7. Skills system

### 7.1 Format

Adopt Claude/Open Design–compatible **directory or single markdown** with YAML frontmatter + body:

```yaml
---
name: marketing-xiaohongshu-specialist
description: 小红书种草与生活方式内容
category: marketing
triggers:
  - 小红书
  - 种草
example_prompt: 为新品手冲咖啡写三篇小红书种草笔记…
preview: markdown
source: bundled
---

# Role body (from agency-agents-zh, adapted)
…
```

### 7.2 Sources & import

| Source | Path (repo) | Notes |
|--------|-------------|--------|
| Bundled curated | `content/skills/**` or `src/data/skills/**` | Generated/imported subset |
| Import script | `scripts/import-agency-agents.mjs` | Reads `agency-agents-zh`, maps categories, writes frontmatter |
| User skills (later) | upload / paste | Desktop: `~/.reizo/skills` |

**MVP volume:** 20–40 skills (marketing, design, product, writing). Not all 268 at once.

### 7.3 Discovery & use

- Skills page: search, category filter, detail, example prompt CTA.
- Composer: `/` menu or chip picker; multi-select per message.
- Empty-state chips: map Demo scenes → `example_prompt` + recommended skill ids.

---

## 8. Auth, billing, security

| Topic | Rule |
|-------|------|
| Chat | **Require login** for model calls (prevent open relay abuse) |
| Auth | Keep `/api/auth/*` cookie proxy to gateway |
| Balance | Show via existing account config + self |
| Keys | Gateway key stays server-side (`NEW_API_URL` + server secrets); never expose admin keys to browser |
| Uploads | Size/type limits; virus scanning later |
| Prompt injection | Treat attachments as untrusted data; tool args validated with zod |
| Rate limit | Per-user limits on chat and uploads (P1 if not day-one) |

---

## 9. Storage (Web MVP)

**Preferred simple path for rebuild:**

- **SQLite** (e.g. `better-sqlite3` or `libsql`) for sessions/messages/artifacts metadata under `data/reizo.db` (gitignored).
- **Filesystem** blob dir `data/blobs/{userId}/…` for artifact/attachment bytes.

Alternative if SQLite native deps hurt deploy: JSON/file store for early P0 only, migrate to SQLite before multi-user.

Production deploy later: Postgres + object storage — same ports, new adapters.

---

## 10. Relationship to current codebase

| Existing | Action |
|----------|--------|
| Next.js 16 app, Tailwind | Keep |
| Gateway auth/account/plaza routes | Keep and reuse from Studio |
| Marketing homepage as `/` | Replace default with Studio redirect; park marketing components |
| Fake product brands / experience mock | Remove from critical path; delete mock experience runner |
| Static `products.ts` | Demote; models from plaza |

**Suggested tree (incremental):**

```text
src/
  app/
    studio/...
    api/sessions|chat|skills|artifacts|uploads/...
  components/studio/...
  lib/
    agent/          # runtime, sse, tools, provider
    skills/         # load, inject
    store/          # session/artifact adapters
    host/           # web host bindings (desktop later)
  content/skills/   # bundled skills
scripts/
  import-agency-agents.mjs
docs/superpowers/specs/
  2026-07-24-reizo-studio-design.md
```

---

## 11. Delivery phases

### Phase P0 — Studio shell + real chat

- Routes + three-zone (or chat + artifacts) layout
- Login gate
- Session CRUD + history
- Streaming chat via gateway
- Model selector from plaza
- Cancel stream

**Demo:** log in, chat, switch model, see balance.

### Phase P1 — Skills

- Import script + curated skills
- Skills page + `/` picker
- Per-message injection
- Empty-state chips with example prompts

**Demo:** pick 小红书专家, get on-tone copy.

### Phase P2 — Tools + artifacts + preview

- Tool loop
- `write_artifact` / read / list
- Session artifact list + markdown/html preview
- Global artifacts page

**Demo:** agent writes a report file; open in preview.

### Phase P3 — Attachments & polish

- File upload + `read_attachment`
- Title auto-summary
- Error/retry UX, basic context trim
- Mobile drawers

### Phase Landing (later)

- Marketing site under `/marketing` or separate entry
- CTA → Studio register/login

### Phase Desktop (later) — NewMax-weighted

- Package Web or shared runtime in Electron/Tauri
- Implement desktop `ToolBackend` / `ArtifactStore` (workspace roots)
- Terminal, local skills dir, auto-update — **design against NewMax then**
- Reuse same SSE and Skill contracts

---

## 12. Success criteria (MVP = end of P2)

1. `/` opens Studio, not the old product mall.
2. Authenticated streaming chat works against the real gateway.
3. At least one model selectable; balance visible.
4. Skills selectable per message and visibly affect replies.
5. Agent can create an artifact; user can reopen it in preview.
6. Domain modules have no Electron/desktop coupling; host ports documented.

---

## 13. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Free agent feels like “another chat” | Artifact+preview first-class; tool timeline; skills |
| Gateway cost / abuse | Login required; rate limits; tool round cap |
| Scope creep toward NewMax desktop | Strict phase list; desktop only after P2 |
| 268 skills overwhelm UX | Curate 20–40; search/categories |
| SQLite native on Windows/deploy | Document install; fallback file store for P0 only |

---

## 14. Open items (non-blocking for P0)

- Exact gateway chat path and auth header convention (verify against live `NEW_API_URL`).
- Whether title generation uses a cheap model call or heuristic.
- SQLite vs file store for first merge to production host.
- Brand visual system: keep Demo warm palette vs current site tokens (decide in UI plan).

---

## 15. Next step

After this spec is accepted:

1. Write implementation plan (`docs/superpowers/plans/…` or task breakdown for P0→P2).
2. Execute P0 (Studio shell + real chat), then P1/P2.

**Do not** implement desktop in the first rebuild.
