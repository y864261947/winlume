# Reizo Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Reizo into a Web free-agent Studio (Open Design–inspired layout, real gateway chat, skills, artifacts) while keeping host ports open for a future desktop shell.

**Architecture:** Platform-agnostic domain + agent runtime on the server; Next.js App Router UI under `/studio`; sessions/artifacts/skills stored via a Web host adapter (file/JSON first); chat streams OpenAI-compatible completions through the existing NewAPI gateway; skills inject per user message; tools write first-class artifacts for preview.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, existing gateway proxy routes, Node `fs` file store (SQLite optional later), SSE for chat, curated skills from `agency-agents-zh`.

**Spec:** `docs/superpowers/specs/2026-07-24-reizo-studio-design.md`

## Global Constraints

- **Web first** — no Electron, node-pty, or desktop-only APIs in `src/lib/agent` or domain types.
- **Free agent** — no fixed multi-step orchestration engine; scene chips only prefill prompt + skills.
- **Login required** for chat/model calls.
- **Primary UI reference:** Open Design Studio (chat + artifacts + preview); NewMax only for free-agent UX habits.
- **Default entry:** `/` → `/studio` (marketing not default).
- **Gateway:** reuse `NEW_API_URL` (default `https://v2api.top`); chat via OpenAI-compatible `POST {gateway}/v1/chat/completions`.
- **Auth headers:** forward cookies + `New-Api-User` / `x-reizo-user` as existing auth routes do; chat may also use `REIZO_GATEWAY_TOKEN` (server env Bearer) when user session alone is insufficient — document in `.env.example`.
- **Chinese UI copy** for product chrome.
- **Desktop-ready:** all storage/tools behind ports in `src/lib/host/*`.
- **Frequent commits** after each task; do not commit `_tmp_*` or secrets.
- **Next.js note:** read `node_modules/next/dist/docs/` before using unfamiliar App Router APIs.

## File map (create / modify)

| Path | Responsibility |
|------|----------------|
| `src/lib/agent/types.ts` | Domain types: Session, Message, Skill, Artifact, SSE events |
| `src/lib/host/ports.ts` | Host port interfaces |
| `src/lib/host/web/file-store.ts` | Web SessionStore + ArtifactStore (JSON + blobs under `data/`) |
| `src/lib/host/web/user.ts` | Resolve gateway user id from request |
| `src/lib/agent/skills/registry.ts` | Load/parse skills from `content/skills` |
| `src/lib/agent/skills/inject.ts` | Build system prompt with selected skills |
| `src/lib/agent/provider/gateway.ts` | Stream chat completions from gateway |
| `src/lib/agent/tools/index.ts` | Tool definitions + executor |
| `src/lib/agent/runtime.ts` | Agent loop + SSE encoder |
| `src/app/api/sessions/route.ts` | List/create sessions |
| `src/app/api/sessions/[id]/route.ts` | Get/patch/delete session + messages |
| `src/app/api/chat/route.ts` | POST streaming agent turn |
| `src/app/api/skills/route.ts` | List skills |
| `src/app/api/artifacts/route.ts` | List artifacts |
| `src/app/api/artifacts/[id]/route.ts` | Get artifact content |
| `src/app/studio/layout.tsx` | Studio chrome (no marketing header/footer) |
| `src/app/studio/page.tsx` | Empty state / new chat |
| `src/app/studio/c/[sessionId]/page.tsx` | Session workspace |
| `src/app/studio/skills/page.tsx` | Skills browser |
| `src/app/studio/artifacts/page.tsx` | Global artifacts |
| `src/app/studio/settings/page.tsx` | Account + model prefs |
| `src/components/studio/*` | Sidebar, ChatThread, Composer, ArtifactPanel, Preview, etc. |
| `src/app/page.tsx` | Redirect to `/studio` |
| `src/app/layout.tsx` | Conditional or minimal root (studio has own layout) |
| `content/skills/**` | Bundled skill markdown |
| `scripts/import-agency-agents.mjs` | Import curated agents |
| `data/.gitkeep` + `.gitignore` | Runtime data dir |
| `.env.example` | `NEW_API_URL`, `REIZO_GATEWAY_TOKEN` |
| `src/lib/agent/**/*.test.ts` | Unit tests (add vitest if missing) |

---

### Task 1: Domain types, host ports, file store

