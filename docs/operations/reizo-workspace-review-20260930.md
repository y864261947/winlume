# REIZO 2026-09-30 workspace design release

Deployed on 2026-09-30 to `https://reizo-ai.com` (`40.160.139.134`, service `reizo`, runtime `/opt/reizo`, port 3001).

- BUILD_ID: `UW-5hzxfsiUlPNQGdsaxo`
- Source/build: `/opt/reizo-workspace-review-build-20260930`
- Base: `/opt/reizo-showcase-build-20260930` (`ghW77Vw7Eayge36R-gbzA`)
- Rollback runtime: `/opt/reizo-before-workspace-review-20260930`
- Design source: `E:/wechat/xwechat_files/wxid_l4qf8f2qwxoa21_cc6d/msg/file/2026-09/REIZO-review-2026-09-30/REIZO-review-2026-09-30/site`

## Scope

Applied the new flat Studio layout, 240px sidebar, warm-neutral light palette and dark palette, logo treatment, composer/menu styling and compact account dashboard. Home composer menus open below; session menus open above. Existing real model/capability selection and draft persistence remain in use.

`/studio/tasks` reads current-user sessions and their newest recorded execution through authenticated `/api/studio/tasks`. Supports actual run-status filtering, text/project filters, and assigning tasks to existing projects through the existing session endpoint. Historical sessions without a run record are explicitly marked as historical rather than inferred completed. Another user's and archived sessions are excluded. Task metadata only is returned; run prompts are not included.

`/studio/tools` groups real tools and role skills into separate tabs with category and text search. `/studio/artifacts` uses cards with original images or document covers, source-task links and a responsive dialog reusing the actual preview/export components. The private preview state remounts on account identity changes.

The previous Agent marketing showcase, profile editing, verified email flow, login welcome animation and membership information are preserved. No model calls or production account mutations were made for the UI fixtures. Prototype-only execution controls were not added as inactive controls; video generation still reflects the existing unavailable service.

## Validation

- Production Next.js build, type checking and static generation passed.
- 9 tests passed across task-summary and task-route tests: authentication, tenant isolation, latest execution ordering, archived sessions and historical status.
- Edited Composer lint messages match the pre-change baseline (10 errors, 6 warnings); existing effect lint errors in the artifacts loader remain. No blanket lint cleanup or suppression was introduced.
- Browser: desktop/light/dark and 390px mobile composer, menu opening direction, tool search and role-skill switching.
- Isolated local fixtures against the production build: task status filter, project assignment persisting after refresh, document card/dialog content and mobile preview. Fixtures are confined to `output/reizo-design-0930/fixture-proxy.mjs`; no fixture APIs/data were deployed.
- All 20 checked public/account/Studio endpoints returned 200 after release. Unauthenticated `/api/studio/tasks` returns 401.
- Authenticated production browser check: existing account, real model catalog/menu, and 18 task records rendered successfully, including actual completed/failed execution states. This was read-only verification.
- Service active/running, NRestarts=0. Migration runner: 15 already recorded, 0 newly applied. Runtime `.env`, `data` and `backups` matched the retained prior runtime immediately after deployment.

Deployment used only the explicit 13-file overlay recorded in `output/reizo-design-0930/files.txt`, built atop current server source. Old hashed static assets are retained for already-open clients. This avoids publishing unrelated local dirty changes. GitHub's historical deployment target remains unreconciled; do not use a git push as a release to this host.
