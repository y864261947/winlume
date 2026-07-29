# Studio Canvas Artifact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `canvas` artifact kind so the Studio agent can generate an editable infinite-canvas diagram (flowchart / mind map / sequence diagram) from a conversation, rendered with Excalidraw, and the user can freely edit it with changes auto-saved.

**Architecture:** New `generate_canvas` tool follows the existing `generate_image` pattern (pending→ready artifact lifecycle). The AI authors Mermaid text; conversion to Excalidraw elements happens client-side (the converter needs browser DOM) via `@excalidraw/mermaid-to-excalidraw`, tagging AI-produced elements so a later AI-driven update can regenerate them while leaving anything the user hand-drew untouched. Manual edits auto-save through a new `PUT /api/artifacts/[id]` endpoint.

**Tech Stack:** Next.js 16 / React 19 app router, TypeScript, Zod validation, Vitest, `@excalidraw/excalidraw`, `@excalidraw/mermaid-to-excalidraw`.

## Global Constraints

- No new backend services (no headless browser, no WebSocket/Redis) — spec §7.
- `scene` is the single source of visual rendering/editing truth; `mermaidSource` is an authoring record only — spec §3.
- AI regeneration must never delete or alter elements the user drew by hand (untagged elements) — spec §3–4.
- Conversion runs client-side only; the tool call itself must return immediately without waiting on it — spec §4.

---

## File Map

| File | Change |
|---|---|
| `package.json` | add `@excalidraw/excalidraw`, `@excalidraw/mermaid-to-excalidraw` |
| `src/lib/agent/types.ts` | add `"canvas"` to `ArtifactKind` |
| `src/lib/agent/canvas-content.ts` | **new** — shared types, parse/serialize, tag/merge (pure, no DOM) |
| `src/lib/agent/canvas-summary.ts` | **new** — pure structural-summary function |
| `src/lib/agent/tools/definitions.ts` | add `generate_canvas` tool schema + tool name |
| `src/lib/agent/tools/execute.ts` | add `executeGenerateCanvas`, wire into `mimeTypeForKind` + `executeStudioTool` |
| `src/lib/agent/runtime.ts` | extend `@`-reference handling to canvas kind, inject structural summary, update `BASE_POLICY` |
| `src/app/api/artifacts/[id]/route.ts` | add `PUT` handler (auto-save) |
| `src/lib/studio/canvas-convert.ts` | **new** — client-side Mermaid→Excalidraw conversion (DOM-dependent) |
| `src/components/studio/ArtifactPreview.tsx` | new `canvas` render branch, conversion/autosave wiring |
| `src/app/studio/layout.tsx` | import Excalidraw CSS once |
| `src/lib/studio/image-mentions.ts` | generalize `image`-only filters to also accept `canvas` |
| `src/components/studio/Composer.tsx` | pass canvas artifacts into the existing `@`-mention picker |

---

### Task 1: Shared canvas content module

**Files:**
- Create: `src/lib/agent/canvas-content.ts`
- Test: `src/lib/agent/canvas-content.test.ts`

**Interfaces:**
- Produces: `CanvasElement` (`{ id: string; customData?: { source?: string } & Record<string, unknown>; [key: string]: unknown }`), `CanvasArtifactContent` (`{ mermaidSource: string; convertedFromMermaid?: string; scene?: { elements: CanvasElement[]; appState: Record<string, unknown> } }`), `parseCanvasContent(raw: string): CanvasArtifactContent | null`, `serializeCanvasContent(content: CanvasArtifactContent): string`, `tagAsMermaidSourced(elements: CanvasElement[]): CanvasElement[]`, `mergeCanvasElements(oldElements: CanvasElement[], freshMermaidElements: CanvasElement[]): CanvasElement[]`, `needsCanvasConversion(content: CanvasArtifactContent): boolean`.

`convertedFromMermaid` records which `mermaidSource` value `scene` was generated from. When it doesn't match `mermaidSource` (or is absent), the client knows `scene` is stale/missing and must (re)run conversion — this is the single signal used by both the initial-create case (no `scene` yet) and the AI-update case (new `mermaidSource`, stale `scene`).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/agent/canvas-content.test.ts
import { describe, expect, it } from "vitest";
import {
  mergeCanvasElements,
  needsCanvasConversion,
  parseCanvasContent,
  serializeCanvasContent,
  tagAsMermaidSourced,
  type CanvasArtifactContent,
  type CanvasElement,
} from "./canvas-content";

describe("serializeCanvasContent / parseCanvasContent", () => {
  it("round-trips a full envelope", () => {
    const content: CanvasArtifactContent = {
      mermaidSource: "flowchart TD\nA-->B",
      convertedFromMermaid: "flowchart TD\nA-->B",
      scene: { elements: [{ id: "1" }], appState: { zoom: 1 } },
    };
    const raw = serializeCanvasContent(content);
    expect(parseCanvasContent(raw)).toEqual(content);
  });

  it("returns null for invalid JSON", () => {
    expect(parseCanvasContent("{not json")).toBeNull();
  });

  it("returns null when mermaidSource is missing", () => {
    expect(parseCanvasContent(JSON.stringify({ scene: { elements: [], appState: {} } }))).toBeNull();
  });
});

describe("needsCanvasConversion", () => {
  it("is true when scene is absent", () => {
    expect(needsCanvasConversion({ mermaidSource: "flowchart TD\nA-->B" })).toBe(true);
  });

  it("is true when mermaidSource changed since last conversion", () => {
    expect(
      needsCanvasConversion({
        mermaidSource: "flowchart TD\nA-->B-->C",
        convertedFromMermaid: "flowchart TD\nA-->B",
        scene: { elements: [], appState: {} },
      }),
    ).toBe(true);
  });

  it("is false when scene matches the current mermaidSource", () => {
    expect(
      needsCanvasConversion({
        mermaidSource: "flowchart TD\nA-->B",
        convertedFromMermaid: "flowchart TD\nA-->B",
        scene: { elements: [], appState: {} },
      }),
    ).toBe(false);
  });
});

