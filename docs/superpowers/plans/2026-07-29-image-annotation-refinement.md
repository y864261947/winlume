# Image Annotation Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Studio user mark a generated image, describe a local change, and create a new image Artifact through the existing multi-source image-edit flow.

**Architecture:** A pure annotation utility owns normalized marks, prompt serialization, and canvas compositing. A hidden user-scoped annotation Artifact stores the marked PNG; the Studio session passes the visible base image id first and annotation id second through `referencedArtifactIds`. A preview overlay collects point, box, and pen marks without React state changes on pointer movement.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Canvas 2D, Lucide, Tailwind 4, Vitest.

---

## File structure

- Create `src/lib/studio/image-annotations.ts` and `src/lib/studio/image-annotations.test.ts`: normalized geometry, prompt composition, canvas output, unit tests.
- Create `src/components/studio/ImageAnnotationOverlay.tsx`: full-screen marking UI.
- Modify `src/lib/agent/types.ts`, `src/app/api/artifacts/upload-image/route.ts`, `src/app/api/artifacts/route.ts`, `src/lib/studio/api.ts`, and `src/lib/host/web/file-store.test.ts`: hidden annotation persistence.
- Modify `src/lib/agent/runtime.ts` and `src/lib/agent/runtime.messages.test.ts`: identify base vs. marked reference to the agent.
- Modify `src/components/studio/ArtifactPreview.tsx`, `src/app/studio/c/[sessionId]/page.tsx`, and `src/app/globals.css`: upload/send integration and motion.

### Task 1: Create the annotation domain utility

**Files:**
- Create: `src/lib/studio/image-annotations.ts`
- Test: `src/lib/studio/image-annotations.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  annotationBounds,
  buildImageRefinementInstruction,
  normalizeAnnotationPoint,
} from "./image-annotations";

describe("image annotations", () => {
  it("clamps preview coordinates to normalized image coordinates", () => {
    expect(normalizeAnnotationPoint({ x: 70, y: 50 }, { left: 10, top: 10, width: 120, height: 80 }))
      .toEqual({ x: 0.5, y: 0.5 });
    expect(normalizeAnnotationPoint({ x: -10, y: 110 }, { left: 0, top: 0, width: 100, height: 100 }))
      .toEqual({ x: 0, y: 1 });
  });

  it("serializes base-first refinement instructions", () => {
    expect(buildImageRefinementInstruction({
      baseArtifactId: "base", annotationArtifactId: "marked", request: "把这里改成蓝色",
      marks: [{ id: "m1", kind: "box", points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.6 }] }],
    })).toContain("sourceArtifactIds must be [base, marked]");
  });

  it("returns the union bound for marks", () => {
    expect(annotationBounds([
      { id: "p", kind: "point", points: [{ x: 0.2, y: 0.4 }] },
      { id: "s", kind: "pen", points: [{ x: 0.5, y: 0.5 }, { x: 0.9, y: 0.7 }] },
    ])).toEqual({ x: 0.2, y: 0.4, width: 0.7, height: 0.3 });
  });
});
```

- [ ] **Step 2: Confirm it fails**

Run: `npm test -- src/lib/studio/image-annotations.test.ts`

Expected: FAIL because `./image-annotations` does not exist.

- [ ] **Step 3: Implement exact exported contracts**

```ts
export type AnnotationPoint = { x: number; y: number };
export type AnnotationMarkKind = "point" | "box" | "pen";
export type ImageAnnotationMark = { id: string; kind: AnnotationMarkKind; points: AnnotationPoint[] };
export type ImageBounds = { left: number; top: number; width: number; height: number };
export function normalizeAnnotationPoint(point: { x: number; y: number }, bounds: ImageBounds): AnnotationPoint;
export function annotationBounds(marks: readonly ImageAnnotationMark[]): { x: number; y: number; width: number; height: number } | null;
export function buildImageRefinementInstruction(input: { baseArtifactId: string; annotationArtifactId: string; request: string; marks: readonly ImageAnnotationMark[] }): string;
```

Clamp geometry and round serialized values to four decimals. The instruction must name the clean base and marked reference, state `sourceArtifactIds must be [base, marked]`, forbid leaving marks in output, and limit changes to marked regions unless the user request requires more.

- [ ] **Step 4: Implement Canvas helpers**

Export `drawImageAnnotationMarks(ctx, marks, width, height)` and `compositeImageAnnotation(image, marks): Promise<string>`. Draw blue point pins and red boxes/pen strokes onto a new PNG canvas at `image.naturalWidth` x `image.naturalHeight`. Never use preview CSS dimensions for output pixels.

