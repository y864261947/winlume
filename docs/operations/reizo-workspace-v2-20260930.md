# REIZO workspace v2 release — 2026-09-30

Deployed to https://reizo-ai.com on 40.160.139.134, service `reizo`, runtime `/opt/reizo`, port 3001.

- Build: `a5PrMgGJ6FUEksNLwOx06`
- Source: `/opt/reizo-workspace-v2-build-20260930`
- Base: `/opt/reizo-workspace-review-build-20260930` (`UW-5hzxfsiUlPNQGdsaxo`)
- Rollback: `/opt/reizo-before-workspace-v2-20260930`
- Design: supplied `REIZO-review-2026-09-30-v2/REIZO-review-2026-09-30-v2/site`.

## Scope

Studio uses the v2 white/cool-gray/blue palette and matching dark palette. Removed the home composer hint and repeated tools/results introductory text. Existing real login popup, circular avatar and welcome animation remain integrated.

The sidebar task entry is now 任务看板. Projects expand to show their actual conversations (initially four, then more), including sessions beyond the former eight-session limit. Known project sessions do not repeat in recents; unknown project references remain reachable there. Each project supports a fresh project-scoped composer and the real project management page. Mobile navigation now overlays content instead of squeezing it.

The task dashboard has four metric cards, status/search/type/project filters, task cards, actual latest-run state and project assignment. Completed tasks show a completed track; incomplete tasks never receive an invented percentage. The side panel totals input/output Tokens from up to 50 recent consume logs, explicitly labelled as workspace call records. Membership percent is derived from configured allowance; unavailable information displays as unavailable. No plan or concurrency limit is inferred from the design mockup. Running and queued counts are recorded task statuses, not fabricated demo statistics.

## Validation and release

- Production webpack build, TypeScript and page generation passed.
- Nine task summary/authenticated route tests passed (tenant isolation, latest run, archives, unknown history and authentication).
- ESLint passed for Sidebar, TaskDashboardInsights, tasks page, StudioHomeView, StudioAccountControl and tools page. Existing artifacts loader lint baseline was not changed by its header-only edit.
- Isolated browser fixture: ten tasks with six project conversations and four unassigned recents. Expansion shows four then six; running filter shows three; project new conversation carries and displays its project. Token inputs 2400 + 600 yield 3K; 58240/80000 allowance yields rounded 73%.
- Desktop and 390px dark dashboard checked. Final mobile drawer preserves 380px content width within a 390px viewport and closes without navigating away.
- Fixture is local-only, is not packaged, forwards no production credentials and makes no real model calls.
- Post-deploy: all 20 public/account/Studio paths returned 200; unauthenticated task endpoint returned 401; account and membership markup checks passed.
- Service active/running, NRestarts=0. Fifteen migrations already recorded, zero newly applied. Environment, data and backups matched the rollback runtime immediately after release.

Only the eight-file overlay in `output/reizo-v2-0930/overlay-files.txt` was applied to the current server source, plus the final mobile CSS adjustment (included in the final overlay archive). Existing hashed assets are retained. Unrelated local work, earlier real showcase media, account/profile/email flows and pricing details were preserved. Use the retained runtime for rollback; the historical GitHub deployment target remains unsuitable for this server.

Authenticated read-only live browser verification also passed: 18 actual tasks (14 completed, four failed), recent 50 call records totaling 110.08K Tokens, and explicitly unconfigured monthly allowance. Screenshot: `output/reizo-v2-0930/live-dashboard.jpg`.