describe("tagAsMermaidSourced", () => {
  it("adds customData.source = mermaid without clobbering existing customData", () => {
    const elements: CanvasElement[] = [
      { id: "a" },
      { id: "b", customData: { note: "keep me" } },
    ];
    const tagged = tagAsMermaidSourced(elements);
    expect(tagged[0]!.customData).toEqual({ source: "mermaid" });
    expect(tagged[1]!.customData).toEqual({ note: "keep me", source: "mermaid" });
  });
});

describe("mergeCanvasElements", () => {
  it("replaces mermaid-tagged elements and preserves user-drawn ones", () => {
    const oldElements: CanvasElement[] = [
      { id: "old-node", customData: { source: "mermaid" } },
      { id: "user-note", customData: { source: "mermaid" } as unknown as { source?: string } }, // placeholder, replaced below
    ];
    oldElements[1] = { id: "user-note" }; // no mermaid tag → user-drawn
    const fresh: CanvasElement[] = [{ id: "new-node" }];
    const merged = mergeCanvasElements(oldElements, fresh);
    expect(merged).toContainEqual({ id: "new-node", customData: { source: "mermaid" } });
    expect(merged).toContainEqual({ id: "user-note" });
    expect(merged.find((el) => el.id === "old-node")).toBeUndefined();
  });

  it("handles an empty old scene (create path)", () => {
    const fresh: CanvasElement[] = [{ id: "a" }, { id: "b" }];
    expect(mergeCanvasElements([], fresh)).toEqual(tagAsMermaidSourced(fresh));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/agent/canvas-content.test.ts`
Expected: FAIL — `Cannot find module './canvas-content'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/agent/canvas-content.ts

export interface CanvasElement {
  id: string;
  customData?: { source?: string } & Record<string, unknown>;
  [key: string]: unknown;
}

export interface CanvasArtifactContent {
  mermaidSource: string;
  /** mermaidSource value that `scene` was last generated from. Mismatch/absence = stale. */
  convertedFromMermaid?: string;
  scene?: {
    elements: CanvasElement[];
    appState: Record<string, unknown>;
  };
}

export function serializeCanvasContent(content: CanvasArtifactContent): string {
  return JSON.stringify(content);
}

export function parseCanvasContent(raw: string): CanvasArtifactContent | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    typeof obj !== "object" ||
    obj === null ||
    typeof (obj as { mermaidSource?: unknown }).mermaidSource !== "string"
  ) {
    return null;
  }
  return obj as CanvasArtifactContent;
}

export function needsCanvasConversion(content: CanvasArtifactContent): boolean {
  if (!content.scene) return true;
  return content.convertedFromMermaid !== content.mermaidSource;
}

export function tagAsMermaidSourced(elements: CanvasElement[]): CanvasElement[] {
  return elements.map((el) => ({
    ...el,
    customData: { ...(el.customData ?? {}), source: "mermaid" },
  }));
}

export function mergeCanvasElements(
  oldElements: CanvasElement[],
  freshMermaidElements: CanvasElement[],
): CanvasElement[] {
  const userDrawn = oldElements.filter((el) => el.customData?.source !== "mermaid");
  return [...tagAsMermaidSourced(freshMermaidElements), ...userDrawn];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/agent/canvas-content.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/canvas-content.ts src/lib/agent/canvas-content.test.ts
git commit -m "feat: add canvas artifact content model (parse/serialize/tag/merge)"
```

---

### Task 2: `canvas` artifact kind + mime type

**Files:**
- Modify: `src/lib/agent/types.ts:55`
- Modify: `src/lib/agent/tools/execute.ts:85-102`
- Test: `src/lib/agent/tools/execute.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ArtifactKind` now includes `"canvas"`; `mimeTypeForKind("canvas")` returns `"application/vnd.winlume.canvas+json; charset=utf-8"`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/agent/tools/execute.test.ts`, inside the existing `describe("mimeTypeForKind", ...)` block:

```ts
  it("maps canvas", () => {
    expect(mimeTypeForKind("canvas")).toContain("canvas");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agent/tools/execute.test.ts -t mimeTypeForKind`
Expected: FAIL — TypeScript error, `"canvas"` not assignable to `ArtifactKind`, or wrong mime string.

- [ ] **Step 3: Implement**

In `src/lib/agent/types.ts`, change line 55:

```ts
export type ArtifactKind = "markdown" | "html" | "text" | "json" | "image" | "binary" | "canvas";
```

In `src/lib/agent/tools/execute.ts`, add a case to `mimeTypeForKind` (before the `default`):

```ts
    case "canvas":
      return "application/vnd.winlume.canvas+json; charset=utf-8";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/agent/tools/execute.test.ts -t mimeTypeForKind`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/types.ts src/lib/agent/tools/execute.ts src/lib/agent/tools/execute.test.ts
git commit -m "feat: add canvas ArtifactKind and mime type"
```

---

### Task 3: `generate_canvas` tool schema

**Files:**
- Modify: `src/lib/agent/tools/definitions.ts`

**Interfaces:**
- Produces: `STUDIO_TOOLS` gains a `generate_canvas` entry; `StudioToolName` and `STUDIO_TOOL_NAMES` include `"generate_canvas"`.

- [ ] **Step 1: Modify `StudioToolName`** (line 5-10):

```ts
export type StudioToolName =
  | "todo_write"
  | "write_artifact"
  | "read_artifact"
  | "list_artifacts"
  | "generate_image"
  | "generate_canvas";
```

- [ ] **Step 2: Append to `STUDIO_TOOLS` array**, right after the `generate_image` entry (after line 186, before the closing `] as const;`):

```ts
  {
    type: "function" as const,
    function: {
      name: "generate_canvas",
      description:
        "Generate or update an editable infinite-canvas diagram (flowchart, mind map, sequence diagram, etc.) by writing Mermaid syntax. Returns immediately with a pending artifact id; the diagram renders in the artifact panel once client-side conversion finishes — do not wait for it or claim it is ready in this turn. Pass sourceArtifactId to update an existing canvas instead of creating a new one; when updating, read the injected structural summary of its current contents first so you don't ignore changes the user already made by hand.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Short human-readable title for the artifact",
          },
          mermaid: {
            type: "string",
            description: "Full Mermaid diagram definition (e.g. 'flowchart TD\\nA-->B')",
          },
          sourceArtifactId: {
            type: "string",
            description: "Existing canvas artifact id to update. Omit to create a new canvas.",
          },
        },
        required: ["name", "mermaid"],
        additionalProperties: false,
      },
    },
  },