**Files:**
- Create: `src/lib/agent/types.ts`
- Create: `src/lib/host/ports.ts`
- Create: `src/lib/host/web/file-store.ts`
- Create: `src/lib/host/web/paths.ts`
- Create: `data/.gitkeep`
- Modify: `.gitignore` — add `/data/users/`, `/data/*.db`
- Create: `src/lib/host/web/file-store.test.ts` (after vitest setup)
- Modify: `package.json` — add `vitest`, script `"test": "vitest run"`

**Interfaces:**
- Produces: `Session`, `Message`, `Artifact`, `SessionStore`, `ArtifactStore`, `createWebFileStore()`

- [ ] **Step 1: Add vitest and gitignore data**

```json
// package.json scripts
"test": "vitest run",
"test:watch": "vitest"
```

```gitignore
# append
/data/users/
/data/*.db
/data/blobs/
```

Install: `npm i -D vitest`

- [ ] **Step 2: Write types**

```ts
// src/lib/agent/types.ts
export type Role = "user" | "assistant" | "system" | "tool";

export interface Session {
  id: string;
  userId: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  arguments: string;
  result?: string;
}

export interface Message {
  id: string;
  sessionId: string;
  role: Role;
  content: string;
  skillIds?: string[];
  toolCalls?: ToolCallRecord[];
  attachmentIds?: string[];
  createdAt: string;
}

export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  category: string;
  triggers?: string[];
  examplePrompt?: string;
  preview?: "markdown" | "html" | "none";
  source: "bundled" | "imported" | "user";
  enabled: boolean;
}

export interface Skill extends SkillMeta {
  systemPrompt: string;
}

export type ArtifactKind = "markdown" | "html" | "text" | "json" | "image" | "binary";

export interface Artifact {
  id: string;
  userId: string;
  sessionId: string;
  messageId?: string;
  name: string;
  kind: ArtifactKind;
  mimeType: string;
  storageKey: string;
  createdAt: string;
}

export type AgentSseEvent =
  | { type: "session"; sessionId: string }
  | { type: "text_delta"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; ok: boolean; summary: string }
  | { type: "artifact"; artifactId: string; name: string; kind: ArtifactKind }
  | { type: "error"; message: string; code?: string }
  | { type: "done"; reason: "completed" | "cancelled" | "error" };
```

- [ ] **Step 3: Write ports + file store**

```ts
// src/lib/host/ports.ts
import type { Artifact, Message, Session } from "@/lib/agent/types";

export interface SessionStore {
  listSessions(userId: string): Promise<Session[]>;
  getSession(userId: string, sessionId: string): Promise<Session | null>;
  createSession(input: Omit<Session, "createdAt" | "updatedAt"> & { createdAt?: string }): Promise<Session>;
  updateSession(userId: string, sessionId: string, patch: Partial<Pick<Session, "title" | "model">>): Promise<Session>;
  deleteSession(userId: string, sessionId: string): Promise<void>;
  listMessages(userId: string, sessionId: string): Promise<Message[]>;
  appendMessages(userId: string, sessionId: string, messages: Message[]): Promise<void>;
}

export interface ArtifactStore {
  listByUser(userId: string): Promise<Artifact[]>;
  listBySession(userId: string, sessionId: string): Promise<Artifact[]>;
  get(userId: string, artifactId: string): Promise<Artifact | null>;
  write(meta: Artifact, content: Buffer | string): Promise<Artifact>;
  readContent(userId: string, artifactId: string): Promise<Buffer | null>;
}
```

Implement `createWebFileStore(rootDir: string)` under `data/` using:
- `data/users/{userId}/sessions.json`
- `data/users/{userId}/sessions/{sessionId}.json` → `{ session, messages }`
- `data/users/{userId}/artifacts.json` + `data/blobs/{userId}/{artifactId}`

Use `crypto.randomUUID()`, ISO timestamps, atomic write via temp file + rename.

- [ ] **Step 4: Unit test create + append message**

```ts
// src/lib/host/web/file-store.test.ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { createWebFileStore } from "./file-store";

describe("web file store", () => {
  const dirs: string[] = [];
  afterEach(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

  it("creates session and appends messages", async () => {
    const root = mkdtempSync(join(tmpdir(), "wl-"));
    dirs.push(root);
    const store = createWebFileStore(root);
    const session = await store.sessions.createSession({
      id: "s1", userId: "u1", title: "测试", model: "gpt-4o-mini",
    });
    expect(session.title).toBe("测试");
    await store.sessions.appendMessages("u1", "s1", [{
      id: "m1", sessionId: "s1", role: "user", content: "你好", createdAt: new Date().toISOString(),
    }]);
    const msgs = await store.sessions.listMessages("u1", "s1");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe("你好");
  });
});
```

