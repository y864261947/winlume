# Desktop account authorization — 2026-10-15

Web half of Reizo Studio's system-browser login. It reuses existing Reizo/PostgreSQL
accounts, browser login UI, configured Google/GitHub providers and authVersion checks.
Legacy New API auth mode returns 503.

## Release contents

- `src/app/desktop/connect/`: authorization page; existing login modal/OAuth callback.
- `src/app/api/desktop-auth/[action]/route.ts`: create, inspect, approve, poll, revoke.
- `src/lib/platform/desktop-auth.ts`: credential creation/validation and protocol rules.
- `src/lib/platform/db/schema.ts`: desktop_sessions table.
- `drizzle/0015_desktop_sessions.sql`, `drizzle/meta/0015_snapshot.json`, journal entry.

Pending authorization lasts 10 minutes; active desktop credentials last 30 days.
Request ID, confirmation code and secret credential are independent. Only hashes of
codes/credentials are persisted. Approval requires same-origin JSON, active browser
account, confirmation code and atomic unclaimed/unexpired row update. Each authenticated
poll checks the live account/authVersion. Logout deletes the credential row. Expired
rows are pruned on new requests.

Responses are no-store. Credentials are accepted only in Authorization headers and
never included in browser URLs or public request responses. They currently authorize
only desktop session endpoints, not model calls, account APIs or billing. Desktop
workspace isolation and cloud sync are separate work.

## Deployment order

1. Review/release only these changes alongside the intended baseline. This local
   checkout has unrelated existing staged/unstaged work; do not deploy it all by accident.
2. Follow the existing database backup/migration procedure and apply the reviewed
   `0015_desktop_sessions` via `npm run db:migrate:prod` to the intended database.
   Check current migration state first; never point automated tests at production.
3. Deploy matching code with `REIZO_AUTH_MODE=reizo` (default) and public HTTPS
   `NEXTAUTH_URL`, currently `https://reizo-ai.com`. The TLS proxy must preserve the
   public Origin and supply trusted client IP headers.
4. Launch matching desktop. Its production account origin defaults to the above site.
   Verify with a chosen test account: login → enter code → approve → desktop → restart
   → logout. Confirm old desktop credentials fail after password reset/suspension.
5. A rollback can leave this additive table in place. Do not delete other account tables
   or revoke browser sessions.

Existing in-process rate limits are reused. Multiple replicas require matching shared
limits at ingress or a distributed limiter; the in-process limiter is not shared.
Production deployment, PostgreSQL migration and real-user OAuth acceptance have not
been performed. No new OAuth client secret is required.

## Tests

New helper/routes and existing auth/identifier-auth/account suites: 32 tests with
optional cross-repo acceptance. Set `REIZO_DESKTOP_SOURCE=F:/selfProject/reizo-studio`
(or actual checkout path) before running Vitest to enable the real desktop-client
contract test. Ordinary web CI skips that single test without a desktop checkout.
Its database adapter is in-memory; it verifies the message contract, not PostgreSQL
transaction execution or real provider login. Local web preview launch was rejected by
automatic approval without a detailed reason; web visual acceptance remains pending.