- [ ] **Step 5: Verify**

Run: `npm test -- src/lib/studio/image-annotations.test.ts`

Expected: PASS.

### Task 2: Persist hidden annotation images

**Files:**
- Modify: `src/lib/agent/types.ts`
- Modify: `src/app/api/artifacts/upload-image/route.ts`
- Modify: `src/app/api/artifacts/route.ts`
- Modify: `src/lib/studio/api.ts`
- Modify: `src/lib/host/web/file-store.test.ts`

- [ ] **Step 1: Write a failing persistence test**

Add a file-store test that writes an image Artifact with `visibility: "hidden"` and `purpose: "annotation"`, reloads it with `get`, and asserts both fields survive. Assert a pre-existing visible artifact keeps both fields undefined.

- [ ] **Step 2: Verify the test fails**

Run: `npm test -- src/lib/host/web/file-store.test.ts`

Expected: TypeScript failure because Artifact lacks the two metadata fields.

- [ ] **Step 3: Extend Artifact compatibly**

Add to `Artifact` in `src/lib/agent/types.ts`:

```ts
visibility?: "visible" | "hidden";
purpose?: "annotation";
```

Keep the fields optional. Do not change store paths or `ArtifactStore` signatures.

- [ ] **Step 4: Validate annotation metadata at the upload boundary**

Extend `UploadImageBody` in `src/app/api/artifacts/upload-image/route.ts` with optional `visibility` and `purpose`. Only accept the exact pair `"hidden"` / `"annotation"` when either field is provided; return HTTP 400 for every other value or incomplete pair. Persist accepted fields. Existing composer uploads omit them and stay visible.

- [ ] **Step 5: Hide annotations only from normal list responses**

In `src/app/api/artifacts/route.ts`, filter `artifact.visibility !== "hidden"` before sort/response. Do not alter `[id]` or raw routes: the same user must be able to resolve a known annotation id during a queued turn.

- [ ] **Step 6: Add browser helper**

Extend `UploadImageArtifactBody` in `src/lib/studio/api.ts`, then add:

```ts
export async function uploadImageAnnotation(body: { sessionId: string; name: string; dataUrl: string }): Promise<Artifact> {
  return uploadImageArtifact({ ...body, visibility: "hidden", purpose: "annotation" });
}
```

- [ ] **Step 7: Verify**

Run: `npm test -- src/lib/host/web/file-store.test.ts`

Expected: PASS.

### Task 3: Make the runtime source-role aware

**Files:**
- Modify: `src/lib/agent/runtime.ts`
- Modify: `src/lib/agent/runtime.messages.test.ts`

- [ ] **Step 1: Write a failing reminder test**

Build a run with a ready visible base image and ready hidden annotation image, then assert the generated image-reference reminder identifies the base as the editable canvas, the annotation as targeting reference, preserves input order, and says not to reproduce marks.

- [ ] **Step 2: Verify the current generic reminder fails**

Run: `npm test -- src/lib/agent/runtime.messages.test.ts`

Expected: FAIL because both images are described as generic @ mentions.

- [ ] **Step 3: Implement role-aware wording**

Update the referenced-image reminder builder. Preserve generic behavior for ordinary @ image references. If an Artifact has `purpose === "annotation"`, require `generate_image` to keep `[base, annotation]` ordering and make clear that annotation pixels are targeting directions only. Keep the existing user-scoped artifact lookup and ready/non-failed checks.

- [ ] **Step 4: Verify**

Run: `npm test -- src/lib/agent/runtime.messages.test.ts`

Expected: PASS.

### Task 4: Implement the responsive annotation overlay

