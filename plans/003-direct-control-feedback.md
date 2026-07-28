# 003 — Give every enterprise control a common press response

- **Status**: TODO
- **Commit**: `9fc18a9`
- **Severity**: MEDIUM
- **Category**: Purpose and frequency, easing and duration, accessibility
- **Estimated scope**: 1 file, about 45 lines

## Problem

The page has a shared `:active` scale, but controls do not consistently declare a
press-and-release transform transition outside hover-capable desktops. That makes touch
feedback depend on browser defaults and makes the audio, question, FAQ, and mobile-menu
controls feel unrelated.

```css
/* src/app/globals.css:534 — current */
.zen-button:active,
.zen-nav-cta:active,
.zen-link-arrow:active,
.zen-expand:active,
.zen-audio-control:active,
.zen-question-options button:active,
.zen-scenario-switcher button:active,
.zen-faq article button:active {
  transform: scale(0.97);
}
```

```css
/* src/app/globals.css:561 — current hover-only transition */
@media (hover: hover) and (pointer: fine) {
  .zen-platform-card,
  .zen-case,
  .zen-audio-control,
  .zen-question-options button,
  .zen-scenario-switcher button {
    transition: transform 220ms var(--zen-ease-out), ...;
  }
}
```

## Target

Every user-triggered enterprise control has `transform 160ms cubic-bezier(0.23, 1, 0.32, 1)` on all input types. Press is `scale(.97)` and the mobile menu is `scale(.92)`. Background, border, and color changes use `180ms ease`; only hover lift remains inside `@media (hover: hover) and (pointer: fine)`.

```css
.zen-button,
.zen-nav-cta,
.zen-link-arrow,
.zen-expand,
.zen-audio-control,
.zen-question-options button,
.zen-scenario-switcher button,
.zen-faq article button,
.zen-nav-menu {
  transition: transform 160ms var(--zen-ease-out), background-color 180ms ease, border-color 180ms ease, color 180ms ease;
}
```

## Repo conventions to follow

- Use `--zen-ease-out` from `src/app/globals.css:518`.
- Keep desktop-only lift and hover treatment inside the existing
  `@media (hover: hover) and (pointer: fine)` block at `src/app/globals.css:556`.
- The existing press scales at `src/app/globals.css:534` are correct and should be kept.

## Steps

1. In `src/app/globals.css`, add the target common transition rule immediately before the existing `:active` selector.
2. Remove duplicate `transform` transition declarations from the hover-only group, but keep its box-shadow, border, background, and color transitions.
3. Add `@media (prefers-reduced-motion: reduce)` overrides for the same controls: `transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;` and `transform: none` for active states.
4. Do not change any button labels, roles, or click handlers.

## Boundaries

- Do NOT add hover lift on touch devices.
- Do NOT use `transition: all`.
- Do NOT add bounce or decorative looping animation to high-frequency controls.
- Do NOT change the existing 0.97 / 0.92 press scale values.

## Verification

- **Mechanical**: `npx eslint src/components/enterprise src/app/business/page.tsx`; `npm run build`.
- **Feel check**: press CTA, question options, scenario tabs, FAQ rows, and the mobile menu. Feedback begins on pointer-down and restores without a delayed rebound.
- Tap controls on a 390px viewport: no hover-only translation appears and no element shifts layout.
- Toggle reduced motion: color/border feedback remains but controls no longer scale.
- **Done when**: controls share one coherent press behavior across desktop and touch inputs.
