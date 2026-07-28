# 005 — Silky, interruptible works-rail open/close (no width layout thrash)

- **Status**: DONE
- **Commit**: `7a68d60`
- **Severity**: HIGH
- **Category**: Performance / Interruptibility / Easing & duration
- **Estimated scope**: 2 files (`page.tsx`, `globals.css`)
- **Depends on**: Prefer **004** first (chrome clarity); can land alone if needed.

## Problem

### A — Unmount kills exit motion

```tsx
// src/app/studio/c/[sessionId]/page.tsx:656-735 — current
{worksRailOpen ? (
  <div className="studio-works-shell" data-open="true" style={{ width: worksRailWidth }}>
    ...
  </div>
) : (
  <button className="studio-works-edge-tab" ... />
)}
```

When `worksRailOpen` flips false, the shell **unmounts immediately**. CSS on `.studio-works-shell[data-open="false"]` never runs for close. Open is a hard mount + optional keyframe reveal — not a reversible transition. Rapid open/close **restarts** from zero (keyframes + remount).

### B — Animating layout width is expensive and janky

```css
/* globals.css:614-635 — current */
.studio-works-shell {
  --works-ease: cubic-bezier(0.22, 1, 0.36, 1);
  transition:
    width 480ms var(--works-ease),
    max-width 480ms var(--works-ease),
    opacity 380ms var(--works-ease),
    transform 480ms var(--works-ease),
    filter 360ms var(--works-ease),
    border-color 280ms ease;
  will-change: width, transform, opacity;
}
```

- **`width` / `max-width` transitions force layout** every frame (AUDIT: animate only `transform` + `opacity`).
- **480–620ms** exceeds drawer budget (AUDIT: drawers **200–500ms**, UI prefer **≤300ms** for frequent panels).
- **`filter: blur(6px)`** on close path is heavy (Safari).
- Open **content-in** keyframes 560–620ms + blur on preview: decorative, non-interruptible, over budget.

### C — Reveal only on auto-open

`worksReveal` + `data-reveal` only when `animated && wasClosed` — manual open/edge tab get **pop-in** with no shared curve.

## Target

### Structure (keep mounted)

Always mount the works shell on desktop `md+`. Drive state with `data-open="true"|"false"`:

```tsx
<div
  className="studio-works-shell border-l border-white/40"
  data-open={worksRailOpen ? "true" : "false"}
  style={{
    // Fixed open width for transform clip pattern — see CSS
    ["--works-rail-width" as string]: `${worksRailWidth}px`,
  }}
>
  <div className="studio-works-shell-inner" style={{ width: worksRailWidth }}>
    ...list + preview...
  </div>
</div>
{/* Edge tab: show when !worksRailOpen; can fade with opacity on the tab itself */}
```

**Do not** conditional-unmount the shell on close. Use `pointer-events: none` + `aria-hidden` when closed. Edge tab can remain a sibling when closed (as now).

### Motion (transform + opacity only)

Use the **clip / slide** pattern so the rail’s outer wrapper has fixed width equal to open width, but is clipped; animate **`transform: translateX(...)`** and **opacity** on the shell (or inner):

Recommended pattern (pick one and stick to it):

**Option A — outer width jumps, inner slides (simple, good enough):**

```css
.studio-works-shell {
  --works-ease-out: cubic-bezier(0.23, 1, 0.32, 1); /* AUDIT --ease-out */
  --works-drawer: cubic-bezier(0.32, 0.72, 0, 1);   /* AUDIT --ease-drawer / repo uses this */
  flex: 0 0 auto;
  min-width: 0;
  overflow: hidden;
  /* Instantly allocate/release layout slot without animating width */
  width: var(--works-rail-width, 0px);
  transition: none; /* width is discrete */
}

.studio-works-shell[data-open="false"] {
  width: 0;
  border-color: transparent;
}

.studio-works-shell-inner {
  height: 100%;
  transition:
    transform 280ms var(--works-drawer),
    opacity 200ms var(--works-ease-out);
  transform: translateX(0);
  opacity: 1;
  will-change: transform, opacity;
}

.studio-works-shell[data-open="false"] .studio-works-shell-inner {
  transform: translateX(12px); /* small exit nudge toward right edge */
  opacity: 0;
  pointer-events: none;
}
```

**Important timing sequence for close without layout jump:**

1. Set `data-open="false"` first → inner opacity/transform animates (280ms).
2. After transition end (~280ms), set layout width to 0 **or** use a dual-state:
   - `worksRailOpen` (visible/interactive)
   - `worksRailMountedWidth` (layout)

Cleaner dual-state (recommended in JS):

