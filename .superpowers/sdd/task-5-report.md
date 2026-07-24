# Task 5 Report: Chat API (agent loop without tools) + Chat UI

## Status

**Complete**

## What was built

### 1. Agent runtime — `src/lib/agent/runtime.ts`

- **`runAgentTurn(opts) → AsyncGenerator<AgentSseEvent>`**
  - Loads session + message history via `SessionStore`
  - Appends user message; yields `{ type: "session", sessionId }`
  - First turn updates session title from user text (truncated)
  - System prompt = `BASE_POLICY` + `injectSkills(skillIds)` (**stub empty**, Task 7)
  - Streams `streamGatewayChat` (text only; tool chunks ignored until Task 8)
  - Yields `text_delta` for each content chunk
  - Persists assistant message (including partial text on cancel)
  - Yields `done` with `completed` | `cancelled` | `error`
- **`injectSkills`**: accepts optional `skillIds`, returns `""` for now

### 2. Chat API — `src/app/api/chat/route.ts`

- **`POST /api/chat`**
  - Body: `{ sessionId?, message, model?, skillIds? }`
  - **401** without `x-winlume-user`
  - Creates session when `sessionId` omitted
  - **404** if given session missing
  - Response: `text/event-stream`, frames `data: ${JSON.stringify(AgentSseEvent)}\n\n`
  - Forwards `request.signal` for client abort/stop
  - Node runtime, `force-dynamic`

### 3. Browser helpers — `src/lib/studio/api.ts`

- `getGatewayUserId` / `withUserHeaders` (`winlume:gateway-user-id` → `x-winlume-user`)
- `listSessions`, `createSession`, `getSessionBundle`
- `streamChat` — fetch + SSE parse → `onEvent(AgentSseEvent)`
- First-message handoff: `setPendingFirstMessage` / `takePendingFirstMessage` (sessionStorage)

### 4. Chat UI

| File | Role |
|------|------|
| `src/components/studio/useStudioChat.ts` | Messages state, send/stop, SSE apply, 401 → login |
| `src/components/studio/ChatThread.tsx` | Scrollable message list (中文空态/思考中) |
| `src/components/studio/Composer.tsx` | Prompt + model select (plaza 前 30 / 自定义) + 发送/停止 |
| `src/app/studio/c/[sessionId]/page.tsx` | Load session, thread + composer, auto-send pending |
| `src/app/studio/page.tsx` | First send creates session → navigate → pending handoff |

### 5. UX flow

1. Home: login check → `POST /api/sessions` → store pending message → `/studio/c/{id}`
2. Session page: `GET /api/sessions/{id}` → take pending → `POST /api/chat` SSE stream
3. Stop aborts fetch; partial assistant text still persisted when any tokens arrived
4. Model list from `fetchPlaza()` with free-text fallback

## Out of scope (per brief)

- Tool loop / `write_artifact` (Task 8)
- Real skill injection (Task 7)
- Sidebar recent sessions list
- Live gateway E2E (manual; needs `WINLUME_GATEWAY_TOKEN` + login)

## Tests

`npm test` — **pass** (11 tests, existing)

`npm run build` — **pass** (TypeScript + Next.js 16)

New routes observed in build output: `ƒ /api/chat`, `ƒ /studio/c/[sessionId]`

## Commit

```
feat(studio): streaming chat API and session UI
```

## Files

| Path | Action |
|------|--------|
| `src/lib/agent/runtime.ts` | created |
| `src/app/api/chat/route.ts` | created |
| `src/lib/studio/api.ts` | created |
| `src/components/studio/useStudioChat.ts` | created |
| `src/components/studio/ChatThread.tsx` | created |
| `src/components/studio/Composer.tsx` | created |
| `src/app/studio/c/[sessionId]/page.tsx` | created |
| `src/app/studio/page.tsx` | modified |
| `.superpowers/sdd/task-5-report.md` | created |
