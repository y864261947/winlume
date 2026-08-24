# 006 — Studio sidebar expands on click, not hover

- **Status**: DONE
- **Commit**: `17af0fa4`
- **Severity**: HIGH
- **Category**: Purpose & frequency
- **Estimated scope**: 3 files (`StudioShell.tsx`, `StudioSidebar.tsx`, `globals.css`)

## Problem

Collapsed studio chrome treated pointer-enter as “open”. Hover mounted a 248px peek overlay, hid the 52px rail control, and moved expand to a different button. Click-to-expand required a second click on the overlay.

```tsx
/* src/components/studio/StudioShell.tsx — previous */
onPointerEnter={(event) => {
  if (event.pointerType === "mouse") showSidebarPeek();
}}
```

Hover-to-open is a tens-of-times/day action. It should not run an entrance animation or steal the click target.

## Target

- Hover does **not** open the sidebar.
- The collapsed rail is one full-height control: click (or keyboard activate) expands to 248px.
- Icon hover/press only: background + color `150ms ease`; press `scale(0.97)` at `150ms cubic-bezier(0.23, 1, 0.32, 1)`.
- Width morph stays `200ms cubic-bezier(0.23, 1, 0.32, 1)` (already in shell).
- `@media (hover: hover) and (pointer: fine)` gates hover paint.
- `prefers-reduced-motion: reduce` drops the press scale, keeps color.

## Repo conventions to follow

- Strong ease-out already used on this shell: `cubic-bezier(0.23, 1, 0.32, 1)`.
- Press scale `0.97` already used on studio header icon buttons.

## Steps

1. Remove peek state, timers, overlay, and pointer-enter/leave/focus peek handlers from `StudioShell.tsx`.
2. Render collapsed chrome as a single `button.studio-sidebar-rail` that calls `expandSidebar`.
3. Delete `.studio-sidebar-peek` and `[data-peek]` CSS; add rail icon hover/press/reduced-motion rules in `globals.css`.
4. Remove unused `temporary` / `onRequestExpand` / `PanelLeftOpen` from `StudioSidebar.tsx`.

## Boundaries

- Do NOT restore hover peek, even with a delay.
- Do NOT animate the rail with `width`/`scale` of the 52px strip itself.
- Do NOT change mobile drawer behavior (rail already `display: none` under 768px).

## Verification

- **Mechanical**: collapse, hover 1s, confirm no `.studio-sidebar-peek` and width stays 52px; click rail, width becomes 248px.
- **Feel check**: icon brightens on hover, presses to 0.97, click expands in place. Reduced motion: color only.
- **Done when**: expand is a click/keyboard action; hover never pops the panel.
