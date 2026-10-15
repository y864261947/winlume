# Agent workbench showcase — 2026-09-30

The Agent marketing page now embeds `/reizo/showcase/index.html`, a static, interactive workbench based on the supplied design. The real `/studio` remains the destination for starting a personal task.

## Content and behavior

- Three example tasks: product video, brand visual assets, and a launch plan.
- Four downloadable outputs: a 12-second H.264 MP4, two existing image assets, and an authored Markdown document with a typeset reading preview.
- Direction selection changes the displayed output; users can inspect a three-stage task canvas and the complete output library.
- The sample uses no model, task, account, upload, or persistence APIs. It displays no actual user identity or task data. Video playback is manual with `preload="none"`.
- The film was rendered locally from the existing `public/studio/tools/background-removal/product-before.jpg`, using three camera treatments and captions. The film poster is extracted from its first second. The other visual is the existing `public/tool-covers/poster.webp`. The proposal is fictional sample content, labelled accordingly; it does not claim real customer results.
- Source: `public/reizo/showcase/`. The design importer and generated Agent markup both point to this static showcase.

## Validation

- Browser: full 12-second playback, task changes, direction confirmation, image enlargement, document reading and actual Markdown download, canvas navigation, and 390px mobile layout. No console errors in the showcase.
- Build: Next.js production build and type checking passed. BUILD_ID `ghW77Vw7Eayge36R-gbzA`.
- Packaged preview: Agent, Studio, account, skills and all showcase/media URLs returned 200. MP4 range request returned 206 with the expected 1,024-byte range and `video/mp4` content type.

## Release

- Host: `40.160.139.134`; origin: `https://reizo-ai.com`.
- Source/build: `/opt/reizo-showcase-build-20260930`.
- Runtime: `/opt/reizo`.
- Previous runtime / rollback: `/opt/reizo-before-showcase-20260930`.
- Existing environment, data, backups and hashed frontend assets are retained. The migration runner confirmed all 15 existing migrations were recorded; this change adds no migrations.
- Deployment helpers and video render filter: `output/reizo-showcase/` (no credentials stored).

Public-origin verification passed after deployment: all showcase assets and core account routes returned 200; MP4 range requests returned 206. Service active/running with NRestarts=0; runtime environment and persistent data/backups matched the retained previous release. The embedded output library was visually checked on the live Agent page.
