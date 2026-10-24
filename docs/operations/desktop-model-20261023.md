# Desktop account model bridge deployment — 2026-10-23

Production `https://reizo-ai.com` was updated on the confirmed Reizo host
`40.160.139.134`, service `reizo`, runtime `/opt/reizo`.

- Previous build: `AVrpgLMpq9K6UjmNMDlwz` (remote master `cc2c3f3`).
- New build: `YWmc6qasx1yprUNN0hKEr`.
- Runtime source: `1c1f5b79da2ddbdd60af3fc82979da062c111dc0` on
  `codex/desktop-account-models-20261023` in winlume. The branch contains the
  current remote master plus the reviewed model bridge changes, not the local
  checkout's unrelated staged/unstaged work.
- Matching desktop source: `e69caf1581ca6d286571f48edccfa04c25459f20` on the
  same branch name in reizo-studio. Desktop installer publication was not performed.
- Rollback: `/opt/reizo-before-desktop-model-20261023`.
- Preserved runtime `.env` byte-for-byte, final `data` directory via rsync while
  the service was stopped, previous static assets and any runtime backups.
- `NEW_API_URL=https://v2api.top` was already configured; the public URL defaults
  to it. No environment, proxy, certificate or new-api service change was needed.
- Isolated production build, TypeScript and preview checks passed before swapping.
  The running service is active with `NRestarts=0` after activation.

The production model catalog read check used an existing encrypted Studio token
only on the server. It returned 52 models, of which 25 advertise compatible text
endpoints. No secret was printed and no paid inference was requested. The new
bootstrap remains scoped to the currently logged-in user's workspace; this read
check does not prove every workspace has the same model permissions.

## Migration packaging correction

The Windows `git archive` used during this manual build exported SQL with CRLF.
The byte-level migration hashes therefore differed from the existing LF records.
The migrator retried old migrations and stopped on the already existing
`epay_order_status` type before the runtime was swapped. The previous service
continued returning 200 for its health routes.

The attempted migrations added two missing historical empty tables,
`enterprise_billing_requests` and `channels`, and recorded six CRLF hash entries
(two creations, two baselines and two idempotent migrations). Both newly created
tables were verified empty. Existing business rows were not deleted or rewritten.
The failed migration itself rolled back within its transaction. The migration
history was retained rather than edited or erased.

Every shipped SQL file was then normalized to LF and compared byte-for-byte with
the previous live release. Both dry-run and actual migration checks reported
`applied=0 baselined=0 already_recorded=16`. The package script now canonicalizes
SQL line endings so future Windows packages match Linux checksums. The corrected
packager was exercised with actual CRLF inputs in the isolated build: all staged
SQL files matched live LF bytes, packaging exited 0 and the staged migrator dry-run
reported no pending changes.

## Verification and use

The preview verified nine existing pages and a real PostgreSQL-backed pending
desktop grant: create -> pending -> model bootstrap denied -> logout -> old bearer
rejected. Invalid/missing model bearers return 401 with no-store responses.
Public verification also passed for `/`, `/studio`, `/api/skills`, `/desktop/connect`,
21 referenced static assets, invalid credentials, pending-grant model denial and
post-logout rejection. No active user was impersonated or automatically approved
during verification.
An authenticated end-user bootstrap and text completion still require the user's
normal desktop/browser authorization flow.

Restart the matching local desktop main process, open account information and
refresh status. If no manual key is selected, the available account text models
appear automatically. Users with a manual provider can select `Reizo 账号` in
settings. Image/video protocol adaptation remains separate work.

Code is synchronized to the release branches; merge them into their normal release
branches before a subsequent routine deployment to retain this functionality.
