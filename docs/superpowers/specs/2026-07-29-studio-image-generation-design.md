# Studio Image Generation Design

**Date:** 2026-07-29
**Status:** Proposed — user-approved design, pending written-spec review
**Scope:** Text-to-image and image-to-image generation surfaced through the Studio artifact pipeline (chat-driven), async job handling, and frontend rendering.

## 1. Background

The artifact runtime already reserves an `image` artifact kind and an `image-prompt` default-artifact hint (`src/lib/agent/types.ts`), and the model market already lists `图片生成` with `image-gen` / `image-edit` product categories (`src/components/ModelMarket.tsx`). None of this is wired up: `write_artifact`'s schema only accepts `markdown | html | text | json`, and `ArtifactPreview.tsx`'s `image` branch is a static "图片作品暂不支持内联预览" placeholder. This design fills that gap.

Two sibling projects were surveyed for prior art before settling on this design:

- **infinite-canvas** already generates images against the same NewAPI-compatible gateway host (`v2api.top`) via a thin proxy route. Its proxy holds the API key client-side and only exists to dodge CORS; Studio doesn't need that layer because `src/lib/agent/provider/gateway.ts` already calls the same host server-side with a trusted token.
- **open-design** treats image generation as a Skill run by a full coding agent with shell access, and uses `od.mode` / `od.preview.type` frontmatter to route a skill's output to the right renderer. Studio's agent is a constrained function-calling loop (not a bash-capable coding agent), so the equivalent here is a dedicated tool call rather than agent-authored scripts — but the "declared output shape drives the renderer" idea carries over directly to `Artifact.kind`.

## 2. Trigger Model

Image generation is triggered by the agent calling a new `generate_image` tool, the same pattern as `write_artifact`. The user stays in the conversation; no separate "image mode" screen. This matches the product thesis in `2026-07-25-reizo-artifact-runtime-design.md` — conversation is the control surface, the artifact pane is the work surface.

## 3. Tool Schema

Added to `STUDIO_TOOLS` (`src/lib/agent/tools/definitions.ts`):

```ts
{
  name: "generate_image",
  parameters: {
    name: string;                 // artifact title
    prompt: string;
    model?: string;                // omit → session/scenario default image model
    size: "1024x1024" | "1024x1536" | "1536x1024";
    style?: string;                 // optional style hint appended to prompt
    count: number;                  // 1-4, one artifact per image
    sourceArtifactId?: string;      // present → image-edit instead of text-to-image
  }
}
```

One artifact per generated image (not one artifact holding N images), preserving the existing "one artifact = one work item" model that the artifact list/panel already assumes.

`sourceArtifactId` is the single switch between generation and editing — no separate `edit_image` tool. When present, the backend reads that artifact's stored bytes and calls the gateway's image-edit endpoint instead of the generation endpoint. This keeps the agent's tool surface at one call and pushes the generate-vs-edit branching to the server, where it belongs.

`model` is required as a concept (not hardcoded) because the model market already separates `image-gen` and `image-edit` as distinct capabilities with presumably distinct model ids; a fixed default is acceptable for MVP but the field must exist so it isn't a breaking change later.

## 4. Async Pipeline

`Artifact` gains a `status: "pending" | "ready" | "failed"` field (`src/lib/agent/types.ts`), with an optional `error` message for the failed case. Existing artifact kinds default to `ready` (or omit the field) — no migration needed since the file-backed store just writes whatever object it's given.

Flow inside `executeStudioTool` / a new `executeGenerateImage`:

