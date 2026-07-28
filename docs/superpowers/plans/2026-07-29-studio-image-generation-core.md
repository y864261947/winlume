# Studio Image Generation — Core Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Studio agent generate and edit images via a `generate_image` tool call, with generation running asynchronously and pushed to the frontend over SSE, rendered inline in the artifact panel.

**Architecture:** A new `generate_image` tool writes a `pending` image artifact immediately (fast tool-call return, agent turn not blocked), then a fire-and-forget background job calls a new `generateImage()` gateway client (text-to-image or, when `sourceArtifactId` is set, image-edit against an existing artifact's bytes), writes the result back to the same artifact id, and publishes an in-memory pub/sub event. A new `/api/artifacts/stream` SSE endpoint relays that event to the browser; a new `/api/artifacts/[id]/raw` route serves the binary bytes for `<img src>`.

**Tech Stack:** Next.js 16 App Router route handlers (Node runtime), TypeScript, zod, Vitest, existing file-backed `ArtifactStore`.

## Global Constraints

- No new dependencies (no `ws`/`socket.io`/Redis) — push notification reuses the existing SSE pattern already used by `/api/chat`.
- No client-held API keys — image generation calls the gateway server-side with `WINLUME_IMAGE_GATEWAY_TOKEN`, a separate token/channel from chat's `WINLUME_GATEWAY_TOKEN` (confirmed by a live test on 2026-07-29: the chat token has no image-model access, and the two tokens hash differently). Default model id is `gpt-image-2` (the only model verified reachable on the image token), overridable via `WINLUME_IMAGE_MODEL` or the tool's `model` argument.
- One artifact per generated image (never one artifact holding multiple images).
- `generate_image` is the only new tool — image-edit is the same tool with `sourceArtifactId` set, not a second tool.
- Existing artifact kinds must keep working unmodified — new `status`/`error` fields on `Artifact` are optional and additive.
- Do not run `next build` / `tsc` as a verification step — this project's convention (`AGENTS.md`) is that the user runs builds themselves. Verify each task with the relevant `npx vitest run <path>` command instead.

---

### Task 1: `Artifact.status` + `generate_image` tool schema

**Files:**
- Modify: `src/lib/agent/types.ts`
- Modify: `src/lib/agent/tools/definitions.ts`

**Interfaces:**
- Produces: `Artifact.status?: "pending" | "ready" | "failed"`, `Artifact.error?: string` (consumed by Task 4, Task 5, Task 7).
- Produces: `STUDIO_TOOLS` entry named `"generate_image"` and `StudioToolName` including `"generate_image"` (consumed by Task 4's `executeStudioTool` switch and by the gateway tool-calling loop in `runtime.ts`, which already spreads `STUDIO_TOOLS` unmodified).

This task has no dedicated test file (it's a type/schema-only change with no runtime branching); it's verified by Task 4's tests, which import `generate_image`'s schema-adjacent code.

- [ ] **Step 1: Add `status`/`error` to `Artifact`**

In `src/lib/agent/types.ts`, replace:

```ts
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
```

with:

```ts
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
  /** Present for artifacts produced asynchronously (currently only `image`). Omitted → treated as ready. */
  status?: "pending" | "ready" | "failed";
  /** Set when status is "failed". */
  error?: string;
}
```

- [ ] **Step 2: Add the `generate_image` tool to `STUDIO_TOOLS`**

In `src/lib/agent/tools/definitions.ts`, change the `StudioToolName` union:

```ts
export type StudioToolName =
  | "todo_write"
  | "write_artifact"
  | "read_artifact"
  | "list_artifacts"
  | "generate_image";
```

Then insert a new entry into the `STUDIO_TOOLS` array, after the `list_artifacts` entry (before the closing `] as const;`):

```ts
  {
    type: "function" as const,
    function: {
      name: "generate_image",
      description:
        "Generate a new image from a text prompt, or edit an existing image artifact when sourceArtifactId is set. Returns immediately with pending artifact id(s); the image renders in the artifact panel once generation finishes — do not wait for it or claim it is ready in this turn.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Short human-readable title for the artifact",
          },
          prompt: {
            type: "string",
            description: "Full description of the desired image (or the desired edit, when sourceArtifactId is set)",
          },
          model: {
            type: "string",
            description: "Image model id. Omit to use the session/scenario default.",
          },
          size: {
            type: "string",
            enum: ["1024x1024", "1024x1536", "1536x1024"],
            description: "Output image dimensions",
          },
          style: {
            type: "string",
            description: "Optional style hint appended to the prompt (e.g. 'flat illustration', 'photorealistic')",
          },
          count: {
            type: "integer",
            minimum: 1,
            maximum: 4,
            description: "How many images to generate (each becomes its own artifact)",
          },
          sourceArtifactId: {
            type: "string",
            description: "Id of an existing image artifact to edit. Present → image-edit; absent → text-to-image.",
          },
        },
        required: ["name", "prompt", "size", "count"],
        additionalProperties: false,
      },
    },
  },
```

And finally update `STUDIO_TOOL_NAMES`:

```ts
export const STUDIO_TOOL_NAMES: readonly StudioToolName[] = [
  "todo_write",
  "write_artifact",
  "read_artifact",
  "list_artifacts",
  "generate_image",
] as const;
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/types.ts src/lib/agent/tools/definitions.ts
git commit -m "feat(studio): add Artifact status field and generate_image tool schema"
```

---

### Task 2: `generateImage()` gateway client

**Files:**
- Modify: `src/lib/agent/provider/gateway.ts`
- Test: `src/lib/agent/provider/gateway.test.ts`

**Interfaces:**
- Consumes: `getGatewayBaseUrl(override?: string): string` (existing, same file).
- Produces: `generateImage(params: GenerateImageParams): Promise<GeneratedImage[]>` and `export function errorMessageFromBody(text: string, status: number): string` (newly exported, was already defined but private — Task 4 reuses it for error messages).

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/agent/provider/gateway.test.ts`:

```ts
import { generateImage } from "./gateway";

describe("generateImage", () => {
  it("posts to /v1/images/generations and decodes a b64_json result", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ data: [{ b64_json: Buffer.from("hello").toString("base64") }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await generateImage({
      prompt: "a red fox",
      size: "1024x1024",
      n: 1,
      token: "test-token",
      baseUrl: "https://gw.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual([{ bytes: Buffer.from("hello"), mimeType: "image/png" }]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://gw.test/v1/images/generations");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      model: "gpt-image-2",
      prompt: "a red fox",
      size: "1024x1024",
      n: 1,
    });
  });

  it("fetches image bytes when the API returns a url instead of b64_json", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ url: "https://cdn.test/img.png" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/webp" },
        }),
      );

    const result = await generateImage({
      prompt: "a red fox",
      size: "1024x1024",
      n: 1,
      token: "test-token",
      baseUrl: "https://gw.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual([{ bytes: Buffer.from([1, 2, 3]), mimeType: "image/webp" }]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1]?.[0]).toBe("https://cdn.test/img.png");
  });

  it("posts multipart to /v1/images/edits when sourceImage is set", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ data: [{ b64_json: Buffer.from("edited").toString("base64") }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await generateImage({
      prompt: "make the sky purple",
      size: "1024x1024",
      n: 1,
      token: "test-token",
      baseUrl: "https://gw.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sourceImage: { bytes: Buffer.from("orig"), mimeType: "image/png" },
    });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://gw.test/v1/images/edits");
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get("prompt")).toBe("make the sky purple");
    expect(form.get("size")).toBe("1024x1024");
    expect(form.get("image")).toBeInstanceOf(Blob);
    // Content-Type must be left unset so fetch can add the multipart boundary itself.
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("throws with the gateway's error message on a non-ok response", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "quota exceeded" } }), {
        status: 429,
      }),
    );

    await expect(
      generateImage({
        prompt: "a red fox",
        size: "1024x1024",
        n: 1,
        token: "test-token",
        baseUrl: "https://gw.test",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow("quota exceeded");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/agent/provider/gateway.test.ts`
Expected: FAIL — `generateImage is not exported` / `does not exist`.

- [ ] **Step 3: Export `errorMessageFromBody` and implement `generateImage`**

In `src/lib/agent/provider/gateway.ts`, change:

```ts
function errorMessageFromBody(text: string, status: number): string {
```

to:

```ts
export function errorMessageFromBody(text: string, status: number): string {
```

Then append this block to the end of the file:

```ts
export interface GenerateImageParams {
  prompt: string;
  size: "1024x1024" | "1024x1536" | "1536x1024";
  n: number;
  model?: string;
  /** Present → calls the image-edit endpoint instead of generation. */
  sourceImage?: { bytes: Buffer; mimeType: string };
  token?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface GeneratedImage {
  bytes: Buffer;
  mimeType: string;
}

interface ImagesApiItem {
  b64_json?: string;
  url?: string;
}

interface ImagesApiResponse {
  data?: ImagesApiItem[];
  error?: { message?: string } | string;
}

async function resolveGeneratedImage(
  item: ImagesApiItem,
  fetchImpl: typeof fetch,
): Promise<GeneratedImage> {
  if (item.b64_json) {
    return { bytes: Buffer.from(item.b64_json, "base64"), mimeType: "image/png" };
  }
  if (item.url) {
    const res = await fetchImpl(item.url);
    if (!res.ok) {
      throw new Error(`Failed to download generated image (${res.status})`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const mimeType = res.headers.get("content-type") ?? "image/png";
    return { bytes: Buffer.from(arrayBuffer), mimeType };
  }
  throw new Error("Image API returned an item with neither b64_json nor url");
}

/**
 * Text-to-image (default) or image-edit (when `sourceImage` is set) against
 * the NewAPI gateway's OpenAI-compatible Images API.
 */
/** Default image model — the only model id verified reachable on the image gateway token as of 2026-07-29. */
const DEFAULT_IMAGE_MODEL = "gpt-image-2";

/**
 * Image generation uses a separate gateway token/channel from chat
 * (`WINLUME_IMAGE_GATEWAY_TOKEN`, not `WINLUME_GATEWAY_TOKEN`) — confirmed by
 * a live call: the chat token has no access to any image model, and hashing
 * both tokens shows they are different secrets, not just different env names.
 */
export async function generateImage(
  params: GenerateImageParams,
): Promise<GeneratedImage[]> {
  const baseUrl = getGatewayBaseUrl(params.baseUrl);
  const token = params.token ?? process.env.WINLUME_IMAGE_GATEWAY_TOKEN ?? "";
  const model = params.model ?? process.env.WINLUME_IMAGE_MODEL ?? DEFAULT_IMAGE_MODEL;
  const fetchImpl = params.fetchImpl ?? fetch;
  const isEdit = Boolean(params.sourceImage);
  const path = isEdit ? "/v1/images/edits" : "/v1/images/generations";
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit;
  if (isEdit) {
    const form = new FormData();
    form.set("model", model);
    form.set("prompt", params.prompt);
    form.set("size", params.size);
    form.set("n", String(params.n));
    const sourceImage = params.sourceImage!;
    form.set(
      "image",
      new Blob([new Uint8Array(sourceImage.bytes)], { type: sourceImage.mimeType }),
      "source",
    );
    body = form;
    // Do NOT set Content-Type — fetch derives the multipart boundary from the FormData body.
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({
      model,
      prompt: params.prompt,
      size: params.size,
      n: params.n,
    });
  }

  const response = await fetchImpl(url, { method: "POST", headers, body });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(errorMessageFromBody(text, response.status));
  }

  let json: ImagesApiResponse;
  try {
    json = JSON.parse(text) as ImagesApiResponse;
  } catch {
    throw new Error(errorMessageFromBody(text, response.status));
  }
  if (json.error) {
    const msg = typeof json.error === "string" ? json.error : json.error.message;
    throw new Error(msg ?? "Image generation failed");
  }
  const items = json.data ?? [];
  if (!items.length) {
    throw new Error("Image API returned no results");
  }
  return Promise.all(items.map((item) => resolveGeneratedImage(item, fetchImpl)));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/agent/provider/gateway.test.ts`
Expected: PASS (all `generateImage` cases plus the pre-existing suite).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/provider/gateway.ts src/lib/agent/provider/gateway.test.ts
git commit -m "feat(studio): add generateImage gateway client for text-to-image and image-edit"
```

---

### Task 3: In-memory artifact event pub/sub

**Files:**
- Create: `src/lib/agent/artifact-events.ts`
- Test: `src/lib/agent/artifact-events.test.ts`

**Interfaces:**
- Produces: `ArtifactStreamEvent` type, `subscribeArtifactEvents(userId: string, listener: (event: ArtifactStreamEvent) => void): () => void`, `publishArtifactEvent(userId: string, event: ArtifactStreamEvent): void` (consumed by Task 4's background job and Task 5's SSE route).

- [ ] **Step 1: Write the failing test**

Create `src/lib/agent/artifact-events.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { publishArtifactEvent, subscribeArtifactEvents } from "./artifact-events";

describe("artifact-events", () => {
  it("delivers a published event to a subscribed listener", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeArtifactEvents("user-1", listener);

    publishArtifactEvent("user-1", {
      type: "artifact_updated",
      artifactId: "art-1",
      status: "ready",
    });

    expect(listener).toHaveBeenCalledWith({
      type: "artifact_updated",
      artifactId: "art-1",
      status: "ready",
    });
    unsubscribe();
  });

  it("does not deliver to listeners of a different user", () => {
    const listener = vi.fn();
    subscribeArtifactEvents("user-1", listener);

    publishArtifactEvent("user-2", {
      type: "artifact_updated",
      artifactId: "art-1",
      status: "ready",
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops delivering after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeArtifactEvents("user-1", listener);
    unsubscribe();

    publishArtifactEvent("user-1", {
      type: "artifact_updated",
      artifactId: "art-1",
      status: "failed",
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it("does not throw when publishing with no subscribers", () => {
    expect(() =>
      publishArtifactEvent("nobody-listening", {
        type: "artifact_updated",
        artifactId: "art-1",
        status: "ready",
      }),
    ).not.toThrow();
  });

  it("keeps delivering to remaining listeners if one listener throws", () => {
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    subscribeArtifactEvents("user-1", bad);
    subscribeArtifactEvents("user-1", good);

    expect(() =>
      publishArtifactEvent("user-1", {
        type: "artifact_updated",
        artifactId: "art-1",
        status: "ready",
      }),
    ).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agent/artifact-events.test.ts`
Expected: FAIL — cannot find module `./artifact-events`.

- [ ] **Step 3: Implement the pub/sub module**

Create `src/lib/agent/artifact-events.ts`:

```ts
/**
 * In-memory, per-process, per-user pub/sub for artifact status changes.
 * Backs the `/api/artifacts/stream` SSE endpoint. Single-instance only —
 * does not survive a process restart and does not fan out across multiple
 * server instances. Acceptable at the project's current single-VM deploy;
 * a real pub/sub (Redis, etc.) would slot in here without changing callers.
 */

export type ArtifactStreamEvent =
  | {
      type: "artifact_updated";
      artifactId: string;
      status: "pending" | "ready" | "failed";
    }
  | { type: "ping" };

type Listener = (event: ArtifactStreamEvent) => void;

const listenersByUser = new Map<string, Set<Listener>>();

export function subscribeArtifactEvents(
  userId: string,
  listener: Listener,
): () => void {
  let set = listenersByUser.get(userId);
  if (!set) {
    set = new Set();
    listenersByUser.set(userId, set);
  }
  set.add(listener);

  return () => {
    const current = listenersByUser.get(userId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listenersByUser.delete(userId);
  };
}

export function publishArtifactEvent(
  userId: string,
  event: ArtifactStreamEvent,
): void {
  const set = listenersByUser.get(userId);
  if (!set || set.size === 0) return;
  for (const listener of set) {
    try {
      listener(event);
    } catch {
      // A misbehaving listener must not break delivery to the others.
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/agent/artifact-events.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/artifact-events.ts src/lib/agent/artifact-events.test.ts
git commit -m "feat(studio): add in-memory per-user artifact event pub/sub"
```

---

### Task 4: `executeGenerateImage` tool execution

**Files:**
- Modify: `src/lib/agent/tools/execute.ts`
- Modify: `src/lib/agent/tools/execute.test.ts`

**Interfaces:**
- Consumes: `generateImage(params): Promise<GeneratedImage[]>` from `@/lib/agent/provider/gateway` (Task 2); `publishArtifactEvent(userId, event)` from `@/lib/agent/artifact-events` (Task 3); `ArtifactStore.write(meta, content)` / `.get()` / `.readContent()` (existing, `@/lib/host/ports`).
- Produces: `executeGenerateImage(rawArgs, ctx): Promise<ToolExecuteResult>` and `runImageGenerationJob(job): Promise<void>` (exported for direct testing of the async completion path), wired into `executeStudioTool`'s switch under `"generate_image"`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/agent/tools/execute.test.ts` (inside the existing `describe("executeStudioTool + ArtifactStore", ...)` block is fine, but this plan adds a new top-level block so it's independently runnable — insert after the closing of that `describe`):

```ts
import { generateImage } from "../provider/gateway";
import {
  executeGenerateImage,
  runImageGenerationJob,
} from "./execute";

vi.mock("../provider/gateway", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../provider/gateway")>();
  return { ...actual, generateImage: vi.fn() };
});

describe("executeGenerateImage", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    vi.mocked(generateImage).mockReset();
  });

  function makeStore() {
    const dir = mkdtempSync(join(tmpdir(), "winlume-imagegen-"));
    dirs.push(dir);
    return createWebFileStore(dir).artifacts;
  }

  it("writes N pending image artifacts immediately and returns their ids", async () => {
    const artifacts = makeStore();
    const result = await executeGenerateImage(
      { name: "Fox", prompt: "a red fox", size: "1024x1024", count: 2 },
      { userId: "u1", sessionId: "s1", artifacts },
    );

    expect(result.ok).toBe(true);
    const parsed = JSON.parse(result.content) as {
      artifacts: { id: string; name: string; status: string }[];
    };
    expect(parsed.artifacts).toHaveLength(2);
    expect(parsed.artifacts.every((a) => a.status === "pending")).toBe(true);
    expect(result.events).toHaveLength(2);
    expect(result.events?.[0]).toMatchObject({ type: "artifact", kind: "image" });

    const stored = await artifacts.get("u1", parsed.artifacts[0]!.id);
    expect(stored?.status).toBe("pending");
    expect(stored?.kind).toBe("image");
  });

  it("rejects invalid arguments", async () => {
    const artifacts = makeStore();
    const result = await executeGenerateImage(
      { name: "Fox", prompt: "a red fox", size: "bogus", count: 2 },
      { userId: "u1", sessionId: "s1", artifacts },
    );
    expect(result.ok).toBe(false);
    expect(result.summary).toContain("validation failed");
  });
});

describe("runImageGenerationJob", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    vi.mocked(generateImage).mockReset();
  });

  function makeStore() {
    const dir = mkdtempSync(join(tmpdir(), "winlume-imagegen-job-"));
    dirs.push(dir);
    return createWebFileStore(dir).artifacts;
  }

  it("marks the artifact ready and writes the returned bytes on success", async () => {
    const artifacts = makeStore();
    const pending = await artifacts.write(
      {
        id: "art-1",
        userId: "u1",
        sessionId: "s1",
        name: "Fox",
        kind: "image",
        mimeType: "application/octet-stream",
        storageKey: "",
        status: "pending",
        createdAt: new Date().toISOString(),
      },
      Buffer.alloc(0),
    );
    vi.mocked(generateImage).mockResolvedValue([
      { bytes: Buffer.from("PNGDATA"), mimeType: "image/png" },
    ]);

    const received: unknown[] = [];
    const { subscribeArtifactEvents } = await import("../artifact-events");
    const unsubscribe = subscribeArtifactEvents("u1", (e) => received.push(e));

    await runImageGenerationJob({
      artifact: pending,
      ctx: { userId: "u1", sessionId: "s1", artifacts },
      prompt: "a red fox",
      size: "1024x1024",
    });
    unsubscribe();

    const stored = await artifacts.get("u1", "art-1");
    expect(stored?.status).toBe("ready");
    expect(stored?.mimeType).toBe("image/png");
    const content = await artifacts.readContent("u1", "art-1");
    expect(content?.toString()).toBe("PNGDATA");
    expect(received).toEqual([
      { type: "artifact_updated", artifactId: "art-1", status: "ready" },
    ]);
  });

  it("marks the artifact failed with an error message when generation throws", async () => {
    const artifacts = makeStore();
    const pending = await artifacts.write(
      {
        id: "art-2",
        userId: "u1",
        sessionId: "s1",
        name: "Fox",
        kind: "image",
        mimeType: "application/octet-stream",
        storageKey: "",
        status: "pending",
        createdAt: new Date().toISOString(),
      },
      Buffer.alloc(0),
    );
    vi.mocked(generateImage).mockRejectedValue(new Error("quota exceeded"));

    await runImageGenerationJob({
      artifact: pending,
      ctx: { userId: "u1", sessionId: "s1", artifacts },
      prompt: "a red fox",
      size: "1024x1024",
    });

    const stored = await artifacts.get("u1", "art-2");
    expect(stored?.status).toBe("failed");
    expect(stored?.error).toBe("quota exceeded");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/agent/tools/execute.test.ts`
Expected: FAIL — `executeGenerateImage` / `runImageGenerationJob` not exported.

- [ ] **Step 3: Implement `executeGenerateImage` and `runImageGenerationJob`**

In `src/lib/agent/tools/execute.ts`, add these imports near the top (alongside the existing `import type { AgentSseEvent, Artifact, ArtifactKind } from "@/lib/agent/types";`):

```ts
import { generateImage } from "@/lib/agent/provider/gateway";
import { publishArtifactEvent } from "@/lib/agent/artifact-events";
```

Add the zod schema next to `writeArtifactSchema`:

```ts
const generateImageSchema = z.object({
  name: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1).max(4_000),
  model: z.string().trim().min(1).max(100).optional(),
  size: z.enum(["1024x1024", "1024x1536", "1536x1024"]),
  style: z.string().trim().max(200).optional(),
  count: z.number().int().min(1).max(4),
  sourceArtifactId: z.string().trim().min(1).max(128).optional(),
});

export type GenerateImageArgs = z.infer<typeof generateImageSchema>;
```

Add the execution functions after `executeWriteArtifact` (before `executeReadArtifact`):

```ts
export interface ImageGenerationJob {
  artifact: Artifact;
  ctx: ToolExecuteContext;
  prompt: string;
  model?: string;
  size: "1024x1024" | "1024x1536" | "1536x1024";
  sourceImage?: { bytes: Buffer; mimeType: string };
}

/** Runs one generation call and writes the result back to `job.artifact.id`. Never throws. */
export async function runImageGenerationJob(job: ImageGenerationJob): Promise<void> {
  const { artifact, ctx, prompt, model, size, sourceImage } = job;
  try {
    const [image] = await generateImage({ prompt, model, size, n: 1, sourceImage });
    if (!image) throw new Error("Image API returned no results");
    await ctx.artifacts.write(
      { ...artifact, mimeType: image.mimeType, status: "ready", error: undefined },
      image.bytes,
    );
    publishArtifactEvent(ctx.userId, {
      type: "artifact_updated",
      artifactId: artifact.id,
      status: "ready",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Image generation failed";
    await ctx.artifacts.write(
      { ...artifact, status: "failed", error: message },
      Buffer.alloc(0),
    );
    publishArtifactEvent(ctx.userId, {
      type: "artifact_updated",
      artifactId: artifact.id,
      status: "failed",
    });
  }
}

export async function executeGenerateImage(
  rawArgs: unknown,
  ctx: ToolExecuteContext,
): Promise<ToolExecuteResult> {
  const parsed = generateImageSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return fail(`generate_image validation failed: ${formatZodError(parsed.error)}`);
  }
  const { name, prompt, model, size, style, count, sourceArtifactId } = parsed.data;

  let sourceImage: { bytes: Buffer; mimeType: string } | undefined;
  if (sourceArtifactId) {
    const meta = await ctx.artifacts.get(ctx.userId, sourceArtifactId);
    if (!meta) return fail(`Source artifact not found: ${sourceArtifactId}`);
    const buf = await ctx.artifacts.readContent(ctx.userId, sourceArtifactId);
    if (!buf || buf.length === 0) {
      return fail(`Source artifact content missing: ${sourceArtifactId}`);
    }
    sourceImage = { bytes: buf, mimeType: meta.mimeType };
  }

  const createdAt = new Date().toISOString();
  const pending: Artifact[] = [];
  try {
    for (let i = 0; i < count; i++) {
      const id = randomUUID();
      const artifact = await ctx.artifacts.write(
        {
          id,
          userId: ctx.userId,
          sessionId: ctx.sessionId,
          ...(ctx.messageId ? { messageId: ctx.messageId } : {}),
          name: count > 1 ? `${name} (${i + 1}/${count})` : name,
          kind: "image",
          mimeType: "application/octet-stream",
          storageKey: "",
          status: "pending",
          createdAt,
        },
        Buffer.alloc(0),
      );
      pending.push(artifact);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "generate_image failed";
    return fail(msg);
  }

  const fullPrompt = style ? `${prompt} (style: ${style})` : prompt;
  for (const artifact of pending) {
    void runImageGenerationJob({ artifact, ctx, prompt: fullPrompt, model, size, sourceImage });
  }

  const summary = `Started generating ${pending.length} image(s): ${pending
    .map((a) => a.id)
    .join(", ")}`;
  return {
    ok: true,
    summary,
    content: JSON.stringify({
      artifacts: pending.map((a) => ({ id: a.id, name: a.name, status: a.status })),
    }),
    artifact: pending[0],
    events: pending.map((a) => ({
      type: "artifact" as const,
      artifactId: a.id,
      name: a.name,
      kind: a.kind,
    })),
  };
}
```

Wire it into the dispatcher — in `executeStudioTool`, add a case alongside `"write_artifact"`:

```ts
    case "write_artifact":
      return executeWriteArtifact(rawArgs, ctx);
    case "generate_image":
      return executeGenerateImage(rawArgs, ctx);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/agent/tools/execute.test.ts`
Expected: PASS (all cases, including the pre-existing suite in this file).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/execute.ts src/lib/agent/tools/execute.test.ts
git commit -m "feat(studio): execute generate_image — pending write + async gen job"
```

---

### Task 5: Artifact API routes (SSE stream, raw bytes, metadata fix)

**Files:**
- Create: `src/app/api/artifacts/stream/route.ts`
- Create: `src/app/api/artifacts/[id]/raw/route.ts`
- Modify: `src/app/api/artifacts/[id]/route.ts`
- Modify: `src/lib/agent/runtime.ts`

**Interfaces:**
- Consumes: `subscribeArtifactEvents` (Task 3), `getCurrentUserId()` (`@/lib/auth/session`, existing), `webStore` (`@/lib/host/web/store-singleton`, existing).

No dedicated test file: these are Next.js route handlers with no existing test-route precedent in this codebase (`/api/chat` has none either); verified manually in Task 6/7's browser check instead of a unit test.

- [ ] **Step 1: Add the SSE stream route**

Create `src/app/api/artifacts/stream/route.ts`:

```ts
import { NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import {
  subscribeArtifactEvents,
  type ArtifactStreamEvent,
} from "@/lib/agent/artifact-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15000;

function sseFrame(event: ArtifactStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * GET /api/artifacts/stream — long-lived SSE connection, independent of any
 * chat turn. Relays artifact status changes published by background image
 * generation jobs (see src/lib/agent/artifact-events.ts).
 */
export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const encoder = new TextEncoder();
  const clientSignal = request.signal;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = (event: ArtifactStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseFrame(event)));
        } catch {
          closed = true;
        }
      };

      const unsubscribe = subscribeArtifactEvents(userId, send);
      const heartbeat = setInterval(() => send({ type: "ping" }), HEARTBEAT_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      clientSignal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
```

- [ ] **Step 2: Add the raw-bytes route**

Create `src/app/api/artifacts/[id]/raw/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { webStore } from "@/lib/host/web/store-singleton";

type IdContext = { params: Promise<{ id: string }> };

/**
 * GET /api/artifacts/[id]/raw — raw bytes with the artifact's real
 * mimeType, for direct use as an <img src> (or any binary download).
 */
export async function GET(request: NextRequest, context: IdContext) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Missing artifact id" }, { status: 400 });
  }

  const artifact = await webStore.artifacts.get(userId, id);
  if (!artifact) {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }

  const buf = await webStore.artifacts.readContent(userId, id);
  if (!buf || buf.length === 0) {
    return NextResponse.json({ error: "Artifact content not ready" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": artifact.mimeType || "application/octet-stream",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
```

- [ ] **Step 3: Stop force-decoding binary artifacts as UTF-8 in the metadata route**

In `src/app/api/artifacts/[id]/route.ts`, replace:

```ts
  const buf = await webStore.artifacts.readContent(userId, id);
  const content = buf ? buf.toString("utf8") : "";

  return NextResponse.json({ artifact, content });
```

with:

```ts
  const isBinaryKind = artifact.kind === "image" || artifact.kind === "binary";
  const buf = isBinaryKind ? null : await webStore.artifacts.readContent(userId, id);
  const content = isBinaryKind ? null : buf ? buf.toString("utf8") : "";

  return NextResponse.json({ artifact, content });
```

- [ ] **Step 4: Tell the agent when to use `generate_image`**

In `src/lib/agent/runtime.ts`, add one line to the `BASE_POLICY` array (insert after the existing `write_artifact` guidance line, i.e. after `"After write_artifact succeeds: ..."`):

```ts
  "Call generate_image when the user asks for an image, illustration, icon, mockup, or artwork, or asks to edit/modify an existing image artifact (set sourceArtifactId to that artifact's id in the latter case). It returns immediately with a pending artifact — the image renders in the panel once generation finishes; do not claim it is ready yet or describe what it looks like.",
```

No other change to `runtime.ts` is needed: `generate_image` is not in the existing `canParallel` allow-list (`name === "read_artifact" || name === "list_artifacts"`), so it already runs through the same serial path as `write_artifact`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/artifacts/stream/route.ts src/app/api/artifacts/[id]/raw/route.ts src/app/api/artifacts/[id]/route.ts src/lib/agent/runtime.ts
git commit -m "feat(studio): add artifact SSE stream + raw bytes routes, wire generate_image into agent policy"
```

---

### Task 6: Client-side SSE subscription

**Files:**
- Create: `src/lib/studio/artifact-stream-client.ts`
- Modify: `src/app/studio/c/[sessionId]/page.tsx`

**Interfaces:**
- Consumes: nothing new from earlier tasks besides the route from Task 5 (`GET /api/artifacts/stream`).
- Produces: `subscribeArtifactStream(onEvent: (event: ArtifactStreamEvent) => void): () => void` (consumed by `page.tsx`).

- [ ] **Step 1: Add the client subscription helper**

Create `src/lib/studio/artifact-stream-client.ts`:

```ts
"use client";

export type ArtifactStreamEvent =
  | { type: "artifact_updated"; artifactId: string; status: "pending" | "ready" | "failed" }
  | { type: "ping" };

/**
 * Opens one long-lived EventSource against /api/artifacts/stream and calls
 * `onEvent` for every artifact_updated frame. Returns an unsubscribe
 * function that closes the connection.
 */
export function subscribeArtifactStream(
  onEvent: (event: Extract<ArtifactStreamEvent, { type: "artifact_updated" }>) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const source = new EventSource("/api/artifacts/stream");
  source.onmessage = (e) => {
    let parsed: ArtifactStreamEvent;
    try {
      parsed = JSON.parse(e.data) as ArtifactStreamEvent;
    } catch {
      return;
    }
    if (parsed.type === "artifact_updated") onEvent(parsed);
  };

  return () => source.close();
}
```

- [ ] **Step 2: Wire it into the Studio page**

In `src/app/studio/c/[sessionId]/page.tsx`, add the import near the other `@/lib/studio/*` imports:

```ts
import { subscribeArtifactStream } from "@/lib/studio/artifact-stream-client";
```

Add a new `useEffect` immediately after the `refreshArtifacts` callback (defined at what is currently lines 261-294, ending with `[session?.id, sessionId, openWorksRail],\n  );`):

```ts
  // Background image generation jobs push status changes here, independent
  // of any single chat turn's own SSE stream (see artifact-events.ts).
  useEffect(() => {
    const unsubscribe = subscribeArtifactStream((event) => {
      setArtifacts((prev) =>
        prev.map((a) =>
          a.id === event.artifactId ? { ...a, status: event.status } : a,
        ),
      );
      if (event.artifactId === selectedId) {
        void reloadContent();
      }
    });
    return unsubscribe;
  }, [selectedId, reloadContent]);
```

This effect references `reloadContent`, which is declared later in the file (line 324 in the current version). Since it's only used inside the effect callback (not at render time) and both are stable `useCallback`s recreated together, declaration order does not matter for correctness, but place the new `useEffect` after the `reloadContent` declaration if your editor's lint rule flags use-before-define for `const` bindings in the same module scope — in that case move the block to directly after the `reloadContent` callback instead (ending `[selectedId],\n  );`).

- [ ] **Step 3: Manual verification**

This task has no automated test (it depends on a live SSE connection + browser `EventSource`, not covered by existing test infra in this repo). Verify manually once Task 7 is done: start the dev server, open a Studio session, ask for an image, and confirm the panel updates from "generating" to the finished image without a manual refresh.

- [ ] **Step 4: Commit**

```bash
git add src/lib/studio/artifact-stream-client.ts "src/app/studio/c/[sessionId]/page.tsx"
git commit -m "feat(studio): subscribe to artifact SSE stream and live-update the panel"
```

---

### Task 7: Render images in `ArtifactPreview`

**Files:**
- Modify: `src/components/studio/ArtifactPreview.tsx`

**Interfaces:**
- Consumes: `Artifact.status` / `Artifact.error` (Task 1), `GET /api/artifacts/[id]/raw` (Task 5).

No automated test — this component has no existing test file and is a rendering-only change; verified in Task 6 Step 3's manual check.

- [ ] **Step 1: Render a real `<img>`, with pending/failed states**

In `src/components/studio/ArtifactPreview.tsx`, replace the `case "image":` branch inside `renderPreview`:

```ts
    case "image":
      return (
        <p className="px-4 py-6 text-sm text-ink-500">
          图片作品暂不支持内联预览。
        </p>
      );
```

with:

```ts
    case "image": {
      if (artifact.status === "pending") {
        return (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-sm text-ink-400">
            <LoaderCircle className="h-5 w-5 animate-spin" />
            图片生成中…
          </div>
        );
      }
      if (artifact.status === "failed") {
        return (
          <p className="px-4 py-6 text-sm text-rose-600">
            生成失败{artifact.error ? `：${artifact.error}` : ""}
          </p>
        );
      }
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-canvas/40 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- artifact bytes are user-scoped, not from next/image's static pipeline */}
          <img
            src={`/api/artifacts/${artifact.id}/raw`}
            alt={artifact.name}
            className="max-h-full max-w-full rounded-lg object-contain shadow-sm"
          />
        </div>
      );
    }
```

- [ ] **Step 2: Fix `extensionFor` and `handleDownload` for binary image content**

Replace the `extensionFor` function:

```ts
function extensionFor(kind: ArtifactKind, name: string): string {
  const lower = name.toLowerCase();
  if (/\.[a-z0-9]{1,8}$/i.test(lower)) return "";
  switch (kind) {
    case "markdown":
      return ".md";
    case "html":
      return ".html";
    case "json":
      return ".json";
    case "image":
      return "";
    default:
      return ".txt";
  }
}
```

with:

```ts
function extensionFor(kind: ArtifactKind, name: string, mimeType?: string): string {
  const lower = name.toLowerCase();
  if (/\.[a-z0-9]{1,8}$/i.test(lower)) return "";
  switch (kind) {
    case "markdown":
      return ".md";
    case "html":
      return ".html";
    case "json":
      return ".json";
    case "image":
      if (mimeType === "image/jpeg") return ".jpg";
      if (mimeType === "image/webp") return ".webp";
      return ".png";
    default:
      return ".txt";
  }
}
```

Replace `handleDownload`:

```ts
  const handleDownload = useCallback(() => {
    if (!artifact || content == null) return;
    const ext = extensionFor(artifact.kind, artifact.name);
    const filename = `${artifact.name}${ext}`;
    const blob = new Blob([content], { type: mimeFor(artifact.kind) });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [artifact, content]);
```

with:

```ts
  const handleDownload = useCallback(() => {
    if (!artifact) return;
    if (artifact.kind === "image") {
      const ext = extensionFor(artifact.kind, artifact.name, artifact.mimeType);
      const a = document.createElement("a");
      a.href = `/api/artifacts/${artifact.id}/raw`;
      a.download = `${artifact.name}${ext}`;
      a.click();
      return;
    }
    if (content == null) return;
    const ext = extensionFor(artifact.kind, artifact.name);
    const filename = `${artifact.name}${ext}`;
    const blob = new Blob([content], { type: mimeFor(artifact.kind) });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [artifact, content]);
```

- [ ] **Step 3: Don't enable toolbar actions while an image is still pending**

Replace:

```ts
  const showModeToggle = canShowSource && hasPreview;
  const busy = loading || content == null;
```

with:

```ts
  const showModeToggle = canShowSource && hasPreview;
  const busy = loading || content == null || artifact?.status === "pending";
```

- [ ] **Step 4: Manual verification**

Run the dev server (`npm run dev`, per this project's own convention — not part of this plan's automated steps) and confirm in a browser:
1. Ask the Studio agent for an image → the panel shows the "图片生成中…" spinner state immediately.
2. Within generation time, it flips to the real image without a manual page refresh (this exercises Task 6's SSE wiring end-to-end).
3. Download button saves a file with the correct extension.
4. Ask for an edit referencing that artifact's id manually via `sourceArtifactId` (Task 8, "@ mention" UI, is out of scope for this plan — for this manual check it's enough to confirm the tool path works when the model is given the id in conversation) and confirm the edited image replaces the original artifact's content.

- [ ] **Step 5: Commit**

```bash
git add src/components/studio/ArtifactPreview.tsx
git commit -m "feat(studio): render generated images in the artifact panel"
```

---

## Self-Review Notes

- **Spec coverage:** §3 tool schema → Task 1. §4 async pipeline → Task 1 (status field) + Task 4. §5 SSE push → Task 3 + Task 5 Step 1 + Task 6. §6 raw content serving → Task 5 Steps 2-3. §7 frontend rendering → Task 7. §8 "@" reference UX is explicitly deferred to a follow-up plan (Plan B) per the user's own request to split scope. §9's MVP boundaries (no per-request model picker, no cross-instance pub/sub) are respected — nothing in this plan builds them.
- **Placeholder scan:** no TBD/TODO, no "add appropriate error handling" — every error path has a concrete message and test.
- **Type consistency:** `Artifact.status`/`error` (Task 1) match usage in Task 4/5/7 exactly. `GenerateImageParams`/`GeneratedImage` (Task 2) match the shape `runImageGenerationJob` (Task 4) calls `generateImage` with. `ArtifactStreamEvent` (Task 3) matches the shape the SSE route (Task 5) serializes and the client helper (Task 6) parses.