Run: `npm test`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore data/.gitkeep src/lib/agent/types.ts src/lib/host vitest.config.ts
git commit -m "feat(studio): domain types and web file store ports"
```

---

### Task 2: Resolve user + Studio shell layout (no marketing chrome)

**Files:**
- Create: `src/lib/host/web/user.ts`
- Create: `src/app/studio/layout.tsx`
- Create: `src/components/studio/StudioSidebar.tsx`
- Create: `src/components/studio/StudioShell.tsx`
- Create: `src/app/studio/page.tsx`
- Create: `src/app/studio/settings/page.tsx` (stub with account balance reuse)
- Modify: `src/app/page.tsx` → redirect `/studio`
- Modify: `src/app/layout.tsx` — keep providers; **do not** force header/footer on all pages (move marketing chrome to a marketing layout or only wrap non-studio routes)

**Interfaces:**
- Consumes: `getAccount` from `@/lib/account` (client)
- Produces: Studio routes render without SiteHeader/SiteFooter

- [ ] **Step 1: User resolver**

```ts
// src/lib/host/web/user.ts
import { cookies, headers } from "next/headers";

/** Gateway user id for storage partitioning. Returns null if logged out. */
export async function requireUserId(): Promise<string | null> {
  const h = await headers();
  const fromHeader = h.get("x-reizo-user")?.trim();
  if (fromHeader) return fromHeader;
  // Client should send x-reizo-user; also accept cookie if you store it server-side later.
  const jar = await cookies();
  const fromCookie = jar.get("reizo_uid")?.value;
  return fromCookie ?? null;
}
```

Client continues using `localStorage` `reizo:gateway-user-id` and sends `x-reizo-user` on Studio API fetches (same as account.ts).

- [ ] **Step 2: Split root layout**

Option A (recommended): Root layout only `html/body` + `ModalProvider`.  
Create `src/app/(marketing)/layout.tsx` with AnnouncementBar + SiteHeader + Footer; move existing marketing pages under `(marketing)/` **or** keep pages and wrap them individually for now.

**Minimal change path:**  
- Root layout: providers + children only.  
- Marketing pages that still exist keep their own header via a `MarketingFrame` component used only there.  
- Studio layout: full-height flex, no site header.

- [ ] **Step 3: Studio shell UI**

`StudioSidebar`: links 新对话 `/studio`, 最近 (list later), Skills, 作品, 设置; show balance when logged in; login CTA using existing `LoginModal` patterns from providers.

`studio/page.tsx`: empty-state title 「今天想完成什么？」+ placeholder chips (non-functional until Task 7) + prompt that creates session on first send (Task 5).

- [ ] **Step 4: Redirect home**

```ts
// src/app/page.tsx
import { redirect } from "next/navigation";
export default function Home() {
  redirect("/studio");
}
```

- [ ] **Step 5: Manual check**

Run: `npm run dev`  
Open `/` → should land on `/studio` without marketing footer.  
Open `/products` — if still needed, ensure it is not broken (optional marketing frame).

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(studio): shell layout and default redirect to workbench"
```

---

### Task 3: Sessions API

**Files:**
- Create: `src/app/api/sessions/route.ts`
- Create: `src/app/api/sessions/[id]/route.ts`
- Create: `src/lib/host/web/store-singleton.ts` — single store root `process.cwd()/data`

**Interfaces:**
- Consumes: `createWebFileStore`, `requireUserId` pattern (from request header)
- Produces: REST for list/create/get/delete sessions + messages

- [ ] **Step 1: Store singleton**

```ts
// src/lib/host/web/store-singleton.ts
import path from "node:path";
import { createWebFileStore } from "./file-store";

const root = process.env.REIZO_DATA_DIR ?? path.join(process.cwd(), "data");
export const webStore = createWebFileStore(root);
```

- [ ] **Step 2: Routes**

`GET /api/sessions` — list for user (`x-reizo-user` required → 401 if missing)  
`POST /api/sessions` — body `{ model?: string, title?: string }` → create  
`GET /api/sessions/[id]` — `{ session, messages }`  
`DELETE /api/sessions/[id]`  
`PATCH /api/sessions/[id]` — `{ title?, model? }`

Always scope by `userId` from header; never trust body userId.

- [ ] **Step 3: Smoke with curl / fetch**

