# GitHub first-login username conflict — 2026-10-23

The browser returned to `/?error=AccessDenied` when a first-time GitHub account's
username was already used by another Reizo account. Production logs showed a
PostgreSQL `23505` / `users_username_unique` error wrapped in `DrizzleQueryError.cause`.
The OAuth provisioning retry inspected only the outer error's `code`, so it never
generated a second username.

`social-oauth.ts` now follows the error cause chain, protects against cycles, and
retries username conflicts with a random suffix. Other identified constraints and
connection errors propagate immediately. Retries remain bounded to six attempts.
Matching usernames never authorize linking accounts; existing identity and verified
email resolution remain the authentication boundaries.

Validation: the regression failed against the original implementation with a real
`DrizzleQueryError`. All 30 OAuth, identifier-auth and credential-auth tests then
passed locally and on the build host. Targeted ESLint passed. The production build
passed TypeScript, compilation, static generation and standalone packaging.

The retained production build source at `/opt/reizo-desktop-build-20261023` was
updated with only the reviewed OAuth source and test files, after verifying its
original files match the Git baseline when line endings are normalized. No other
local checkout changes were released. Patch hashes, original source backups and
build logs are in `/opt/reizo-github-login-fix-20261023`; the runtime contains
`github-login-fix.json` with the source manifest.

Released at 17:05:40 Asia/Shanghai on 2026-10-23:

- Runtime: `/opt/reizo`, service `reizo`, public origin `https://reizo-ai.com`.
- Previous build: `8qYduuZ39zlrSgVSg4ce4`.
- New build: `E8lZM2CKEojyk1oDqRmQ0`.
- Rollback: `/opt/reizo-before-github-login-20261023`.
- Environment and data preserved; migration check applied zero migrations.
- Preview and live homepage, Studio, desktop authorization, auth providers and
  account configuration checks returned 200. Unauthenticated desktop model-session
  access still returned 401. Service active with zero restarts.

Real GitHub login still requires the user to retry in their browser; no OAuth
authorization or production account creation was automated as an acceptance test.