```

- [ ] **Step 3: Update `STUDIO_TOOL_NAMES`** (bottom of file):

```ts
export const STUDIO_TOOL_NAMES: readonly StudioToolName[] = [
  "todo_write",
  "write_artifact",
  "read_artifact",
  "list_artifacts",
  "generate_image",
  "generate_canvas",
] as const;
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `definitions.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/definitions.ts
git commit -m "feat: add generate_canvas tool schema"
```

---

### Task 4: `executeGenerateCanvas`

**Files:**
- Modify: `src/lib/agent/tools/execute.ts`
- Test: `src/lib/agent/tools/execute.test.ts`

**Interfaces:**
- Consumes: `parseCanvasContent`, `serializeCanvasContent` from `@/lib/agent/canvas-content` (Task 1); `ToolExecuteContext`, `ToolExecuteResult`, `formatZodError`, `fail`, `mimeTypeForKind` (already in this file).
- Produces: `executeGenerateCanvas(rawArgs, ctx): Promise<ToolExecuteResult>`, wired into `executeStudioTool`'s switch under `"generate_canvas"`.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/agent/tools/execute.test.ts` (new `describe` block, using the same `setup()` helper already defined in the file):

```ts
import { parseCanvasContent } from "@/lib/agent/canvas-content";
// (add this import alongside the existing imports at the top of the file)

describe("executeGenerateCanvas", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  function setup() {
    const root = mkdtempSync(join(tmpdir(), "wl-canvas-"));
    dirs.push(root);
    const store = createWebFileStore(root);
    return {
      store,
      ctx: { userId: "u1", sessionId: "s1", artifacts: store.artifacts },
    };
  }

  it("creates a pending canvas artifact with the given mermaid source", async () => {
    const { ctx, store } = setup();
    const result = await executeStudioTool(
      "generate_canvas",
      JSON.stringify({ name: "上线流程", mermaid: "flowchart TD\nA-->B" }),
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(result.artifact?.kind).toBe("canvas");
    expect(result.artifact?.status).toBe("pending");

    const buf = await store.artifacts.readContent("u1", result.artifact!.id);
    const content = parseCanvasContent(buf!.toString("utf8"));
    expect(content?.mermaidSource).toBe("flowchart TD\nA-->B");
    expect(content?.scene).toBeUndefined();
  });

  it("rejects missing mermaid", async () => {
    const { ctx } = setup();
    const result = await executeStudioTool(
      "generate_canvas",
      JSON.stringify({ name: "空图" }),
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  it("updates an existing canvas, preserving its stored scene", async () => {
    const { ctx, store } = setup();
    const created = await executeStudioTool(
      "generate_canvas",
      JSON.stringify({ name: "v1", mermaid: "flowchart TD\nA-->B" }),
      ctx,
    );
    const id = created.artifact!.id;
    // Simulate the client having already converted + saved a scene.
    await store.artifacts.write(
      { ...created.artifact!, status: "ready" },
      JSON.stringify({
        mermaidSource: "flowchart TD\nA-->B",
        convertedFromMermaid: "flowchart TD\nA-->B",
        scene: { elements: [{ id: "n1" }], appState: {} },
      }),
    );

    const updated = await executeStudioTool(
      "generate_canvas",
      JSON.stringify({ name: "v2", mermaid: "flowchart TD\nA-->B-->C", sourceArtifactId: id }),
      ctx,
    );
    expect(updated.ok).toBe(true);
    expect(updated.artifact?.id).toBe(id);
    expect(updated.artifact?.name).toBe("v2");

    const buf = await store.artifacts.readContent("u1", id);
    const content = parseCanvasContent(buf!.toString("utf8"));
    expect(content?.mermaidSource).toBe("flowchart TD\nA-->B-->C");
    // Old scene preserved verbatim until the client reconverts.
    expect(content?.scene?.elements).toEqual([{ id: "n1" }]);
  });

  it("rejects sourceArtifactId pointing at a non-canvas artifact", async () => {
    const { ctx } = setup();
    const md = await executeWriteArtifact(
      { name: "doc", kind: "markdown", content: "hi" },
      ctx,
    );
    const result = await executeStudioTool(
      "generate_canvas",
      JSON.stringify({ name: "x", mermaid: "flowchart TD\nA-->B", sourceArtifactId: md.artifact!.id }),
      ctx,
    );
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/agent/tools/execute.test.ts -t executeGenerateCanvas`
Expected: FAIL — `Unknown tool: generate_canvas`

- [ ] **Step 3: Implement**

In `src/lib/agent/tools/execute.ts`, add near the top with the other imports:

```ts
import {
  parseCanvasContent,
  serializeCanvasContent,
  type CanvasArtifactContent,
} from "@/lib/agent/canvas-content";
```

Add the schema next to `generateImageSchema`:

```ts
const generateCanvasSchema = z.object({
  name: z.string().trim().min(1).max(200),
  mermaid: z.string().trim().min(1).max(20_000),
  sourceArtifactId: z.string().trim().min(1).max(128).optional(),
});

export type GenerateCanvasArgs = z.infer<typeof generateCanvasSchema>;
```

Add the executor function after `executeGenerateImage`:

