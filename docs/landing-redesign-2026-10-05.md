# REIZO homepage

The homepage source is `src/components/reizo/LandingPage.tsx`, mounted by
`src/app/page.tsx`. Its styles are scoped to `.reizo-landing` in `landing.css`;
existing account, Studio, catalog and business pages keep their own styles.

Design references: https://cursor.com/ and https://x.ai/bot, inspected on
2026-10-05. The useful principles are plain product descriptions, large complete
product views, and interaction that lets people explore actual work. No reference
site code, branding, fonts or media has been copied. REIZO's model membership,
API, pricing, desktop/web entry points and canvas selling points remain on the page.

The layout uses a white background, centered introductory headings, and
the desktop application's actual dark interface as its main visual. It removes
the previous automatic scene switching, fake generation progress, woven divider,
floating membership card, and repeated claims in the hero.

## Embedded product

The experience uses the real desktop renderer, including its original sidebar,
MainLayout, ChatPage and CanvasPanel, editing controls, React Flow navigation and
video players. The user requested that the product's original sidebar be kept.
It is not a separately drawn marketing replica. The browser-only entry point and
fixture adapter live in the desktop repo:

- `E:/CodeCode/Reizo/desktop/scripts/landing-experience/`
- `E:/CodeCode/Reizo/desktop/scripts/build-landing-experience.mjs`

The adapter contains three sample projects: a shoe launch film, an ecommerce
image set, and a content plan. The ecommerce images are existing output assets
from the desktop workspace; the film and copy come from the site's existing
showcase assets. These are clearly labelled sample projects, not customer claims.

Node moves, connections, text edits, zoom and undo use the real UI and an
iframe-local in-memory store. AI generation, API-key changes, command execution,
and external APIs are blocked. The frame neither writes account storage nor
connects to a production database. Its HTML also limits network access with CSP.

Rebuild from the desktop repo:

```powershell
node scripts/build-landing-experience.mjs
```

The destination is this site's `public/reizo/experience/`. Keep that output with
the site release; the website runtime does not need Electron or the desktop
server. Existing asset URLs are local to the iframe. Initial media is paused and
the desktop composer's autofocus does not scroll the marketing page.

Run this website with `npm run dev -- --webpack -H 127.0.0.1 -p 47322`.
There is no experience launch button, fullscreen, modal, reset or external
project toolbar. Project tiles switch the existing embedded sample. On narrow
screens, the original app sidebar collapses and the iframe uses readable native sizing.
Ordinary wheel scrolling does not zoom the sample canvas; zoom controls and
pinch gestures remain available.

The current repository has no public desktop installer URL; the client CTA goes
to the existing support entry and says “获取电脑客户端”. Model, legal and business
links use this repository's actual routes rather than routes that only exist in
the currently deployed overlay.

## Verification

- Homepage ESLint and its targeted TypeScript check.
- Desktop experience TypeScript check.
- Three tests covering denied paid/privileged calls, independent visitor state,
  node edits/undo and cancellable document streams.
- Browser QA: task switching, actual video playback, node dragging and undo,
  zoom controls, image/node inspection, desktop and mobile layouts.

The full repository type check currently encounters unrelated stale generated
Next route types for removed pack routes and ProcessEnv fixtures in the existing
media-worker tests. These were not changed by the homepage redesign. The homepage
and embedded product have separate targeted checks so this limitation is explicit.

This revision is prepared locally and has not replaced the production site.

## White background and experience refinement, 2026-10-06

The page now uses a pure white background, a locally hosted Geist variable font
(SIL OFL, license included in `public/reizo/fonts/`), regular-weight headings, and
short factual descriptions. The instructional caption below the experience,
the repeated model claim, several promotional headlines, and the ending slogan
have been removed. The main heading is simply “REIZO Agent”.

Grok Bot's real rendered initial state was inspected at `https://x.ai/bot`:
the title has 1200px perspective, word spans start at opacity 0 with
`translateY(45%) rotateX(-40deg)`, and supporting text starts at opacity 0,
12px blur, and a 10px vertical offset. Its published stylesheet gives the
embedded product a 1000ms fade. Its XVF and CursorGothic fonts are custom assets;
they have not been copied. The initial approximation was rejected by the user.
It has been replaced by a Motion implementation based on the actual published
source, rather than the former CSS approximation.

`ExperienceSurface.tsx` manages a persistent desktop iframe. Changing the
sample sidebar or project tiles stays synchronized through origin-checked
messages, keeping the same renderer instance and each project's edited nodes.
Static captures of the actual renderer cover startup until the
canvas has painted, without a fake progress animation or loading instructions.

The former fullscreen and launch controls were removed on 2026-10-06 after
the user clarified that this is a lightweight, inline product sample. The
original left sidebar is retained, without adding a second sample navigation.

Startup posters were recaptured directly from the standalone sample at
1280 × 720. The former crops incorrectly included homepage content; the new
`sample-*.jpg` assets contain only the product UI, including a separate canvas
view and native mobile captures. Image fixture dimensions now match the rendered image aspect ratios so
the first fitted viewport includes the full portrait selling-point image.
Browser verification confirmed that a wheel gesture over the canvas scrolls
the homepage while leaving its zoom at 0.667; original sidebar project switching
also updates the parent preview without recreating the iframe.

## Source-backed entrance correction

The actual published script was downloaded for inspection from
`https://x.ai/_next/static/chunks/1qu9uc2ui3eg0.js?dpl=367c525206561a36400b25e02c25ed7db42517e5`.
Modules 23268, 649105 and 8404 provide the intro orchestration, layered motion
and word reveal. The implementation in `LandingIntro.tsx` uses these measured
values:

| Layer | Start | Duration | Initial state |
| --- | --- | --- | --- |
| Word n | 100ms + n × 55ms | 650ms | opacity 0, Y 45%, rotateX -40° |
| Description | 500ms | 1100ms | opacity 0, blur 12px, Y -10px |
| Actions | 650ms | 1000ms | opacity 0, blur 12px, Y -10px |
| Product | 800ms | 1000ms | opacity 0, Y -20px |

All use cubic-bezier(0.22, 1, 0.36, 1); the heading uses 1200px perspective and
the word's default center transform origin. The headline typography follows
the reference's 60px / 1.05 desktop scale, with REIZO's own licensed font.

The reference and implementation were both sampled with requestAnimationFrame
while reading actual computed opacity, filter and transform values. Their
title reached 99% opacity at 424ms and 425ms respectively, relative to first
observed title movement. The other layers retained the same order and curve;
observed scheduling differed by about 50–80ms between page runs. This is not a
claim of pixel-identical typography or branding.

To avoid interrupting the entrance with the heavier real desktop application,
the interactive iframes mount after the 1800ms entrance completes, beneath their
actual renderer screenshots. Reduced motion displays all layers immediately.
