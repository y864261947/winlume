# Homepage demo motion release — 2026-10-08

Published to https://reizo-ai.com as `20261008-motion`, BUILD_ID `QV3FwwHgk4BJPgjKr-vEm`.

Only three source files differ from the previous deployed build: `src/components/reizo/generated/design.css`, `home.js`, and `showcase-scenes.js`. The ecommerce homepage demo now reveals tool rows sequentially, changes running labels into finished labels, animates artwork entrance, and moves a blue selection frame to the current artwork. Business code, other application routes and billing behavior are retained.

- Complete source: `/opt/reizo-motion-build-20261008`.
- Runtime: `/opt/reizo`, service `reizo`, port 3001.
- Rollback: `/opt/reizo-before-motion-20261008` (build `046hd0Pfabe-mm5J7Yd1v`).
- Local overlay, SHA-256 manifest and guarded deployment scripts: `output/reizo-oct08-motion`.
- Production compilation, TypeScript, page generation and packaging passed. Preview: 17 endpoints returned 200; two authenticated endpoints returned 401 without a session; no missing routes.
- Database migration runner found all 15 migrations already recorded, applied zero changes. Environment file verified identical; data, backups and old static assets preserved during release.
- Live service active/running, NRestarts=0. Public homepage, Agent page, pricing, account personalization, task dashboard and skills API returned 200.
- Live browser confirmed sequential progress advancing from step 1 to step 3, the blue selection frame, and switching between ecommerce and visual-media scenes without console errors. Screenshot: `output/reizo-oct08-motion/live-motion.png`.

The animation changes currently reside in generated files. Keep the overlay/manifest and reconcile them into the design source or importer before regenerating design output, to avoid overwriting this release's motion.

## Git source reconciliation — 2026-10-08

The `codex/reizo-20261008-release` branch is based on remote master `b502906` and reconciles the source of this deployed release. The exported production source archive has SHA-256 `697b4f5bc6a8ae782fed69db7b2aa8a1aabda2cb2a8d8385b742a9306d841eb3`; environment files, runtime data, dependencies and build output were excluded. Application source files were compared byte-for-byte with the export. Remote-only unused presentation components and existing tests remain available.

This also records previously deployed account/profile/email-change and task functionality, Gemini image support, authenticated pricing reads, and migration 0014. These are baseline reconciliation, not additional changes to the running service. The main local worktree and its existing index were preserved.

The design importer now references the October 8 input directory. Its original input is supplied separately at `design/reizo-20261008/site`; generated presentation assets are committed and normal builds do not run the importer. Do not regenerate without reconciling the motion overlay described above.

Before pushing, nine focused regression suites passed (91 tests), including design lifecycle/import, account validation, login, studio tasks/tools, Gemini images and pricing. The release had already passed a Linux production build and live smoke checks. This branch push does not trigger the master-only production deployment workflow.
TypeScript validation also passed after `next typegen` generated the route helper types.