```ts
export async function executeGenerateCanvas(
  rawArgs: unknown,
  ctx: ToolExecuteContext,
): Promise<ToolExecuteResult> {
  const parsed = generateCanvasSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return fail(`generate_canvas validation failed: ${formatZodError(parsed.error)}`);
  }
  const { name, mermaid, sourceArtifactId } = parsed.data;

  if (sourceArtifactId) {
    const existing = await ctx.artifacts.get(ctx.userId, sourceArtifactId);
    if (!existing) return fail(`Source artifact not found: ${sourceArtifactId}`);
    if (existing.kind !== "canvas") {
      return fail(`Source artifact is not a canvas: ${sourceArtifactId}`);
    }
    const existingBuf = await ctx.artifacts.readContent(ctx.userId, sourceArtifactId);
    const existingContent = existingBuf
      ? parseCanvasContent(existingBuf.toString("utf8"))
      : null;
    const content: CanvasArtifactContent = {
      mermaidSource: mermaid,
      ...(existingContent?.scene ? { scene: existingContent.scene } : {}),
      ...(existingContent?.convertedFromMermaid
        ? { convertedFromMermaid: existingContent.convertedFromMermaid }
        : {}),
    };
    try {
      const artifact = await ctx.artifacts.write(
        { ...existing, name, error: undefined },
        serializeCanvasContent(content),
      );
      return {
        ok: true,
        summary: `Updated canvas "${artifact.name}" (id=${artifact.id})`,
        content: JSON.stringify({ id: artifact.id, name: artifact.name, kind: artifact.kind }),
        artifact,
        events: [
          { type: "artifact", artifactId: artifact.id, name: artifact.name, kind: artifact.kind },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "generate_canvas failed";
      return fail(msg);
    }
  }

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const content: CanvasArtifactContent = { mermaidSource: mermaid };
  try {
    const artifact = await ctx.artifacts.write(
      {
        id,
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        ...(ctx.messageId ? { messageId: ctx.messageId } : {}),
        name,
        kind: "canvas",
        mimeType: mimeTypeForKind("canvas"),
        storageKey: "",
        status: "pending",
        createdAt,
      },
      serializeCanvasContent(content),
    );
    return {
      ok: true,
      summary: `Started canvas "${artifact.name}" (id=${artifact.id})`,
      content: JSON.stringify({ id: artifact.id, name: artifact.name, status: artifact.status }),
      artifact,
      events: [
        { type: "artifact", artifactId: artifact.id, name: artifact.name, kind: artifact.kind },
      ],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "generate_canvas failed";
    return fail(msg);
  }
}
```

Wire it into `executeStudioTool`'s switch (next to `case "generate_image":`):

```ts
    case "generate_canvas":
      return executeGenerateCanvas(rawArgs, ctx);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/agent/tools/execute.test.ts`
