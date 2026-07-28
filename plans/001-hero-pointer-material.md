# 001 — Materialize the hero pointer response

- **Status**: TODO
- **Commit**: `9fc18a9`
- **Severity**: MEDIUM
- **Category**: Performance, physicality, missed opportunities
- **Estimated scope**: 3 files, about 90 lines

## Problem

The hero already receives pointer coordinates, but it writes two CSS custom properties
on every native `pointermove` event and uses them in a large radial-gradient background.
That makes the main hero surface repaint at the browser's pointer-event frequency and
does not create a distinct physical layer for the user to follow.

```ts
// src/components/enterprise/EnterpriseMotion.tsx:27 — current
const onPointerMove = (event: PointerEvent) => {
  landing?.style.setProperty("--zen-pointer-x", `${event.clientX}px`);
  landing?.style.setProperty("--zen-pointer-y", `${event.clientY}px`);
  if (coordinate) {
    coordinate.textContent = `COORD // X:${String(Math.round(event.clientX)).padStart(4, "0")} Y:${String(Math.round(event.clientY)).padStart(4, "0")}`;
  }
};
```

```css
/* src/app/globals.css:1170 — current */
.zen-hero::after {
  z-index: -1;
  background: radial-gradient(360px circle at var(--zen-pointer-x) var(--zen-pointer-y), rgba(220,216,235,.38), transparent 66%);
  transition: background .18s ease-out;
}
```

## Target

Use one `span.zen-hero-pointer-light` inside `EnterpriseHero` as a decorative,
pointer-events-none layer. Its position must update through `transform` in a single
`requestAnimationFrame` callback, not through an animated gradient. The light should
lag the pointer by 14%, with no bounce, and never obscure readable content.

```css
.zen-hero-pointer-light {
  position: fixed;
  z-index: 2;
  width: 16rem;
  height: 16rem;
  border-radius: 999px;
  pointer-events: none;
  opacity: .46;
  background: radial-gradient(circle, rgba(220, 216, 235, .72), rgba(210, 224, 216, .2) 42%, transparent 72%);
  filter: blur(2px);
  transform: translate3d(-50%, -50%, 0);
  will-change: transform;
}

@media (prefers-reduced-motion: reduce), (max-width: 760px) {
  .zen-hero-pointer-light { display: none; }
}
```

The rAF loop must calculate `current += (target - current) * .14` for each axis,
set `style.transform` to `translate3d(${currentX}px, ${currentY}px, 0) translate3d(-50%, -50%, 0)`,
and stop when the component unmounts. It must only begin after the first pointer move.

## Repo conventions to follow

- The page motion controller is [src/components/enterprise/EnterpriseMotion.tsx](../src/components/enterprise/EnterpriseMotion.tsx).
- Existing reveal motion uses `requestAnimationFrame` to coalesce scroll work at
  [src/components/enterprise/EnterpriseMotion.tsx:40](../src/components/enterprise/EnterpriseMotion.tsx:40).
- Existing motion only uses `transform` and `opacity` for reveal frames at
  [src/components/enterprise/EnterpriseMotion.tsx:64](../src/components/enterprise/EnterpriseMotion.tsx:64).
- Respect the existing `prefers-reduced-motion` branch.

## Steps

1. In `src/components/enterprise/EnterpriseHero.tsx`, add `<span className="zen-hero-pointer-light" aria-hidden="true" />` immediately after `.zen-hero-grid`.
2. In `src/components/enterprise/EnterpriseMotion.tsx`, query that element once. Replace direct pointer writes with target-coordinate assignment and one pending rAF. Keep telemetry text updates in the same rAF callback.
3. Track `currentX`, `currentY`, `targetX`, and `targetY` in the effect closure. Use the exact `0.14` interpolation factor and cancel the pending frame on cleanup.
4. In `src/app/globals.css`, add the target style after the final enterprise cascade. Remove the `.zen-hero::after` pointer-gradient declaration; preserve its other non-pointer background rules if any.
5. Add a reduced-motion test manually in the browser: the pointer light must not render when the media feature is enabled.

## Boundaries

- Do NOT add a motion library or canvas.
- Do NOT move the fixed ambient orb or alter hero copy/layout.
- Do NOT update coordinates more than once per animation frame.
- If the decorative layer causes text contrast loss, lower opacity before changing colors.

## Verification

- **Mechanical**: `npx eslint src/components/enterprise src/app/business/page.tsx`; `npm test`; `npm run build`.
- **Feel check**: move the pointer rapidly over the desktop hero. The light follows continuously with a subtle catch-up, never jumps, and does not cause text to jitter. At 10% speed, it follows one smooth path rather than a series of gradient repaints.
- Toggle reduced motion: the light disappears while the coordinate display remains functional.
- **Done when**: the hero has a visible but restrained pointer response, all updates are rAF-coalesced, and no mobile motion is introduced.
