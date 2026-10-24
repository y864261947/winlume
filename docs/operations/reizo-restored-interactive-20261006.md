# Restore September 30 UI and retain the interactive workbench — 2026-10-06

User requested rollback of the October 6 landing-page release, preserving only the screenshot's interactive workbench in the previous Agent page's workbench location.

## Live release

- Host/origin: `40.160.139.134`, `https://reizo-ai.com`; runtime `/opt/reizo`, service `reizo`, port 3001.
- Application BUILD_ID restored to `a5PrMgGJ6FUEksNLwOx06` from `/opt/reizo.previous` (the complete September 30 v2 runtime).
- Archived October 6 runtime: `/opt/reizo-before-restore-20261006`, BUILD_ID `v7WrwrJa_qi2cn4jHbopV`.
- Release identity: `20261006-restore-interactive`, recorded in runtime `release.json`.
- No application rebuild: `server.js` and the whole `.next/server` tree match the September 30 runtime exactly. This restores all earlier homepage, account/profile/email, membership, login animation and Studio/task-dashboard code.

## Retained module

`public/reizo/experience/` was copied intact from the October 6 release (commit `b50290695ec5b1977ec434c8a30a4841e6217e08`). Its browser-local adapter supplies film and ecommerce sample projects, image previews, editable canvas and video playback. It blocks paid execution and privileged operations; no real model invocation was made during validation.

The existing Agent page still embeds `/reizo/showcase/index.html`. That static entry now forwards its own frame to `/reizo/experience/index.html?project=film`; the old page layout and its real Studio links stay intact. The October 6 homepage and unrelated page changes were not retained. The entire module and entry are also saved locally under `public/reizo/`.

## Data and validation

- Preserved current environment and current runtime data; environment files were identical between the two original releases. No database or user data rollback.
- Restored the older retained backups directory because the October 6 runtime did not contain one. Verified it against `/opt/reizo.previous/backups`.
- Migration runner: all 15 migrations already recorded, zero newly applied. Restored code includes email-change migration 0014 omitted by the October 6 package.
- Browser preview: project switching, all ecommerce image nodes, full image enlargement, 12-second video (observed playback position advancing), and 390px layout with no horizontal overflow.
- Twenty main public/account/Studio paths plus module HTML/JS/image assets return 200. Unauthenticated task endpoint returns 401. Video byte-range requests return 206.
- Service active/running, NRestarts=0. Previous compiled server code matches exactly; current data/environment and retained backups verified.

## Deployment baseline warning

The October 6 GitHub workflow did deploy to this host. The current remote master does not include all the earlier uncommitted/manual September 30 work; its full-package deployment removed `/studio/tasks` and other additions. Reconcile those changes into the source baseline before another automatic master deployment. Do not assume a future GitHub push preserves this restored release. No Git history or workflow settings were changed in this restore.

Scripts and module archive: `output/reizo-restore-1006/`. The module archive is 17MB compressed (67MB extracted). Previous runtime and pre-restore runtime are both retained.
