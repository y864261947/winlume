# Zen AI Enterprise Homepage Reconstruction

## Goal

Replace Reizo's current `/business` page with an editable, high-fidelity React reconstruction of the current `https://zenaicorp.com/zh` homepage. It is a visual and interaction baseline: the initial version retains the reference site's public Chinese copy, content ordering, and public media, then permits later replacement with Reizo branding and content without changing page structure.

## Scope

The page includes the homepage navigation, hero, capability narrative, problem statements, engineering foundation, voice-agent showcase, case-study sections, impact stories, AI assessment, FAQ, and footer. The `/services` navigation menu and all service-detail pages are explicitly excluded.

No iframe or copied site source code is permitted. The page is implemented with the existing Next.js App Router, React, TypeScript, Tailwind/CSS tokens, and Lucide where an equivalent icon is needed.

## Page Architecture

- `src/app/business/page.tsx` remains the metadata route entry.
- The current single `EnterpriseLanding` component is split into focused presentational sections: navigation, hero, capability cards, challenge narrative, foundation, voice-agent presentation, case/impact content, assessment, FAQ, and footer.
- Public reference media is represented through a replaceable local asset manifest. The source URLs and local asset paths are isolated from layout components.
- The `/business` route owns its dark navigation and footer so reference geometry is not constrained by the general Reizo marketing chrome.

## Visual Fidelity

- Preserve reference module order, desktop and mobile breakpoints, typography scale, spacing, borders, surface colors, and scroll hierarchy.
- Recreate canvas/system readouts and lightweight motion with local CSS/React effects; do not embed the reference's runtime or code.
- Compare browser screenshots at `1440x900` and `390x844` against the live reference after each module is completed. Correct visual differences before advancing to the next module.
- Public media used for the initial baseline is copied into locally replaceable assets where technically available. Components must still render a deliberate fallback when an asset cannot load.

## AI Assessment

- Preserve the reference interaction pattern: one choice per screen, progress signal, previous-answer navigation, and visible completion state.
- Expand from the reference's short flow to an eight-question, branch-aware assessment that captures desired outcome, owning team, current workflow, data sources, maturity, constraints, urgency, and desired delivery.
- Persist the in-progress answers in `localStorage` under a versioned Reizo key so a refresh does not discard the interview.
- Completion renders a local report preview instead of navigating to `/studio` or claiming that a lead was submitted. The report contains a readiness score, recommended starting scenario, observed constraints, required inputs, a phased recommendation, and a concise answer recap.
- Users can navigate back to revise answers, regenerate the preview, and restart the assessment.

## Verification

- Browser-check all primary navigation, menu states, section anchors, FAQ expansion, voice-demo controls, assessment forward/back/restart/report states, and media fallbacks.
- Capture desktop and mobile screenshots for visual comparison with the reference page.
- Run `npm test`, focused lint for edited files, `npx tsc --noEmit`, and `npm run build`. Existing baseline failures are reported separately from new failures.

## Non-Goals

- `/services` menu and service-detail routes.
- Any simulated server-side sales submission, CRM handoff, or automatic `/studio` navigation from assessment results.
- Copying or embedding Zen AI's application source code.