```bash
# after login in browser, copy user id from localStorage reizo:gateway-user-id
curl -s -H "x-reizo-user: 1" -H "content-type: application/json" -d "{\"title\":\"t\",\"model\":\"gpt-4o-mini\"}" http://localhost:3000/api/sessions
```

Expected: JSON session with id.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(studio): sessions REST API on web file store"
```

---

### Task 4: Gateway provider streaming (no tools)

**Files:**
- Create: `src/lib/agent/provider/gateway.ts`
- Create: `src/lib/agent/provider/gateway.test.ts` — mock fetch stream parse
- Create: `.env.example`

**Interfaces:**
- Produces: `streamGatewayChat(params) → AsyncIterable<ChatChunk>`

```ts
export type ChatChunk =
  | { kind: "text"; text: string }
  | { kind: "tool_call_delta"; id: string; name?: string; argumentsDelta?: string }
  | { kind: "tool_calls"; calls: { id: string; name: string; arguments: string }[] }
  | { kind: "error"; message: string };
```

- [ ] **Step 1: Implement OpenAI-compatible SSE client**

```ts
// POST `${NEW_API_URL}/v1/chat/completions`
// headers:
//   Authorization: Bearer ${REIZO_GATEWAY_TOKEN or userToken}
//   Content-Type: application/json
//   New-Api-User: userId  (if required by gateway)
// body: { model, messages, stream: true, tools?, tool_choice? }
```

Parse `data: {...}` lines; accumulate `delta.content`; on `finish_reason` end; handle non-stream JSON error bodies as `{ kind: "error" }`.

- [ ] **Step 2: Unit test parser with a fixture string of two SSE chunks**

- [ ] **Step 3: Document env**

```env
NEW_API_URL=https://v2api.top
REIZO_GATEWAY_TOKEN=
# optional override for chat path
# REIZO_CHAT_PATH=/v1/chat/completions
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(studio): OpenAI-compatible gateway stream provider"
```

---

### Task 5: Chat API (agent loop without tools) + Chat UI

**Files:**
- Create: `src/lib/agent/runtime.ts` — `runAgentTurn` yielding `AgentSseEvent`
- Create: `src/app/api/chat/route.ts`
- Create: `src/components/studio/ChatThread.tsx`
- Create: `src/components/studio/Composer.tsx`
- Create: `src/components/studio/useStudioChat.ts`
- Create: `src/app/studio/c/[sessionId]/page.tsx`
- Create: `src/lib/studio/api.ts` — browser fetch helpers with `x-reizo-user`

**Interfaces:**
- Consumes: SessionStore, streamGatewayChat, injectSkills (stub empty until Task 7)
- Produces: Working streaming chat in UI

- [ ] **Step 1: Runtime (no tools)**

```ts
// Pseudocode
export async function* runAgentTurn(opts: {
  userId: string;
  sessionId: string;
  userText: string;
  skillIds?: string[];
  model?: string;
}): AsyncGenerator<AgentSseEvent> {
  // load session+messages; append user message; yield session
  // system = BASE_POLICY + skill injection
  // stream provider; yield text_delta; append assistant message; yield done
}
```

BASE_POLICY (zh/en short): you are Reizo Studio agent; prefer structured helpful answers; when tools exist use write_artifact for long docs.

- [ ] **Step 2: `POST /api/chat`**

Body: `{ sessionId?: string, message: string, model?: string, skillIds?: string[] }`  
If no sessionId, create session.  
Response: `text/event-stream`, each event `data: ${JSON.stringify(AgentSseEvent)}\n\n`  
401 without user header.

- [ ] **Step 3: Client chat hook**

- Read user id from localStorage  
- `fetch('/api/chat', { method:'POST', headers:{'x-reizo-user', 'content-type'}, body, signal })`  
- Parse SSE, update messages state  
- On `session` event navigate to `/studio/c/{id}` if new  
- Stop button aborts fetch

- [ ] **Step 4: Wire session page**

Load `GET /api/sessions/[id]` on mount; render ChatThread + Composer; model select from `fetchPlaza()` model names (limit ~30 popular / first N).

- [ ] **Step 5: Manual E2E**

1. Login via existing modal  
2. Set `REIZO_GATEWAY_TOKEN` if needed  
3. Send “用一句话介绍你自己”  
4. Expect streamed tokens and persisted history on refresh  

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(studio): streaming chat API and session UI"
```

---

### Task 6: Skills import + registry API

