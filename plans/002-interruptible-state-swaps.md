# 002 — Make narrative state swaps continuous

- **Status**: TODO
- **Commit**: `9fc18a9`
- **Severity**: MEDIUM
- **Category**: Interruptibility, cohesion, missed opportunities
- **Estimated scope**: 3 files, about 130 lines

## Problem

The voice demo and assessment replace keyed DOM trees with the same entry keyframe.
Repeated selections restart from the start state, so rapidly choosing scenarios or
answers can visibly jump rather than continuing from the currently presented state.

```tsx
// src/components/enterprise/EnterpriseNarrative.tsx:63 — current
<div key={scenario.id} className="zen-voice-stage">
```

```tsx
// src/components/enterprise/EnterpriseAssessment.tsx:199 — current
<div key={current.id} className="zen-question zen-stage-enter">
```

```css
/* src/app/globals.css:641 — current */
.zen-voice-stage,
.zen-stage-enter { animation: zen-stage-arrive 360ms var(--zen-ease-out) both; }
```

## Target

Use a two-layer crossfade for scenario and question content. Each layer must transition
only `opacity` and `transform` using `220ms cubic-bezier(0.23, 1, 0.32, 1)`; incoming
content starts at `opacity: 0; transform: translate3d(0, 8px, 0)` and outgoing content
ends at `opacity: 0; transform: translate3d(0, -4px, 0)`. It must be possible to choose
another scenario while the prior transition is running: the new transition starts from
the currently visible layer and never disables the tab buttons.

For report creation, retain the existing single entry treatment because completion is a
rare, one-way state. Change only its timing to `360ms var(--zen-ease-out)` and preserve
the reduced-motion opacity-only fallback.

## Repo conventions to follow

- `EnterpriseNarrative` is already a client component and owns `scenarioIndex` and
  `playing` at [src/components/enterprise/EnterpriseNarrative.tsx:19](../src/components/enterprise/EnterpriseNarrative.tsx:19).
- `EnterpriseAssessment` is already a client component with a persisted draft.
- Motion tokens are defined in [src/app/globals.css:518](../src/app/globals.css:518):
  `--zen-ease-out: cubic-bezier(0.23, 1, 0.32, 1)`.

## Steps

1. In `EnterpriseNarrative.tsx`, replace the keyed `.zen-voice-stage` with a small local `VoiceStage` component that receives a scenario. Keep the prior scenario in state while a 220ms CSS transition runs.
2. Render the prior and next stage in a `position: relative` wrapper. The outgoing layer is `aria-hidden="true"`; the incoming layer remains the only semantic transcript after the transition completes.
3. Use a `transitionend` handler on `opacity` to clear the prior layer. Do not use a timeout, keyframe, or input lock.
4. In `EnterpriseAssessment.tsx`, apply the same retained-prior-layer pattern to question cards. Do not persist the prior layer and do not alter the eight-question data model.
5. In `globals.css`, replace the keyed-stage keyframe assignment with `.zen-swap-layer` transition rules using the exact transform and 220ms curve above. In `prefers-reduced-motion`, use `opacity 160ms ease` and `transform: none`.
6. Keep `.zen-stage-enter` only for the completed report and `zen-case-more` expansion.

## Boundaries

- Do NOT add a dependency or a fixed `setTimeout` to coordinate DOM removal.
- Do NOT alter assessment persistence, scores, questions, or report content.
- Do NOT animate height, width, padding, margin, top, or left.
- Do NOT make transcript text inaccessible by rendering two non-hidden copies after the transition settles.

## Verification

- **Mechanical**: `npx eslint src/components/enterprise src/app/business/page.tsx`; `npm test`; `npm run build`.
- **Feel check**: rapidly alternate the two voice scenarios. At 10% speed, each swap leaves from the currently visible state and the new content arrives from below without flashing.
- Answer three assessment questions quickly, then use Back. No question should jump back to its initial keyframe position and controls must remain clickable during a swap.
- Toggle reduced motion: content crossfades in 160ms with no translation.
- **Done when**: rapid reversal is continuous, only compositor properties animate, and the report still has a distinct completion arrival.
