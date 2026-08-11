# Studio Canvas Artifact Design

**Date:** 2026-07-29
**Status:** Proposed — user-approved design, pending written-spec review
**Scope:** Chat-driven infinite-canvas diagram generation and manual editing, surfaced through the Studio artifact pipeline as a new `canvas` artifact kind.

## 1. Background

The artifact runtime already supports `markdown | html | text | json | image | binary` kinds (`src/lib/agent/types.ts`), each with a dedicated render branch in `ArtifactPreview.tsx`. This design adds `canvas`: an infinite-canvas diagram (flowchart, mind map, sequence diagram, etc.) that the AI generates from a conversation and the user can then freely edit — draw, annotate, rearrange — with changes auto-saved.

Two library options were evaluated:

- **tldraw** — commercial SDK. Production use requires either a "made with tldraw" watermark (hobby license) or a paid commercial license (no public pricing). Rejected on licensing cost/uncertainty grounds.
- **Excalidraw** — MIT licensed, free, no watermark. Selected. Excalidraw is a general-purpose whiteboard (freehand drawing, shapes, text, arrows all built in); the design below only concerns how *AI-generated* content gets onto that whiteboard, not the editor's native capabilities, which need no additional work.

The AI-generation path is Mermaid text → `@excalidraw/mermaid-to-excalidraw` (official Excalidraw-maintained package) → Excalidraw elements. This was chosen over having the model emit raw Excalidraw element JSON directly, because Mermaid gives the model a compact, well-understood structural language and offloads layout/coordinate computation to a mature converter, rather than asking an LLM to reason about raw canvas coordinates.