**Files:**
- Create: `scripts/import-agency-agents.mjs`
- Create: `content/skills/` (generated)
- Create: `src/lib/agent/skills/parse.ts`
- Create: `src/lib/agent/skills/registry.ts`
- Create: `src/lib/agent/skills/parse.test.ts`
- Create: `src/app/api/skills/route.ts`
- Create: `src/app/studio/skills/page.tsx`

**Interfaces:**
- Produces: `listSkills()`, `getSkill(id)`, `GET /api/skills`

- [ ] **Step 1: Parser**

Parse YAML frontmatter between `---` lines + body → `Skill`.  
`id` = frontmatter `name` or filename slug.

- [ ] **Step 2: Import script**

Read from env `AGENCY_AGENTS_DIR` default `E:/CodeCode/agency-agents-zh` or relative sibling `../agency-agents-zh`.

Curated allowlist (initial ~24):

```js
const CURATED = [
  "marketing/marketing-xiaohongshu-specialist.md",
  "marketing/marketing-content-creator.md",
  "marketing/marketing-wechat-official-account.md",
  "marketing/marketing-douyin-strategist.md",
  "marketing/marketing-seo-specialist.md",
  "design/design-brand-guardian.md",
  "design/design-ui-designer.md",
  "design/design-image-prompt-engineer.md",
  "design/design-visual-storyteller.md",
  "product/product-manager.md",
  "product/product-trend-researcher.md",
  "engineering/engineering-prompt-engineer.md",
  "engineering/engineering-technical-writer.md",
  "sales/sales-proposal-strategist.md",
  "support/support-executive-summary-generator.md",
  "finance/finance-financial-analyst.md",
  // add until ~20-30
];
```

Write `content/skills/{id}/SKILL.md` with OD-style frontmatter (`name`, `description`, `category`, `triggers`, `example_prompt`, body = original markdown without old frontmatter identity noise).

- [ ] **Step 3: Run import**

```bash
node scripts/import-agency-agents.mjs
```

Expected: files under `content/skills/`.

- [ ] **Step 4: Registry loads at runtime from `content/skills`**

- [ ] **Step 5: Skills page UI** — grid of cards, search, category filter, “使用示例” copies example prompt to composer via query `?skill=&prompt=` or client store.

- [ ] **Step 6: Commit** including generated skills (or generate in CI — prefer commit curated set for offline dev).

```bash
git commit -m "feat(studio): skill registry and agency-agents import"
```

---

### Task 7: Per-message skill injection + composer picker + chips

**Files:**
- Create: `src/lib/agent/skills/inject.ts`
- Create: `src/lib/agent/skills/inject.test.ts`
- Modify: `src/lib/agent/runtime.ts` — use inject
- Modify: `src/components/studio/Composer.tsx` — skill chips + `/` menu
- Modify: `src/app/studio/page.tsx` — empty-state scene chips

**Interfaces:**
- Produces: `buildSystemPrompt(base, skills: Skill[]): string`

- [ ] **Step 1: inject.ts**

Concatenate:

```text
{basePolicy}

## Active skills for this turn
### {skill.name}
{skill.systemPrompt}
```

Cap total skill chars (e.g. 24_000) with clear truncation note.

- [ ] **Step 2: Composer**

- Multi-select skills; show tags above input; clear after successful send.  
- `/` opens filtered skill list.  
- Pass `skillIds` to `/api/chat`.

- [ ] **Step 3: Scene chips (Demo → prefill only)**

| Chip | Prefill prompt (zh) | Suggested skills |
|------|---------------------|------------------|
| 做宣传内容 | 为…做一套开业宣传… | content-creator, brand-guardian |
| 做调研报告 | 帮我做…竞品调研… | trend-researcher, financial-analyst |
| 处理文件 | 总结以下内容… | technical-writer |
| 小红书种草 | 写三篇种草笔记… | xiaohongshu-specialist |