```tsx
// conceptual
const [worksRailOpen, setWorksRailOpen] = useState(false);
const [worksRailWidthLive, setWorksRailWidthLive] = useState(0); // 0 when fully closed

// open:
setWorksRailWidthLive(worksRailWidth); // allocate slot
requestAnimationFrame(() => setWorksRailOpen(true)); // then slide in

// close:
setWorksRailOpen(false); // slide out
// onTransitionEnd on inner → setWorksRailWidthLive(0)
```

Shell style: `width: worksRailWidthLive` (no CSS width transition). Inner uses `data-open` for transform/opacity **280ms** / **200ms**.

### Durations & easing (exact)

| Phase | Property | Duration | Easing |
| --- | --- | --- | --- |
| Enter/exit slide | `transform` | **280ms** | `cubic-bezier(0.32, 0.72, 0, 1)` (drawer) |
| Enter/exit fade | `opacity` | **200ms** | `cubic-bezier(0.23, 1, 0.32, 1)` (ease-out) |
| Edge tab hover | `transform` / color | **160–200ms** | keep existing drawer ease |

### Delete / stop using

- `width` / `max-width` **transitions** on `.studio-works-shell`
- Close-state `filter: blur(6px)` 
- `studio-works-content-in` / `studio-works-preview-in` keyframes for routine open (optional: keep **only** for first auto-reveal after write_artifact, max **300ms**, opacity-only; prefer delete entirely for cohesion)
- `will-change: width`

### Edge tab

When rail closes, edge tab should appear with:

```css
.studio-works-edge-tab {
  transition:
    opacity 200ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 200ms cubic-bezier(0.32, 0.72, 0, 1),
    color 160ms cubic-bezier(0.32, 0.72, 0, 1),
    background 160ms cubic-bezier(0.32, 0.72, 0, 1);
}
```

Enter from `opacity: 0; transform: translateY(-50%) translateX(6px)` → rest state. Use transition not keyframes so spam open/close is interruptible.

### Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  .studio-works-shell-inner {
    transition: opacity 160ms ease !important;
    transform: none !important;
  }
  .studio-works-edge-tab {
    transition: opacity 160ms ease, color 160ms ease, background 160ms ease !important;
  }
}
```

## Repo conventions to follow

- Drawer curve already used: `cubic-bezier(0.32, 0.72, 0, 1)` (e.g. `.studio-view-in`, edge tab).
- Strong ease-out: `cubic-bezier(0.23, 1, 0.32, 1)` (market cards / AUDIT `--ease-out`).
- Prefer CSS transitions over remount keyframes for reversible chrome.
- Exemplar interruptible hover: `.studio-works-edge-tab` hover transform (keep, shorten if needed).

## Steps

1. **`page.tsx`**: Stop unmounting shell on close. Always render shell + conditionally show edge tab when `!worksRailOpen` (or when fully closed after transition).
2. **`page.tsx`**: Implement open/close sequencing:
   - open: set layout width → rAF → `data-open=true`
   - close: `data-open=false` → `onTransitionEnd` → layout width 0
3. **`globals.css`**: Rewrite `.studio-works-shell` / `-inner` / `-preview-shell` as Target; remove width transitions and close blur; remove or gut reveal keyframes.
4. **Edge tab**: opacity/transform enter; keep pulse for new artifact (existing `data-pulse`).
5. **`prefers-reduced-motion`**: update block under existing media query (~812+).
6. Feel-check spam toggle (header 作品) mid-animation — must reverse from current state without jump.

## Boundaries

- Do NOT change ArtifactPanel/Preview close semantics except as required by 004 (prefer 004 first).
- Do NOT animate resize-handle drags (direct manipulation stays instant).
- Do NOT add Framer Motion / new deps.
- Do NOT animate chat column width with JS springs — discrete width slot + transform on rail is enough.
- If dual-state proves too heavy, minimum viable fix: keep mount + transform/opacity only + discrete width (no width transition) even without perfect exit sequencing.

## Verification

- **Mechanical**: `npx tsc --noEmit`; no runtime errors on session page.
- **Feel check**:
  - Toggle 作品 5× quickly: motion **retargets**, no flash empty / full.
  - Open feels responsive (ease-out / drawer, **≤300ms** slide).
  - Close: content fades/slides then space releases — **no** hard cut mid-panel.
  - DevTools Animations 10%: only `transform` + `opacity` on rail inner (no continuous width).
  - `prefers-reduced-motion`: no horizontal slide; short opacity OK.
- **Done when**: open/close feels continuous; layout width is not tweened; no 480ms+ blur exit.