A reverse converter (`@excalidraw-to-mermaid/core`) exists but is community-maintained, last published over two years ago, and the official Excalidraw repo has an open, unresolved feature request for this exact capability (issue #11187). It is not relied upon anywhere in this design.

## 2. Trigger Model

Same pattern as `generate_image`: the agent calls a new `generate_canvas` tool mid-conversation. No separate "canvas mode" screen.

```ts
{
  name: "generate_canvas",
  parameters: {
    name: string;              // artifact title
    mermaid: string;           // Mermaid diagram definition authored by the model
    sourceArtifactId?: string; // present → update an existing canvas artifact; absent → create new
  }
}
```

`sourceArtifactId` is the single switch between create and update, mirroring `generate_image`'s `sourceArtifactId` convention.

The existing "@" artifact-reference picker in the composer (built for image-to-image reference, `referencedArtifactId`) is extended to also list `canvas` artifacts. Referencing a canvas artifact behaves differently from referencing an image, and that difference matters:

- **Image reference:** the server injects a short system-context line naming the artifact and its id. The model does not need to "see" the image's content to decide how to edit it.
- **Canvas reference:** the model needs to know what the current diagram actually contains before deciding what new Mermaid to write, otherwise a manual edit the user just made (a renamed node, an added box) is invisible to the next AI edit. So `runAgentTurn` additionally computes a **structural summary** of the referenced canvas's current scene (see §5) and injects that summary as context alongside the artifact name/id.

## 3. Data Model

`Artifact.kind` gains `"canvas"`. Its `content` is a JSON envelope, not raw Mermaid and not a raw Excalidraw scene alone — both are kept, for different reasons:

```ts
interface CanvasArtifactContent {
  mermaidSource: string;   // the model's most recent authored Mermaid text
  scene?: {                // absent while status is "pending" and conversion hasn't run yet
    elements: ExcalidrawElement[]; // what is actually rendered and edited
    appState: Record<string, unknown>;
  };
}
```

- `scene` is the single source of visual truth: it's what `<Excalidraw>` renders, what auto-save writes, what the user directly manipulates.
- `mermaidSource` is kept only as the model's authoring record; it is never rendered directly and is not treated as authoritative once the user has edited `scene`.

Elements produced by the Mermaid→Excalidraw conversion are tagged `customData: { source: "mermaid" }`. Elements the user draws or adds by hand in the Excalidraw editor carry no such tag. This tag is the mechanism for merging AI regeneration with user edits (§4).

`mimeType` for `canvas` artifacts: `application/vnd.reizo.canvas+json`.

## 4. Conversion & Regeneration Flow

`@excalidraw/mermaid-to-excalidraw` depends on browser DOM APIs and cannot run in the Node server process. Conversion therefore happens client-side, not in the tool execution step.

**Create (no `sourceArtifactId`):**

1. `executeGenerateCanvas` immediately writes a `status: "pending"` artifact with `content.mermaidSource` set to the model's Mermaid text and `content.scene` empty, and returns the artifact id. The tool call returns right away; the agent finishes its turn without blocking on conversion.
2. When `ArtifactPreview` renders this artifact and finds `status: "pending"` with no `scene`, it runs `parseMermaidToExcalidraw` + `convertToExcalidrawElements` in-browser, tags the resulting elements `customData.source = "mermaid"`, and PUTs the resulting `scene` back to the artifact, flipping `status` to `"ready"`.

**Update (`sourceArtifactId` present):**

1. Same tool writes the new `mermaidSource` onto the existing artifact (status stays `"ready"`; no pending flicker needed since the old scene still renders until the update lands) and returns.
2. Client re-runs the conversion on the new Mermaid text, producing a fresh set of `mermaid`-tagged elements.
3. Client merges: all elements in the *old* scene that carry no `mermaid` tag (i.e., user hand-drawn additions) are carried over unchanged into the *new* scene; all `mermaid`-tagged elements are replaced wholesale by the freshly converted set.
4. Client PUTs the merged scene back.

**Auto-save (manual editing):**

`<Excalidraw>`'s `onChange` is debounced (~800ms of inactivity) and PUTs the current `scene` back to the same artifact, `mermaidSource` untouched. No new endpoint — reuses the existing artifact write path.

**Accepted trade-off:** because conversion is client-driven, a `canvas` artifact can sit in `status: "pending"` indefinitely if the user never opens it after the tool call returns — unlike `generate_image`, there is no server-side background job that completes regardless of client presence. This is accepted because a canvas artifact that's never opened has no user waiting on it either.

## 5. Structural Summary (for AI-aware regeneration)

To satisfy "AI must see what the user changed, not blindly overwrite," `runAgentTurn` computes a plain-text structural summary of a referenced canvas's current `scene` before the model decides what to write in its next `generate_canvas` call. This is a straightforward walk over `scene.elements` (shape type, text labels, binding/arrow connections) — not a Mermaid conversion, and not dependent on the abandoned reverse-converter package. The summary is injected as system context alongside the referenced artifact's name/id (same injection point as the existing image `referencedArtifactId` context line).

This gives the model visibility into content-level user changes (renamed labels, added nodes, changed connections) before it regenerates. It does **not** preserve the exact on-canvas position of a manually-nudged AI-generated node — Mermaid's layout algorithm recomputes coordinates for every `mermaid`-tagged element on regeneration — but it does preserve the element's content and, per §4, never touches or deletes anything the user drew by hand.

## 6. Frontend Rendering

`ArtifactPreview.tsx` gains a `canvas` branch alongside `image`/`html`:

- `status: "pending"` → the same generating skeleton used for pending images.
- `status: "ready"` → mounts `<Excalidraw initialData={scene} onChange={debouncedAutoSave}>`.
- `status: "failed"` (Mermaid parse error during client-side conversion) → stored error message rendered with a retry affordance that re-invokes `generate_canvas` with the same arguments, same pattern as failed image generation.
- `mimeTypeForKind`, `handleDownload`, `extensionFor` gain a `canvas` branch; download exports via Excalidraw's built-in PNG/SVG export rather than serializing the raw JSON envelope.

## 7. Out of Scope (this iteration)

- **Real-time concurrent AI+user editing** (both operating on the same canvas simultaneously). This requires a genuine sync/CRDT layer and a still-immature model for how an LLM participates in fine-grained concurrent editing; it is a separate infrastructure investment warranting its own design, not bundled here.
- **Server-side headless-browser conversion** (Puppeteer/Playwright). Rejected as heavyweight for a single-VM, single-process deployment; conversion stays client-driven (§4).
- **Exact positional fidelity of AI-owned elements across regeneration.** Content is preserved via the structural summary and element tagging; precise manual coordinate tweaks to `mermaid`-tagged elements are not.
- **Reverse Mermaid conversion** (`@excalidraw-to-mermaid/core`). Confirmed abandoned; not a dependency anywhere in this design.
- **Per-call model/parameter picker UI.** Consistent with the image-generation design, no per-request configuration surface for this iteration.

## 8. Decisions

| Topic | Decision |
|---|---|
| Canvas library | Excalidraw (MIT, free, no watermark) over tldraw (commercial license/watermark required) |
| AI authoring format | Mermaid text, converted via official `@excalidraw/mermaid-to-excalidraw`, not raw Excalidraw JSON authored by the model |
| Editability | Turn-based (user edits between AI turns), not real-time concurrent AI+user editing |
| Persistence | Auto-save on debounced `onChange`, no explicit "save" button |
| Where conversion runs | Client (browser DOM dependency), not server — accepted trade-off: pending state depends on the artifact being opened |
| Data model | Both `mermaidSource` (AI authoring record) and `scene` (rendered/edited truth) stored; `scene` is authoritative once edited |
| AI regeneration vs. user edits | Element-level tagging (`customData.source: "mermaid"`) — AI regeneration replaces only tagged elements, always preserves untagged (user-drawn) elements |
| AI awareness of current state | A hand-rolled structural summary of current scene elements, injected as context — not a reverse-Mermaid conversion |
| Trigger | Agent tool call (`generate_canvas`), extending the existing "@" artifact-reference picker to canvas artifacts |