Expected: PASS (all tests in the file, including the 4 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/execute.ts src/lib/agent/tools/execute.test.ts
git commit -m "feat: implement executeGenerateCanvas (create + update)"
```

---

### Task 5: Structural summary for AI-aware regeneration

**Files:**
- Create: `src/lib/agent/canvas-summary.ts`
- Test: `src/lib/agent/canvas-summary.test.ts`

**Interfaces:**
- Consumes: `CanvasElement` from `@/lib/agent/canvas-content` (Task 1).
- Produces: `summarizeCanvasElements(elements: CanvasElement[]): string`.

This is a plain-text walk over elements — no Mermaid conversion, no dependency on any reverse-converter package (spec §5, §1).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/agent/canvas-summary.test.ts
import { describe, expect, it } from "vitest";
import { summarizeCanvasElements } from "./canvas-summary";
import type { CanvasElement } from "./canvas-content";

describe("summarizeCanvasElements", () => {
  it("returns a placeholder for an empty canvas", () => {
    expect(summarizeCanvasElements([])).toBe("(canvas is empty)");
  });

  it("lists text labels and shape counts", () => {
    const elements: CanvasElement[] = [
      { id: "1", type: "rectangle" },
      { id: "2", type: "text", text: "Deploy" },
      { id: "3", type: "text", text: "Review" },
      { id: "4", type: "arrow", startBinding: { elementId: "1" }, endBinding: { elementId: "2" } },
    ];
    const summary = summarizeCanvasElements(elements);
    expect(summary).toContain("Deploy");
    expect(summary).toContain("Review");
    expect(summary).toContain("1 rectangle");
    expect(summary).toContain("1 connection");
  });

  it("ignores user-drawn elements with no text or type info gracefully", () => {
    const elements: CanvasElement[] = [{ id: "freehand-1", type: "freedraw" }];
    expect(() => summarizeCanvasElements(elements)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/agent/canvas-summary.test.ts`
Expected: FAIL — `Cannot find module './canvas-summary'`

- [ ] **Step 3: Implement**

```ts
// src/lib/agent/canvas-summary.ts
import type { CanvasElement } from "@/lib/agent/canvas-content";

/**
 * Plain-text description of a canvas's current contents (labels, shape
 * counts, connections) for injection as model context — not a Mermaid
 * conversion. Lets the AI see manual edits before it regenerates.
 */
export function summarizeCanvasElements(elements: CanvasElement[]): string {
  if (elements.length === 0) return "(canvas is empty)";

  const labels: string[] = [];
  const shapeCounts = new Map<string, number>();
  let connections = 0;

  for (const el of elements) {
    const type = typeof el.type === "string" ? el.type : "shape";
    if (type === "arrow" || type === "line") {
      connections += 1;
      continue;
    }
    if (type === "text" && typeof el.text === "string" && el.text.trim()) {
      labels.push(el.text.trim());
      continue;
    }
    shapeCounts.set(type, (shapeCounts.get(type) ?? 0) + 1);
  }

  const lines: string[] = [];
  if (labels.length) lines.push(`Labels: ${labels.join(", ")}`);
  for (const [type, count] of shapeCounts) {
    lines.push(`${count} ${type}${count === 1 ? "" : "s"}`);
  }
  if (connections) lines.push(`${connections} connection${connections === 1 ? "" : "s"}`);

  return lines.join("; ") || "(canvas has elements with no readable content)";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/agent/canvas-summary.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/canvas-summary.ts src/lib/agent/canvas-summary.test.ts
git commit -m "feat: add canvas structural summary for AI-aware regeneration"
```

---

### Task 6: Wire `@`-reference and system prompt in `runtime.ts`

**Files:**
- Modify: `src/lib/agent/runtime.ts:41-62` (`BASE_POLICY`), `:281-299` (referenced-artifact handling)
- Test: `src/lib/agent/runtime.messages.test.ts` (existing file — add cases there; read it first to match its style before editing)

**Interfaces:**
- Consumes: `parseCanvasContent`, `summarizeCanvasElements` (Tasks 1, 5).
- Produces: `buildCanvasReferenceReminder(canvases: Artifact[], artifacts: ArtifactStore, userId: string): Promise<string>` (new, exported for testing).

- [ ] **Step 1: Read the existing test file's style**

Open `src/lib/agent/runtime.messages.test.ts` and note how it constructs a fake `ArtifactStore`/`SessionStore` (or a real file-backed one via `createWebFileStore`, matching Task 4's pattern) before adding new tests — reuse whichever helper it already has rather than inventing a second one.

- [ ] **Step 2: Write the failing test**

Add to `src/lib/agent/runtime.messages.test.ts` (adapt the store-construction lines to match whatever helper the file already uses — if it uses `createWebFileStore` like `execute.test.ts`, follow that pattern):

```ts
import { buildCanvasReferenceReminder } from "./runtime";
import { serializeCanvasContent } from "@/lib/agent/canvas-content";

describe("buildCanvasReferenceReminder", () => {
  it("returns empty string for no canvases", async () => {
    const { store } = setup(); // reuse this file's existing store helper
    const text = await buildCanvasReferenceReminder([], store.artifacts, "u1");
    expect(text).toBe("");
  });

  it("includes id, name, and a structural summary for each canvas", async () => {
    const { store } = setup();
    const artifact = await store.artifacts.write(
      {
        id: "canvas-1",
        userId: "u1",
        sessionId: "s1",
        name: "上线流程",
        kind: "canvas",
        mimeType: "application/vnd.winlume.canvas+json",
        storageKey: "",
        status: "ready",
        createdAt: new Date().toISOString(),
      },
      serializeCanvasContent({
        mermaidSource: "flowchart TD\nA-->B",
        convertedFromMermaid: "flowchart TD\nA-->B",
        scene: {
          elements: [{ id: "1", type: "text", text: "上线" }],
          appState: {},
        },
      }),
    );
    const text = await buildCanvasReferenceReminder([artifact], store.artifacts, "u1");
    expect(text).toContain("canvas-1");
    expect(text).toContain("上线流程");
    expect(text).toContain("上线"); // from the structural summary
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/agent/runtime.messages.test.ts -t buildCanvasReferenceReminder`
Expected: FAIL — `buildCanvasReferenceReminder is not exported`

- [ ] **Step 4: Implement**

In `src/lib/agent/runtime.ts`, add imports:

```ts
import { parseCanvasContent } from "@/lib/agent/canvas-content";
import { summarizeCanvasElements } from "@/lib/agent/canvas-summary";
```

Add the new function near `buildReferencedArtifactsReminder` (after it):

```ts
/** Structural-summary reminder for @-referenced canvas artifacts (spec §5). */
export async function buildCanvasReferenceReminder(
  canvases: Artifact[],
  artifacts: ArtifactStore,
  userId: string,
): Promise<string> {
  if (!canvases.length) return "";
  const lines: string[] = [];
  for (const c of canvases) {
    const buf = await artifacts.readContent(userId, c.id);
    const content = buf ? parseCanvasContent(buf.toString("utf8")) : null;
    const summary = content?.scene
      ? summarizeCanvasElements(content.scene.elements)
      : "(not yet converted from Mermaid)";
    lines.push(`@${c.name} → id=${c.id}: ${summary}`);
  }
  return [
    "<system-reminder>",
    "The user @-mentioned canvas artifact(s). Their CURRENT contents (after any manual user edits) are summarized below — read this before deciding what new Mermaid to write, so you don't ignore changes the user already made by hand.",
    ...lines,
    "To update one of these, call generate_canvas with sourceArtifactId set to its id.",
    "</system-reminder>",
  ].join("\n");
}
```

Update the referenced-artifact loop (around line 286-297) to also collect canvas artifacts and merge in the new reminder:

```ts
  const referencedArtifacts: Artifact[] = [];
  for (const id of uniqueIds) {
    try {
      const found = await artifacts.get(userId, id);
      if (found && (found.kind === "image" || found.kind === "canvas") && found.status !== "failed") {
        referencedArtifacts.push(found);
      }
    } catch {
      /* ignore invalid id */
    }
  }
  const referencedImages = referencedArtifacts.filter((a) => a.kind === "image");
  const referencedCanvases = referencedArtifacts.filter((a) => a.kind === "canvas");
  const artifactReminder = buildReferencedArtifactsReminder(referencedImages);
  const canvasReminder = await buildCanvasReferenceReminder(referencedCanvases, artifacts, userId);

  const combinedReminder = [reminder, artifactReminder, canvasReminder]
    .filter(Boolean)
    .join("\n\n");
```

Add one sentence to `BASE_POLICY` (after the existing `generate_image` line, around line 48):

```ts
  "Call generate_canvas when the user asks for a flowchart, mind map, sequence diagram, or other diagram they can then edit by hand. Author it as Mermaid syntax in the mermaid field — do not try to produce raw shape coordinates yourself. It returns immediately with a pending artifact; do not claim it is ready yet. To revise a canvas the user already has, set sourceArtifactId and read the injected structural summary of its current contents first.",
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/agent/runtime.messages.test.ts`
Expected: PASS (all tests in the file, including the 2 new ones)

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/runtime.ts src/lib/agent/runtime.messages.test.ts
git commit -m "feat: inject canvas structural summary for @-referenced canvases"
```

---

### Task 7: `PUT /api/artifacts/[id]` auto-save endpoint

**Files:**
- Modify: `src/app/api/artifacts/[id]/route.ts`

**Interfaces:**
- Consumes: `parseCanvasContent` (Task 1), `getCurrentUserId`, `webStore` (already imported in this file).
- Produces: `PUT` handler accepting either `{ content: string }` (successful save — `content` is a serialized `CanvasArtifactContent`) or `{ status: "failed"; error: string }` (client-side Mermaid conversion failed and wants that recorded, per spec §6's `failed` render state — without this second shape, `ArtifactPreview.tsx`'s canvas `status === "failed"` branch, added in Task 9, could never actually be reached from a real conversion failure).

This route has no existing automated test coverage in the repo (`route.ts` files aren't unit-tested here — see `src/app/api/artifacts/`, no sibling `.test.ts`). Follow that convention: implement directly, verify manually per Step 3.

- [ ] **Step 1: Implement**

Add to `src/app/api/artifacts/[id]/route.ts` (after the existing `GET`):

```ts
import { parseCanvasContent } from "@/lib/agent/canvas-content";

/**
 * PUT /api/artifacts/[id] — auto-save endpoint for canvas artifacts only.
 * Body is either { content: string } (a serialized CanvasArtifactContent,
 * on successful client-side conversion/edit) or { status: "failed", error }
 * (client-side Mermaid conversion threw and wants that recorded).
 */
export async function PUT(request: NextRequest, context: IdContext) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Missing artifact id" }, { status: 400 });
  }

  const existing = await webStore.artifacts.get(userId, id);
  if (!existing) {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }
  if (existing.kind !== "canvas") {
    return NextResponse.json(
      { error: "Only canvas artifacts can be updated via this endpoint" },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if ((body as { status?: unknown }).status === "failed") {
    const errorMessage = (body as { error?: unknown }).error;
    if (typeof errorMessage !== "string" || !errorMessage.trim()) {
      return NextResponse.json({ error: "Missing error message" }, { status: 400 });
    }
    const currentBuf = await webStore.artifacts.readContent(userId, id);
    const updated = await webStore.artifacts.write(
      { ...existing, status: "failed", error: errorMessage },
      currentBuf ?? Buffer.alloc(0),
    );
    return NextResponse.json({ artifact: updated });
  }

  const rawContent = (body as { content?: unknown }).content;
  if (typeof rawContent !== "string" || !parseCanvasContent(rawContent)) {
    return NextResponse.json({ error: "Invalid canvas content" }, { status: 400 });
  }

  const updated = await webStore.artifacts.write(
    { ...existing, status: "ready", error: undefined },
    rawContent,
  );
  return NextResponse.json({ artifact: updated });
}
```

- [ ] **Step 2: Manual verification**

Run the dev server and, while logged in, create a canvas artifact via chat (this needs Task 9 done too to fully exercise it — if Task 9 isn't done yet, verify with `curl` directly instead):

```bash
curl -X PUT http://localhost:3000/api/artifacts/<id> \
  -H "content-type: application/json" \
  -H "cookie: <your session cookie>" \
  -d '{"content":"{\"mermaidSource\":\"flowchart TD\\nA-->B\",\"convertedFromMermaid\":\"flowchart TD\\nA-->B\",\"scene\":{\"elements\":[],\"appState\":{}}}"}'
```

Expected: `200` with `{ "artifact": { ..., "status": "ready" } }`; a second `GET /api/artifacts/<id>` returns the same content back.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/artifacts/[id]/route.ts
git commit -m "feat: add PUT /api/artifacts/[id] auto-save endpoint for canvas artifacts"
```

---

### Task 8: Client-side Mermaid→Excalidraw conversion module

**Files:**
- Install: `@excalidraw/excalidraw`, `@excalidraw/mermaid-to-excalidraw`
- Create: `src/lib/studio/canvas-convert.ts`
- Test: `src/lib/studio/canvas-convert.test.ts`

**Interfaces:**
- Consumes: `CanvasElement`, `tagAsMermaidSourced`, `mergeCanvasElements` from `@/lib/agent/canvas-content` (Task 1).
- Produces: `convertMermaidToCanvasElements(mermaid: string): Promise<CanvasElement[]>` (DOM-dependent, calls the mermaid-to-excalidraw package — not unit-tested directly), `buildUpdatedScene(oldElements: CanvasElement[], freshMermaidElements: CanvasElement[]): CanvasElement[]` (pure, re-exports `mergeCanvasElements` under a name specific to this module's call sites — kept here so `ArtifactPreview.tsx` only imports from one place for anything canvas-conversion-related).

- [ ] **Step 1: Install dependencies**

```bash
npm install @excalidraw/excalidraw @excalidraw/mermaid-to-excalidraw
```

Expected: `package.json` `dependencies` gains both entries; no peer-dependency errors for React 19 (Excalidraw supports React 18+; if npm reports an ERESOLVE conflict, re-run with `--legacy-peer-deps` and note it in the commit message).

- [ ] **Step 2: Write the failing test** (for the pure re-export only — the DOM-dependent function is verified manually in Task 9)

```ts
// src/lib/studio/canvas-convert.test.ts
import { describe, expect, it } from "vitest";
import { buildUpdatedScene } from "./canvas-convert";

describe("buildUpdatedScene", () => {
  it("merges fresh mermaid elements with preserved user-drawn ones", () => {
    const old = [{ id: "user-1" }];
    const fresh = [{ id: "node-1" }];
    const merged = buildUpdatedScene(old, fresh);
    expect(merged).toContainEqual({ id: "user-1" });
    expect(merged).toContainEqual({ id: "node-1", customData: { source: "mermaid" } });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/studio/canvas-convert.test.ts`
Expected: FAIL — `Cannot find module './canvas-convert'`

- [ ] **Step 4: Implement**

```ts
// src/lib/studio/canvas-convert.ts
"use client";

import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import {
  mergeCanvasElements,
  type CanvasElement,
} from "@/lib/agent/canvas-content";

/**
 * Runs the DOM-dependent Mermaid→Excalidraw conversion. Must only be called
 * in the browser (see design spec §4) — this module is marked "use client".
 */
export async function convertMermaidToCanvasElements(
  mermaid: string,
): Promise<CanvasElement[]> {
  const { elements: skeletonElements } = await parseMermaidToExcalidraw(mermaid);
  const elements = convertToExcalidrawElements(skeletonElements);
  return elements as unknown as CanvasElement[];
}

/** Pure merge step, re-exported here so callers only import from one module. */
export function buildUpdatedScene(
  oldElements: CanvasElement[],
  freshMermaidElements: CanvasElement[],
): CanvasElement[] {
  return mergeCanvasElements(oldElements, freshMermaidElements);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/studio/canvas-convert.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/studio/canvas-convert.ts src/lib/studio/canvas-convert.test.ts
git commit -m "feat: add client-side Mermaid-to-Excalidraw conversion module"
```

---

### Task 9: `ArtifactPreview.tsx` canvas render branch

**Files:**
- Modify: `src/components/studio/ArtifactPreview.tsx`
- Modify: `src/app/studio/layout.tsx`

**Interfaces:**
- Consumes: `convertMermaidToCanvasElements`, `buildUpdatedScene` (Task 8); `parseCanvasContent`, `serializeCanvasContent`, `needsCanvasConversion` (Task 1).
- No new exports consumed by later tasks — this is a leaf UI task. Verified manually (real DOM/canvas required; not unit-testable in this repo's vitest setup, which has no jsdom canvas mocking — confirm by checking `vitest.config.ts`/`vite.config.ts` for an `environment` setting before assuming otherwise).

- [ ] **Step 1: Import Excalidraw CSS once**

In `src/app/studio/layout.tsx`, add near the top:

```ts
import "@excalidraw/excalidraw/index.css";
```

- [ ] **Step 2: Add the `canvas` KIND_LABELS entry**

In `src/components/studio/ArtifactPreview.tsx`, update `KIND_LABELS` (line 49-56):

```ts
const KIND_LABELS: Record<ArtifactKind, string> = {
  markdown: "Markdown",
  html: "HTML",
  text: "文本",
  json: "JSON",
  image: "图片",
  binary: "二进制",
  canvas: "画布",
};
```

- [ ] **Step 3: Add a `CanvasBody` component**

Add these imports at the top of the file, alongside the existing ones (line 33-47):

```ts
import dynamic from "next/dynamic";
import {
  parseCanvasContent,
  serializeCanvasContent,
  needsCanvasConversion,
  type CanvasArtifactContent,
  type CanvasElement,
} from "@/lib/agent/canvas-content";
import {
  convertMermaidToCanvasElements,
  buildUpdatedScene,
} from "@/lib/studio/canvas-convert";
```

Add near `HtmlBody` (after it, before `TextBody`):

```tsx
// Excalidraw touches window/document at import time — load client-only.
const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((m) => m.Excalidraw),
  { ssr: false },
);

function CanvasBody({
  artifactId,
  content,
}: {
  artifactId: string;
  content: string;
}) {
  const [parsed, setParsed] = useState<CanvasArtifactContent | null>(() =>
    parseCanvasContent(content),
  );
  const [convertError, setConvertError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setParsed(parseCanvasContent(content));
    setConvertError(null);
  }, [content, artifactId]);

  useEffect(() => {
    if (!parsed || !needsCanvasConversion(parsed)) return;
    let cancelled = false;
    (async () => {
      try {
        const fresh = await convertMermaidToCanvasElements(parsed.mermaidSource);
        if (cancelled) return;
        const merged = buildUpdatedScene(parsed.scene?.elements ?? [], fresh);
        const next: CanvasArtifactContent = {
          mermaidSource: parsed.mermaidSource,
          convertedFromMermaid: parsed.mermaidSource,
          scene: { elements: merged, appState: parsed.scene?.appState ?? {} },
        };
        await fetch(`/api/artifacts/${artifactId}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ content: serializeCanvasContent(next) }),
        });
        if (!cancelled) setParsed(next);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Mermaid 解析失败";
        if (!cancelled) setConvertError(message);
        // Best-effort: persist the failure so a page reload still shows it
        // (spec §6's "failed" state) instead of spinning on "画布生成中…" forever.
        void fetch(`/api/artifacts/${artifactId}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ status: "failed", error: message }),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [parsed, artifactId]);

  const handleChange = useCallback(
    (elements: readonly CanvasElement[], appState: Record<string, unknown>) => {
      if (!parsed) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const next: CanvasArtifactContent = {
          ...parsed,
          scene: { elements: [...elements], appState },
        };
        void fetch(`/api/artifacts/${artifactId}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ content: serializeCanvasContent(next) }),
        });
      }, 800);
    },
    [parsed, artifactId],
  );

  if (convertError) {
    return (
      <div className="px-4 py-6">
        <RetryableError message={`图表生成失败：${convertError}`} />
      </div>
    );
  }

  if (!parsed?.scene) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-sm text-ink-400">
        <LoaderCircle className="h-5 w-5 animate-spin" />
        画布生成中…
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1" style={{ height: "100%" }}>
      <Excalidraw
        initialData={{ elements: parsed.scene.elements as never[], appState: parsed.scene.appState }}
        onChange={handleChange}
      />
    </div>
  );
}
```

Note: `initialData.elements` is cast `as never[]` because Excalidraw's own `ExcalidrawElement` type (from the installed package) is stricter than our minimal structural `CanvasElement` — check the actual type the installed `@excalidraw/excalidraw` version exports (`import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types"` in most current versions) and use a proper cast through that type instead of `never[]` if it resolves cleanly; `never[]` is a safe fallback if the exact type path differs by version.

