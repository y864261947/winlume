# Studio Image Annotation Refinement Design

**Date:** 2026-07-29
**Status:** Approved for implementation
**Scope:** One-shot visual annotations on Studio image artifacts that immediately request an AI image refinement. This is not a persistent review/comment system.

## 1. User outcome

From an image artifact's preview, a user can enter an annotation workspace, point at, box, or draw over the exact region to change, describe the requested change, and send it to the existing Studio chat/image-generation flow. The result is a new image artifact; the original image remains unchanged.

The feature is intentionally a refinement interaction, not a collaboration product. Annotations are transient input for one image-edit turn. There are no threads, replies, mentions, resolution states, or visible annotation history.

## 2. Interaction

1. The image preview toolbar exposes an `标注修改` action only for ready image artifacts.
2. Entering it opens the existing full-screen preview surface in annotation mode. The image is fitted inside an isolated stage; the annotation canvas covers only the rendered image bounds, never the surrounding letterbox area.
3. The toolbar provides three tools:
   - point: click creates a numbered target pin;
   - box: drag selects a rectangular region;
   - pen: draw freehand strokes for irregular regions.
4. A bottom composer accepts the requested edit. Undo/redo affect visual marks. Escape or the close action exits without sending.
5. Send is disabled until there is at least one mark and a non-empty request. While preparing the reference image and submitting, marks remain visible and controls are disabled. A failed submission preserves the working annotation and its text for retry.
6. On acceptance by the existing chat queue, the annotation workspace closes. The user sees the ordinary chat turn and the usual pending image artifact, then the new ready image when the async generation completes.

## 3. Image-edit data flow

The annotation is an adaptation of Open Design's visual-comment idea. Open Design gives a coding agent a marked screenshot plus source-file/selector context. WinLume's output is bitmap-only, so the image model must receive both a clean base image and a visual targeting reference.

```text
ready image Artifact
  -> browser renders mark canvas over natural image bounds
  -> browser composites marks on a copy at natural pixel dimensions
  -> POST hidden annotation Artifact
  -> chat request: base id first, annotation id second, structured edit instruction
  -> runtime reminder identifies base vs. marked reference
  -> agent calls generate_image(sourceArtifactIds: [base, annotation])
  -> image-edit endpoint creates a new output Artifact
```

### 3.1 Annotation artifact

The composited PNG is persisted as an image Artifact with `visibility: "hidden"` and `purpose: "annotation"`. It is still user- and session-scoped, can be retrieved by its id during the queued turn, and is not returned by normal artifact list endpoints or displayed in the Studio works rail. Existing artifacts omit both fields and therefore remain visible output/reference artifacts.

The annotation PNG contains the clean source pixels plus high-contrast target marks. The chat payload always lists ids as `[baseArtifactId, annotationArtifactId]`. The base image is the edit canvas; the annotation is a reference-only targeting aid. The prompt explicitly directs the agent and image model to apply the requested change to the marked area and not retain pins, boxes, or pen strokes in the output.

No delete or retention mechanism is introduced in this increment. This follows the existing upload-artifact policy: private source/reference artifacts may remain persisted but must not pollute the visible work list.

### 3.2 Structured instruction

The client constructs a short, deterministic prefix in Chinese containing:

- the base image artifact id;
- the marked reference artifact id;
- every normalized mark (`point`, `box`, or `pen`) and its bounding rectangle in 0-1 image coordinates;
- the user's requested change; and
- the invariant that the marks are instructions, not output content.

The normal chat request transports the ids via `referencedArtifactIds`; the existing server-side ownership check remains the authority. The runtime adds the base/reference role explanation to its image-reference reminder, so the agent does not need to infer ids from free-form prose.

## 4. Client architecture

`ImageAnnotationOverlay` is a focused client component. It owns only ephemeral annotation state and emits one submit callback containing a data URL plus normalized mark metadata. It does not read or write artifacts itself.

`ArtifactPreview` owns the image preview and is the integration boundary. It opens the overlay, calls the upload helper, and delegates a successful refinement request to the session page. The session page already owns `chat.send`, artifact selection, and optimistic artifact-list updates; it supplies the callback so the existing queue and streaming behavior remain canonical.

Canvas pointer data stays in refs during drawing. A single `requestAnimationFrame` redraw updates the visual layer. React state changes only on tool changes, completed strokes, undo/redo, submit state, and errors. This keeps a pen stroke responsive on a large generated image.

Coordinates are normalized against the actual rendered `<img>` rectangle. The composite output is drawn at `naturalWidth` x `naturalHeight`; mark coordinates scale from normalized values. The image must use same-origin `/api/artifacts/:id/raw`, so canvas export is not tainted.

## 5. Motion and accessibility

This is a frequently used production workbench interaction, so motion explains state rather than decorates it.

- The overlay/full-screen stage enters and exits with transform + opacity only: 220ms `cubic-bezier(0.23, 1, 0.32, 1)`. It remains mounted through an exit transition so rapid close/reopen actions retarget cleanly.
- Tool chips and the note composer enter with opacity plus `scale(0.96)` over 160ms using the same ease-out curve. Active tool changes use background/border/color transitions only.
- Completed pins, boxes, and strokes receive a 140ms opacity/transform confirmation; drawing itself never animates through React or layout properties.
- Submission replaces the send icon with a spinner without changing the toolbar's measured dimensions. A ready output continues to use the existing artifact rail attention behavior.
- `prefers-reduced-motion: reduce` removes position and scale changes, preserving a 160ms opacity/color transition for orientation and feedback.
- Keyboard support: Escape closes, Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z redoes, Enter submits only when the note field is not composing IME text. Buttons have labels/tooltips and the canvas stage has an accessible text description of the active tool.

## 6. Error handling and constraints

- Pending and failed image artifacts cannot enter annotation mode.
- Upload validation reuses the existing data-URL parser, MIME allow-list, session authorization, and image byte ceiling.
- If upload or chat submission fails, the overlay remains open with all marks and text intact; no false success state is shown.
- A queued chat turn retains the two image ids in the existing queue structure. The hidden artifact remains available until that queue item eventually runs.
- The image generator still decides whether a request is feasible. If it cannot make the requested local edit, it responds through the normal assistant path rather than modifying the base artifact.

## 7. Tests and acceptance

Unit coverage must verify:

- annotation composite geometry uses normalized coordinates and natural image dimensions;
- marks serialize deterministically into the structured refinement instruction;
- upload route accepts only authenticated, session-owned, valid image input and persists hidden annotation metadata;
- default listing excludes hidden artifacts while direct, user-scoped lookup still resolves them;
- queue/send payload preserves base-first and annotation-second source ids; and
- the runtime reminder identifies the two source roles and forbids preserving visible marks.

Browser verification must cover desktop and mobile widths, including image letterboxing, a point, a box, a pen stroke, undo/redo, retry after a forced upload error, queued submission, and reduced-motion mode. In Chrome's Animations panel at 10% speed, entering/exiting and toolbar transitions must be transform/opacity only and must not visibly flash or reload the image.

## 8. Non-goals

- Persistent comments, replies, assignments, or collaboration.
- Pixel-perfect mask/inpainting support; the current gateway integration does not expose a verified `mask` contract.
- Overwriting the original artifact or in-place version editing.
- Arbitrary image editing outside the existing user-scoped Artifact and chat pipeline.
