# Desktop wallet adapter deployment — 2026-10-24

Deployed to `https://reizo-ai.com` on `40.160.139.134`, service `reizo`,
runtime `/opt/reizo`, at 17:59:10 Asia/Shanghai.

- Previous build: `zbZYWWYkCS7xLX2kYjKHX` (including the media catalog and OAuth fixes).
- New build: `p7P6NNOy9CNsyKABFSZpX`.
- Retained build source: `/opt/reizo-wallet-build-20261024`.
- Rollback runtime: `/opt/reizo-before-wallet-20261024`.
- Scope/evidence: `/opt/reizo-wallet-fix-20261024`; runtime `wallet-release.json`
  records baseline and SHA-256 hashes of the nine reviewed source/test files.

The isolated build copies the retained production source at
`/opt/reizo-desktop-build-20261023`. Its four modified source files matched the
known Git baseline after CR normalization; all other source files remained identical.
Only these recharge files were overlaid, preserving the live model catalog and OAuth
fixes. The local checkout's unrelated staged and unstaged changes were not deployed.
No source branch or GitHub deployment workflow was changed by this manual release.

## Contract

- `GET /api/desktop-auth/wallet`: current workspace, live balance, payment config and
  recent orders; active desktop bearer with current account/membership validation.
- `POST /api/desktop-auth/wallet`: explicit workspace, integer amount, payment method
  and request UUID. Uses existing Epay order creation with device-scoped idempotency.
- `GET /api/desktop-auth/wallet?organizationId=…&order=…`: same-workspace order and a
  temporary cashier link for an existing pending order; never creates an order.
- `GET /api/desktop-auth/cashier?ticket=…`: validates an order-specific HMAC ticket,
  desktop grant, current account and owner/admin role, then emits an escaped, CSP
  restricted POST form using the existing signed Epay purchase parameters.

Merchant keys stay server-side; desktop bearers stay in Electron main. The browser
receives a capability for one pending order, expiring within ten minutes. Existing
signed notifications and quota crediting remain unchanged. Browser return is never
treated as successful payment by the desktop.

The desktop authorizes creation against the workspace shown to the user. A changed
current workspace is rejected. GET polling and explicit POST rate limits use separate
buckets, so read-only refreshes do not exhaust the payment submission allowance.

## Validation

- Local desktop account/wallet tests: 37 passed. Local web payment tests: 28 passed.
  Both projects pass TypeScript. Targeted lint has no new errors (existing unused
  parameter warnings remain in console/server.ts).
- On the production build host: 50 payment, wallet, media catalog/bootstrap and OAuth
  regression tests passed; full production compilation, TypeScript, static generation
  and standalone packaging passed.
- Preview: 10 existing pages/APIs and 21 referenced static assets returned 200;
  missing/invalid desktop grants returned 401; invalid cashier ticket returned 403;
  responses remained no-store. Unauthenticated order submission was rejected before
  any creation. No production user/grant was fabricated for validation.
- Migration SQL bytes and journal matched the live runtime. Dry-run and actual checks
  reported `applied=0 baselined=0 already_recorded=16`. No schema changes were needed.
- Existing `.env` bytes, runtime data, backups and previous static assets were retained.
  Automatic health-check rollback was prepared before swapping runtime directories.
- Live pages/APIs and public-origin checks passed; service active, `NRestarts=0`.
- Matching native development client restarted; the existing signed-in account loaded
  real workspace balance, configured presets/range and Alipay/WeChat methods. The
  panel remains open. No real recharge order or payment was created during this task.

The first isolated build excluded nested `src/data` by an overly broad copy filter.
It failed before affecting the live runtime. The corrected copy excludes only root
runtime data and passed the full build. Earlier build evidence is retained beside
the successful logs.

No installer was published. Actual payment-to-quota acceptance remains for the user
to complete in the cashier. Future website releases must retain the new wallet adapter
alongside the existing desktop model and OAuth changes; the dirty local checkout is
not itself the production baseline.