- [ ] **Step 4: Wire the `canvas` case into `renderPreview`**

In `renderPreview` (around line 279-327), add a case before `case "binary":`:

```ts
    case "canvas":
      if (artifact.status === "failed") {
        return (
          <div className="px-4 py-6">
            <RetryableError
              message={`生成失败${artifact.error ? `：${artifact.error}` : ""}`}
              onRetry={retry?.onRetry}
              retrying={retry?.retrying}
            />
          </div>
        );
      }
      return <CanvasBody artifactId={artifact.id} content={content} />;
```

Also update the call site that builds the `retry` object passed into `renderPreview` (around what is currently line 1114-1123, the `onRetry` block guarded by `artifact.kind === "image"`) to also cover canvas, since `handleRetryGeneration` already just re-invokes `onRetryGeneration(artifact.messageId)` generically and doesn't assume image-specific behavior:

```ts
              onRetry:
                (artifact.kind === "image" || artifact.kind === "canvas") &&
                artifact.status === "failed" &&
                artifact.messageId &&
                onRetryGeneration
                  ? () => void handleRetryGeneration()
                  : undefined,
```

- [ ] **Step 5: Exclude `canvas` from text-only affordances**

Update `canShowSource` (line 487-492) and `hasPreview` (line 494-501) — both already default to excluding unlisted kinds via their explicit allow-lists, so `canvas` is automatically excluded; no change needed there. Update `mimeFor`/`extensionFor`/`handleDownload` to not attempt a text blob download for `canvas` — add an early branch in `handleDownload` (in the `useCallback`, right after the existing `artifact.kind === "image"` branch):

