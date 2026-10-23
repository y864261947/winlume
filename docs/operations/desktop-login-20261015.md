# Desktop account authorization — 2026-10-15

## Model bridge update — 2026-10-23

Desktop grants now authorize `GET /api/desktop-auth/model-session`. It checks the
live account and current workspace membership, then returns a device-specific
new-api auto Token, public `/v1` gateway URL, expiry and Chat Completions catalog.
The bridge uses the existing organization/new-api mapping and `api_keys.metadata`
to associate device keys with desktop sessions. It does not disclose the workspace's
shared hidden Studio key or management PAT. No additional schema migration is
required beyond `0015_desktop_sessions` from the login release.

Tokens expire after ten minutes (or earlier when the desktop grant expires) and
renew when fewer than two minutes remain. Disabled/revoked keys stay disabled;
automatic expiry can renew after revalidation. Workspace switches revoke old leases.
Logout expires the desktop grant first, revokes its keys, then deletes the grant;
failed revocation remains retryable. Offline local logout cannot confirm remote
revocation; upstream access can remain until the last lease expires. In-flight
model requests are not cancelled. Device-row locks serialize bootstrap/logout,
and repository operations reuse the transaction connection to avoid pool starvation.

For this bridge, `REIZO_AUTH_MODE=reizo` and `REIZO_GATEWAY_BACKEND=new-api` are
required (both are defaults). Configure `NEW_API_URL` for token management. If it
is internal, set `NEW_API_PUBLIC_URL` to the publicly reachable HTTPS root origin
of the same new-api deployment, without `/v1`. Without an override, the bridge uses
`NEW_API_URL` as its public address too. Existing mapping/secret encryption settings
must remain valid. Model management calls now have bounded request timeouts.

Release the matching desktop changes and restart/rebuild its main process. A fresh
client with no manual key automatically uses `reizo-account` when login/bootstrap
succeeds. Existing manual keys remain separate. The text catalog uses the actual
device token and includes only models advertising `supported_endpoint_types: ["openai"]`.
Images, videos and a unified capabilities catalog are subsequent work.

Verification: 52 web tests and 33 desktop tests pass, including the actual desktop
client/web-handler contract, key lifecycle, membership/workspace changes, concurrent
refresh/logout and a mocked text completion through the real SDK transport. Both
projects pass TypeScript. Targeted lint has no errors (desktop files retain non-null
assertion warnings). Production PostgreSQL/new-api acceptance, deployment and installer
creation have not been performed. The original release notes below are historical.

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