- [ ] **Step 4: Manual** — select skill, send, verify system influence in reply tone.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(studio): per-message skill injection and scene chips"
```

---

### Task 8: Tools + artifact store + chat tool loop

**Files:**
- Create: `src/lib/agent/tools/definitions.ts`
- Create: `src/lib/agent/tools/execute.ts`
- Modify: `src/lib/agent/runtime.ts` — multi-round tool loop (max 8)
- Modify: `src/lib/agent/provider/gateway.ts` — pass tools
- Create: `src/app/api/artifacts/route.ts`
- Create: `src/app/api/artifacts/[id]/route.ts`
- Create: `src/app/studio/artifacts/page.tsx`

**Interfaces:**
- Tools: `write_artifact`, `read_artifact`, `list_artifacts`
- SSE: `tool_call`, `tool_result`, `artifact`

- [ ] **Step 1: OpenAI tool schemas**

```ts
{
  type: "function",
  function: {
    name: "write_artifact",
    description: "Save a durable text artifact for the user to preview later",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        kind: { type: "string", enum: ["markdown", "html", "text", "json"] },
        content: { type: "string" }
      },
      required: ["name", "kind", "content"]
    }
  }
}
```

- [ ] **Step 2: execute.ts** — validate with zod; call ArtifactStore; return short summary string to model.

- [ ] **Step 3: Runtime loop**

While rounds < 8: stream; if tool_calls complete → execute → append tool messages → continue; else break.  
Yield SSE for each tool and artifact.

- [ ] **Step 4: Artifacts API** — list/get content (user-scoped).

- [ ] **Step 5: Manual** — “写一份一页纸的竞品调研大纲并保存为作品”

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(studio): tool loop and artifact persistence"
```

---

### Task 9: Artifact panel + preview (Open Design–style)

**Files:**
- Create: `src/components/studio/ArtifactPanel.tsx`
- Create: `src/components/studio/ArtifactPreview.tsx`
- Modify: `src/app/studio/c/[sessionId]/page.tsx` — 2–3 column layout
- Modify: chat hook — on `artifact` event refresh list

**Interfaces:**
- Preview: markdown → simple safe render (`react-markdown` — add dependency); html → sandboxed iframe `srcDoc`

- [ ] **Step 1: Install `react-markdown` + `remark-gfm` if not present**

- [ ] **Step 2: Panel lists session artifacts; click selects preview**

- [ ] **Step 3: Layout**

```text
flex: chat (flex-1) | artifacts (w-64) | preview (w-96, optional collapse)
```

Mobile: tabs 「对话 | 作品」.

- [ ] **Step 4: Manual** — generate artifact, open preview without leaving session.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(studio): artifact panel and markdown/html preview"
```

---

### Task 10: Auth gate polish, settings, cleanup mocks

**Files:**
- Modify: `src/components/studio/*` — if not logged in, block send + open LoginModal
- Modify: `src/app/studio/settings/page.tsx` — balance, logout, model default in `localStorage`
- Modify: remove or neutralize `ExperienceModal` entry points that fake runs
- Delete or stop using `src/lib/experience.ts` from Studio paths
- Add: `README.md` section “Reizo Studio” (dev env, import skills, data dir)

- [ ] **Step 1: Gate chat** — client + server 401

- [ ] **Step 2: Settings page** — reuse `getAccount` / `formatBalance` / logout

- [ ] **Step 3: README update** (replace create-next-app boilerplate with Studio instructions)

- [ ] **Step 4: Full smoke checklist**

| # | Check |
|---|--------|
| 1 | `/` → `/studio` |
| 2 | Login works |
| 3 | Stream chat works |
| 4 | Skill injection works |
| 5 | write_artifact + preview works |
| 6 | Refresh keeps history |
| 7 | `npm test` passes |
| 8 | `npm run build` succeeds |

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(studio): auth gate, settings, and mock experience cleanup"
```

---

## Out of scope (do not implement in this plan)

- Desktop / Electron / NewMax local tools  
- Landing marketing rebuild  
- Browser automation, MCP marketplace  
- Orchestration DAG engine  
- Full 268 skills import  
- Smart multi-provider failover  

---

## Spec coverage check

| Spec section | Tasks |
|--------------|-------|
| Free agent + Web | 4–5, all |
| OD Studio layout / artifacts / preview | 2, 9 |
| Skills + agency import | 6–7 |
| Gateway billing/auth | 4–5, 10 |
| Host ports desktop-ready | 1 |
| SSE contract | 5, 8 |
| `/` → studio | 2 |
| P0 chat | 1–5 |
| P1 skills | 6–7 |
| P2 tools/artifacts | 8–9 |
| Landing/Desktop | deferred |

## Placeholder scan

No TBD steps; env token edge case documented via `.env.example` and Task 4.

## Type names (canonical)

Use only: `Session`, `Message`, `Skill`, `Artifact`, `AgentSseEvent`, `SessionStore`, `ArtifactStore`, `streamGatewayChat`, `runAgentTurn`, `createWebFileStore`.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-07-24-reizo-studio.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — implement tasks in this session with checkpoints  

Which approach do you want?