1. For each requested image, immediately `ArtifactStore.write` a `status: "pending"` artifact with empty content and return the artifact id(s) in the tool result. The tool call returns right away — the agent is not blocked on generation and can finish its turn (e.g. "图片正在生成,完成后会在右侧显示").
2. Fire-and-forget a background async function per image. It calls a new `generateImage()` in `gateway.ts` (mirrors `streamGatewayChat`'s auth/host handling but posts to `/v1/images/generations` or `/v1/images/edits`), downloads the resulting bytes, and calls `ArtifactStore.write` again with the same `id`, `status: "ready"` and the real content. On failure, writes `status: "failed"` with an error message instead.

   **Verified 2026-07-29 against the real gateway:** the response shape is OpenAI-compatible (`{ data: [{ url, b64_json, revised_prompt }], created }`), and decoding `b64_json` yields a valid PNG. Image generation uses its own gateway token, `REIZO_IMAGE_GATEWAY_TOKEN` — **not** the chat token (`REIZO_GATEWAY_TOKEN`); the two are different secrets on different channels, and the chat token has no access to any image model. The image token is currently scoped to exactly one model, `gpt-image-2`, which is the default when a tool call omits `model`.
3. No new storage abstraction is needed — `ArtifactStore.write` already overwrites by id, so "update after the fact" is just calling it twice.

This deliberately decouples generation from the chat turn's SSE lifecycle: a slow generation (or one that outlives the browser tab) still lands in storage and is visible on reconnect.

## 5. Frontend Notification (SSE, not WebSocket)

The project has no WebSocket/socket.io, no Redis, and deploys as a single long-running Node process (`next start` over SSH, per `.github/workflows/deploy.yml`) — the only existing server push mechanism is the per-turn chat SSE stream. Rather than introduce a new transport, add:

- A new `GET /api/artifacts/stream` SSE endpoint, opened once when the Studio shell mounts (independent of any single chat turn's SSE connection).
- An in-memory, per-`userId` event emitter on the server. The background job from §4 step 2 publishes `{ type: "artifact_updated", artifactId, status }` to it after each write.
- The client subscribes once and updates whichever artifact list/panel entries match by id — this covers the case where the originating chat request has already completed and closed its own SSE stream.

Trade-off, called out explicitly: this is in-memory and single-instance. It does not survive a process restart mid-generation, and does not fan out across multiple server instances. Both are acceptable at the project's current single-VM, single-process deployment scale; if that changes, this is the seam where a real pub/sub (Redis, etc.) would slot in without changing the client contract.

## 6. Raw Content Serving

`GET /api/artifacts/[id]` currently force-decodes content as UTF-8 and returns it as JSON (`src/app/api/artifacts/[id]/route.ts`) — unusable for binary image bytes. Add `GET /api/artifacts/[id]/raw` that streams the stored blob with the artifact's real `mimeType`, for direct use as an `<img src>`. The existing `[id]` route keeps returning metadata only for `image`/`binary` kinds (omit `content` rather than corrupt it via UTF-8 decoding).

## 7. Frontend Rendering

`ArtifactPreview.tsx`:
- Replace the static "图片作品暂不支持内联预览" branch with a real `<img src="/api/artifacts/{id}/raw">`.
- `status: "pending"` renders a generating skeleton/spinner instead of the image; `status: "failed"` renders the stored error message with a retry affordance (re-invokes the same tool call parameters — exact retry UX left to implementation).
- `handleDownload`, `mimeFor`, `extensionFor` need image-aware branches (they currently assume string/text content); download for images should hit `/raw` directly rather than re-encoding the in-memory `content` string.

## 8. "@" Image Reference (for image-to-image)

Two halves, deliberately kept separate:

**UI half — which image the user means.** The composer gets an "@" trigger that opens a picker over the current session's recent `image` artifacts. Selecting one inserts a visual chip (thumbnail + name) into the composer, not raw text.

**Model half — telling the tool call which image, reliably.** The chip's underlying `artifactId` is sent as a separate structured field on the chat request (`referencedArtifactId`), not inlined into the free-text message body, and not folded into the existing `attachmentIds` field (whose semantics are "user-uploaded files", not "reference to an existing artifact" — conflating them would blur that meaning). Server-side, `runAgentTurn` injects a short system-context line naming the referenced artifact and its id. The agent still decides, from the user's natural-language ask (e.g. "把背景换成蓝色"), whether this turn is actually an edit request and therefore whether to call `generate_image` with `sourceArtifactId` set — but it is never asked to transcribe or guess an id from prose, which is the part that's unreliable.

## 9. Out of Scope (MVP)

- Multi-image compositing / masks beyond a single `sourceArtifactId`.
- Per-request model picker UI (a session/scenario-level default is enough to start).
- Cross-instance pub/sub for the SSE push channel (see §5 trade-off).
- Editing an image artifact's generation parameters and re-running in place (retry re-issues the same call; parameter tweaking is a later iteration).

## 10. Decisions

| Topic | Decision |
|---|---|
| Trigger | Agent tool call (`generate_image`), not a separate image-mode screen |
| Generate vs. edit | One tool, switched by optional `sourceArtifactId` |
| API key handling | Server-side gateway token (existing `gateway.ts` pattern), no client-held key |
| Async model | Pending artifact written immediately, background job updates it in place |
| Push transport | Reuse SSE via a new `/api/artifacts/stream` endpoint; no WebSocket/Redis |
| Image reference in chat | Structured `referencedArtifactId` field, not text-embedded, not reusing `attachmentIds` |