```ts
    if (artifact.kind === "canvas") {
      // Excalidraw's own export (PNG/SVG) is a follow-up; for now, download the raw scene JSON.
      if (content == null) return;
      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${artifact.name}.excalidraw.json`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
```

- [ ] **Step 6: Manual verification**

Start the dev server and open a Studio session:

```bash
npm run dev
```

In the chat, send a message that should trigger `generate_canvas` (e.g. "画一个用户注册流程图"). Confirm in the browser:
1. A new artifact appears in the panel with a "画布生成中…" spinner.
2. Within a few seconds it renders an editable Excalidraw canvas showing the flowchart.
3. Manually drag a node or add a shape; wait ~1s; refresh the page; confirm the manual edit persisted (auto-save round-tripped through the new `PUT` route).
4. Ask the AI to "帮我在这个流程图后面加一步" (referencing the same canvas) and confirm the regenerated diagram keeps your manually-added shape from step 3.
5. Trigger a conversion failure deliberately (e.g. temporarily have the model — or a manual `generate_canvas` test call — pass malformed Mermaid such as `"not mermaid syntax {{"`) and confirm the panel shows the failed state with a retry button instead of spinning forever; reload the page and confirm the failed state persists (proves the `PUT { status: "failed" }` path from Task 7 actually landed).

- [ ] **Step 7: Commit**

```bash
git add src/components/studio/ArtifactPreview.tsx src/app/studio/layout.tsx
git commit -m "feat: render and auto-save canvas artifacts with Excalidraw"
```

---

### Task 10: Extend `@`-mention picker to canvas artifacts

**Files:**
- Modify: `src/lib/studio/image-mentions.ts`
- Modify: `src/components/studio/Composer.tsx`
- Test: existing tests for `image-mentions.ts`, if any (`find src/lib/studio -name "image-mentions.test.ts"`) — extend them; otherwise skip a new test file here since this task only loosens existing filters (mechanical change, covered by Task 9's manual verification step 4 exercising the same @-reference path end-to-end).

**Interfaces:**
- Consumes: nothing new.
- Produces: `buildMentionCandidates`, `resolveReferencedArtifactIds` (in `image-mentions.ts`) now accept `canvas` artifacts, not just `image`.

- [ ] **Step 1: Check for an existing test file**

```bash
ls src/lib/studio/image-mentions.test.ts 2>/dev/null || echo "no test file"
```

If it exists, read it fully before editing so the loosened filter doesn't break an assertion that currently checks "non-image kinds are excluded" — update that assertion to say "non-image, non-canvas kinds are excluded" instead of deleting it.

- [ ] **Step 2: Loosen the kind filters**

In `src/lib/studio/image-mentions.ts`, change every `a.kind !== "image"` / `a.kind === "image"` guard that filters the candidate list to also allow `"canvas"`. Concretely:

Line 63 (`buildMentionCandidates`):

```ts
  for (const a of artifacts) {
    if (a.kind !== "image" && a.kind !== "canvas") continue;
    if (a.status === "failed") continue;
    if (seenArtifact.has(a.id)) continue;
```

Line 139 (`resolveReferencedArtifactIds`):

```ts
  for (const a of artifacts) {
    if ((a.kind === "image" || a.kind === "canvas") && a.status !== "failed" && !byName.has(a.name)) {
      byName.set(a.name, a.id);
    }
  }
```

- [ ] **Step 3: Pass canvas artifacts into the `imageArtifacts` prop**

Find where `imageArtifacts` is populated for the `Composer` (search `grep -rn "imageArtifacts=" src/components/studio src/app/studio`) and widen its filter from `kind === "image"` to `kind === "image" || kind === "canvas"`. The prop name stays `imageArtifacts` for this iteration (renaming it is a larger, unrelated refactor — out of scope here); add a one-line comment at its declaration in `Composer.tsx` noting it now also carries canvas artifacts, so a future reader isn't misled by the name.

- [ ] **Step 4: Manual verification**

In the running dev server, type `@` in the composer after a canvas artifact exists in the session; confirm it appears in the mention picker alongside any image artifacts, and selecting it lets a follow-up message reference it (exercised already by Task 9 Step 6.4, which depends on this task).

- [ ] **Step 5: Commit**

```bash
git add src/lib/studio/image-mentions.ts src/components/studio/Composer.tsx
git commit -m "feat: allow @-mentioning canvas artifacts alongside images"
```
