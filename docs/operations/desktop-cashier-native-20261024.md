# Native desktop cashier — 2026-10-24

Reizo production now supports signed purchase JSON from the existing cashier
ticket route. `Accept: application/json` returns `{url, params}` after the same
session/account/workspace/owner-or-admin/pending-order validation. JSON remains
no-store, nosniff and no-referrer, with `Vary: Accept`. The merchant key and desktop
bearer are never returned; the order-specific payment signature is submitted by
Electron main to the configured HTTPS merchant endpoint.

The client validates order reference, amount, method, callback URLs and purchase
shape, then uses `BrowserWindow.loadURL` with URL-encoded POST data in an isolated,
in-memory sandbox without a preload or Node integration. Account login continues
using the system browser. Reopening an existing pending order does not create a
new Reizo order. Main wallet polling remains the source of credit status.

The old browser intermediate form's no-navigation symptom was reproduced, but its
browser-specific cause was not established. The native cashier avoids that form
and its navigation dependency altogether. The HTML response remains available for
older links; no broad CSP or TLS relaxation was shipped.

## Deployment and evidence

- Host `40.160.139.134`, service `reizo`, runtime `/opt/reizo`.
- Previous build `p7P6NNOy9CNsyKABFSZpX`.
- Active build `abpSsCwgcDezcV5-YR4TD`, activated 18:12:20 Asia/Shanghai.
- Rollback `/opt/reizo-before-wallet-native-20261024`.
- Retained source `/opt/reizo-wallet-build-20261024`; only
  `src/lib/platform/desktop-wallet.ts` and its test were overlaid after matching
  their previous manifest hashes. Earlier source bytes were backed up first.
- Evidence `/opt/reizo-wallet-native-fix-20261024`; runtime
  `wallet-native-release.json` records the two-file patch and previous hashes.
  Existing `wallet-release.json` is also retained.
- 51 production-host regression tests, full production build and TypeScript passed.
  Ten existing routes and 21 static assets passed preview checks; live/public health
  and unauthenticated rejection checks passed. Service active, zero restarts.
- Migration files/journal match the prior runtime. Dry-run and actual migration
  checks reported zero applied/baselined changes, 16 already recorded. Existing
  environment bytes, data, backups and old static assets were preserved.
- Desktop: 52 account/cashier tests passed; TypeScript and targeted lint passed.
  Unsafe file/local/insecure navigation, download and permission rejection are
  covered, as are order mismatch, stale HTML responses and logout races.
- Native acceptance: restarted development client, reopened the user's existing
  CNY 10 pending order and visibly verified the correct amount and loaded Alipay
  QR code in the client cashier window. No additional Reizo order or payment was
  created by the agent. The user's actual scan/payment and resulting quota credit
  remain unverified. No installer was published.

Future web releases must include this two-file patch and the prior wallet/model/
OAuth changes. Do not publish unrelated dirty local files as this release baseline.
