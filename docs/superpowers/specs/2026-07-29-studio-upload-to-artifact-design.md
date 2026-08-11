# Studio Upload-to-Artifact for @-Reference

**Date:** 2026-07-29
**Status:** Proposed — user-approved design, pending written-spec review
**Scope:** Persist composer-uploaded images as artifacts immediately on attach, so they're @-referenceable for image-to-image editing in the same turn they're uploaded.

## 1. Background

The `@` mention picker (shipped in [PR #12](https://github.com/y864261947/reizo/pull/12)) only lists `kind: "image"` artifacts already saved server-side — which today only happens via `generate_image`. A user who drags a photo into the composer gets a local, client-only `ImageAttachment` (base64 `dataUrl`, never persisted as an `Artifact`), so `@` shows "还没有可引用的图片作品" even with images visibly attached. This was surfaced directly by the user testing the shipped feature.

This design closes that gap: uploading an image now also creates a real `Artifact` immediately, so it's referenceable in the same composer session, before the message is even sent.

## 2. Architecture

**Upload-on-attach, not upload-on-send.** The moment a file becomes an `ImageAttachment` (drag-drop, paste, or the file picker — all funnel through `fileToImageAttachment` in `composer-attachments.ts`), the composer also fires an async `POST /api/artifacts/upload-image` with the same `dataUrl` it already built for the local chip. No new file read, no duplicate encoding work.

The new route decodes the base64 payload and writes an `Artifact` via the existing `ArtifactStore`:
- `kind: "image"`
- `status: "ready"` (not `"pending"` — the bytes are already complete; there's no async generation step to wait on, unlike `generate_image`)
- `mimeType` from the upload
- `name`: see §3

It returns the created `Artifact`. `ImageAttachment` gains an optional `artifactId?: string`, set once the upload resolves. `Composer` gains a `sessionId: string` prop (needed to scope the artifact write — it doesn't currently receive one) and an `onImageUploaded?: (artifact: Artifact) => void` callback; the Studio page implements that callback as an optimistic insert into its existing `artifacts` state (`setArtifacts((prev) => [artifact, ...prev])`), so the new artifact appears in the `@` picker's `imageArtifacts` list immediately — no extra round trip to re-fetch the list.

**Nothing about message sending changes.** `composeOutboundMessage` keeps inlining the attachment's base64 into the outbound text exactly as it does today. This is a pure addition: attaching an image now has a side effect (an artifact exists, so it's referenceable), but the send path itself is untouched.

## 3. Naming: "图片N"

Uploaded artifacts get a generated name like "图片1", "图片2" instead of the raw filename (which is often meaningless for a pasted screenshot or a phone's `IMG_20260315_142233.jpg`) — this directly makes the `@` picker's rows scannable (`@图片1` reads cleanly; `@IMG_20260315_142233` doesn't).

The counter is **upload-scoped, not shared with AI-generated artifacts**: it counts how many existing session artifacts already have a name matching `/^图片\d+$/` and continues from there, independent of how many `generate_image` results (which get model-chosen descriptive names) already exist in the session. No new field on `Artifact` — this is a naming convention, not a stored "origin" marker. Accepted trade-off: if an AI-generated artifact happens to be named exactly "图片3" by coincidence, it gets counted toward the upload sequence, which can make the next upload's number skip or collide by one. This is cosmetic only (it affects a label, never which artifact a reference resolves to) and judged not worth a schema change for.

For a multi-file drop (e.g. 3 images at once), the composer computes the starting count once from the current `imageArtifacts` prop, then increments per file within that batch, so a 3-image drop with 0 prior uploads becomes 图片1/图片2/图片3, not three "图片1"s.

## 4. Error Handling

If the upload call fails (network error, server error, oversized payload), the local `ImageAttachment` chip stays exactly as it is today — it simply never gets an `artifactId`, so it's silently excluded from the `@` picker, and `composeOutboundMessage` still inlines it into the sent text as before. The composer surfaces this via the existing `attachError` state (reused, not a new mechanism) with a short message clarifying the image will still send, just isn't `@`-referenceable yet.

The upload route re-validates the decoded byte length against the same `MAX_IMAGE_BYTES` (2MB) the client already enforces in `fileToImageAttachment`, so a client that bypasses the local check can't write an oversized artifact.

## 5. Out of Scope

- **No cleanup of orphaned artifacts.** If a user uploads an image, the artifact is written, and the user then removes the chip (or never sends the message at all), that artifact stays in storage unreferenced. This is judged the same acceptable class of debt as `generate_image`'s own pending/failed artifacts that never get cleaned up — not worth a deletion mechanism for this iteration.
- **No cross-session dedup.** Uploading the same image twice (even in the same session) creates two separate artifacts. Not a correctness issue, just storage duplication.
- **No artifact delete UI.** Out of scope regardless of this feature.

## 6. Decisions

| Topic | Decision |
|---|---|
| When to persist | On attach (drag/paste/pick), not on send |
| Artifact status | Always `"ready"` — uploads have complete bytes immediately, no `"pending"` phase |
| Send-path behavior | Unchanged — `composeOutboundMessage` still inlines base64 into text exactly as before |
| Naming | Generated `"图片N"`, upload-scoped counter via name-pattern matching, no new `Artifact` field |
| Upload failure | Degrades to "not @-referenceable, still sends normally" — never blocks or fails the send |
| Orphaned artifacts | Accepted, unmanaged — consistent with existing `generate_image` behavior |