**Files:**
- Create: `src/components/studio/ImageAnnotationOverlay.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Create the component contract**

```ts
export type ImageAnnotationSubmit = { dataUrl: string; marks: ImageAnnotationMark[]; request: string };
export default function ImageAnnotationOverlay(props: {
  image: HTMLImageElement | null;
  imageName: string;
  busy: boolean;
  error: string | null;
  onCancel(): void;
  onSubmit(input: ImageAnnotationSubmit): Promise<void>;
}): ReactNode;
```

Render over rendered image bounds only. Provide point/box/pen controls using Lucide, labelled undo/redo/cancel/send controls, and a note input. Submit requires both a non-empty note and at least one mark.

- [ ] **Step 2: Implement pointer and keyboard behavior**

Use refs for active stroke/marks. Pointer move may schedule one `requestAnimationFrame` Canvas 2D redraw but must not set React state. Commit marks only on pointer up. Escape cancels; Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z redoes; Enter sends only when the note input is not composing IME text. On rejected submit, keep marks/note open and show error.

- [ ] **Step 3: Add motion/accessibility CSS**

Add namespaced rules:

```css
.image-annotation-stage { transition: opacity 220ms cubic-bezier(0.23, 1, 0.32, 1), transform 220ms cubic-bezier(0.23, 1, 0.32, 1); }
.image-annotation-toolbar, .image-annotation-composer { transition: opacity 160ms cubic-bezier(0.23, 1, 0.32, 1), transform 160ms cubic-bezier(0.23, 1, 0.32, 1); }
```

Use only transform/opacity for stage motion and `scale(0.96)` only on toolbar/composer entry. Do not use `transition: all`, animated dimensions, Framer Motion, or rAF DOM styling. In `prefers-reduced-motion: reduce`, remove transforms and retain 160ms opacity/color feedback.

### Task 5: Bridge preview upload to chat queue

**Files:**
- Modify: `src/components/studio/ArtifactPreview.tsx`
- Modify: `src/app/studio/c/[sessionId]/page.tsx`

- [ ] **Step 1: Extend preview inputs**

Add `sessionId?: string` and this callback to `ArtifactPreviewProps`:

```ts
onImageAnnotationRefine?: (input: { baseArtifactId: string; annotationArtifactId: string; message: string }) => Promise<"sent" | "queued" | "rejected">;
```

Show `标注修改` only for a ready image with this callback and a session id.

- [ ] **Step 2: Keep image identity during mode entry**

Give the existing `<img>` a ref. Turn on the preview's existing maximized stage before mounting the overlay and pass the same image element after it has painted. Keep the raw URL unchanged and do not create another image request.

- [ ] **Step 3: Upload then invoke the canonical send path**

From the overlay submit callback, call `uploadImageAnnotation({ sessionId, name: `${artifact.name} 标注`, dataUrl })`, compose `buildImageRefinementInstruction`, then call `onImageAnnotationRefine`. Upload/callback errors stay in the overlay; close only after the returned status is `sent` or `queued`.

- [ ] **Step 4: Implement the session bridge twice**

Pass props to both mobile and desktop `ArtifactPreview` instances. The callback must be:

```ts
(input) => chat.send(input.message, {
  referencedArtifactIds: [input.baseArtifactId, input.annotationArtifactId],
})
```

Do not create a second chat endpoint, manually create messages, or manually create pending output artifacts.

- [ ] **Step 5: Verify focused integration**

Run: `npx tsc --noEmit`

Expected: PASS.

Run: `npm test -- src/lib/studio/image-annotations.test.ts src/lib/host/web/file-store.test.ts src/lib/agent/runtime.messages.test.ts`

Expected: PASS.

### Task 6: Browser acceptance and delivery

**Files:**
- Modify only files from Tasks 1-5 if a scoped verification fix is necessary.

- [ ] **Step 1: Run full checks**

Run: `npm test`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 2: Verify real interaction**

Run: `npm run dev`

At desktop and mobile widths, use a ready letterboxed image to create a pin, box, and pen stroke; undo/redo; type Chinese via IME; submit; and observe a normal queued/sent chat request. Confirm the original remains visible, the output is separate, and no annotation artifact appears in the works rail.

- [ ] **Step 3: Verify motion and accessibility**

At 10% speed in Chrome Animations, repeatedly enter/exit annotation mode and verify no white flash/image reload and transform/opacity-only motion. Enable `prefers-reduced-motion: reduce` and verify only opacity/color feedback remains. Test Escape and both undo shortcuts.

- [ ] **Step 4: Commit implementation**

```bash
git add src/lib/studio/image-annotations.ts src/lib/studio/image-annotations.test.ts src/components/studio/ImageAnnotationOverlay.tsx src/lib/agent/types.ts src/app/api/artifacts/upload-image/route.ts src/app/api/artifacts/route.ts src/lib/studio/api.ts src/lib/host/web/file-store.test.ts src/lib/agent/runtime.ts src/lib/agent/runtime.messages.test.ts src/components/studio/ArtifactPreview.tsx src/app/studio/c/[sessionId]/page.tsx src/app/globals.css
git commit -m "feat(studio): refine images with annotations"
```

## Self-review

| Design requirement | Plan task |
| --- | --- |
| Point, box, pen and natural-image coordinates | 1 and 4 |
| Clean base plus marked source image | 1, 3, and 5 |
| Hidden user-scoped artifact | 2 |
| Existing chat queue and async generation | 5 |
| Smooth/reduced-motion interaction | 4 and 6 |
| Failure, keyboard, unit/build/browser checks | 1-6 |

No dependency, persistent comment model, mask API, or original-image overwrite is included.
