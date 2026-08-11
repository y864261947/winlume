# Go Gateway Shadow Deployment — Reconciliation Runbook

> **Superseded 2026-08-11**: the Go gateway described here was decommissioned
> as part of the new-api integration cutover — stopped in production and its
> source deleted. See
> [docs/superpowers/specs/2026-08-11-reizo-new-api-integration-design.md](../superpowers/specs/2026-08-11-reizo-new-api-integration-design.md).
> Kept below as historical record only; none of this is actionable anymore.

## Status: shadow mode live on production (2026-08-05, ~17:06 UTC)

## Step 1: Catalog activation

See `docs/operations/go-gateway-pricing-import-2026-08-04.md`. One active
catalog confirmed (`c4966c6e-7b03-4b1d-aad7-c24b673c3ad6`, hash
`c31bde94...`), matching plan expectations: no duplicate content, exactly one
`active` row, prior draft preserved for rollback reference.

## Step 2: Go installed as the sole traffic-handling gateway, shadow mode

- Binary: `services/gateway/cmd/gateway`, built
  `CGO_ENABLED=0 GOOS=linux GOARCH=amd64`, installed at
  `/opt/reizo-gateway/reizo-gateway` on `176.122.164.148`.
- `reizo-gateway.service` rewritten to `ExecStart=/opt/reizo-gateway/reizo-gateway`
  directly (no Node/npm/tsx). Runs as the same user as before (root, matching
  the prior Fastify deployment's operational pattern — not yet moved to a
  dedicated `reizo-gateway` system user; that hardening is a candidate
  follow-up, not required for this cutover).
- `/etc/reizo/gateway.env` gained `DATABASE_URL` (same production database
  the migration above targeted) and an explicit `REIZO_GATEWAY_BILLING_MODE=shadow`
  (was already the config default, set explicitly for operational clarity).
  All previously-configured upstream/CORS/internal-token values were reused
  unchanged — the Go config reads the identical env var names as the old
  Fastify gateway for those.
- **Rollback preserved:** `/opt/reizo-gateway.previous-fastify` (full prior
  deployment directory), `/etc/systemd/system/reizo-gateway.service.pre-go-bak`,
  and `/etc/reizo/gateway.env.pre-go-bak` all left in place on the host.
  Rollback is: stop the service, restore the two backed-up files, `systemctl
  daemon-reload`, restart.
- Verified after cutover: `systemctl is-active` → `active` for both
  `reizo-gateway.service` and `reizo.service`; `/healthz` → 200; `/readyz`
  → 200 (confirms DB reachable + active catalog present, the shadow-mode
  readiness requirement); `/capabilities` → valid JSON route catalog.
- New-api remains the sole billing owner. Go is authoritative for nothing yet
  — `REIZO_GATEWAY_BILLING_MODE=shadow` only ever writes
  `billing_shadow_events`, never mutates a wallet/API-key/subscription ledger.

## Step 3: Correlated-request reconciliation

Exercised the live path end-to-end via the internal token:

- `POST /v1/chat/completions` with an unpriced/unmatched model → upstream
  (new-api) correctly returned its own `model_not_found` error (no channel for
  that model under the resolved group); Go correctly proxied that error back
  verbatim. `GET /internal/billing/shadow-events` confirmed **no** shadow
  event was created for this request — correct, since an unmatched model never
  opens a billing operation (`Begin` returns `nil, nil` for an unpriced
  model — no customer is ever charged, shadow or otherwise, for a model the
  catalog doesn't price).
- Repeated with a model that IS present in the active catalog
  (`claude-3-5-haiku-20241022`); still rejected upstream (`model_not_found`
  under the test identity's resolved group) because the synthetic test user
  used for this smoke test has no real new-api channel/group mapping. This is
  a test-identity limitation, not a Go Gateway defect — the request still
  round-tripped correctly through auth → relay → upstream → response.

**What this does and doesn't prove:** the full auth/relay/response pipeline
against real production infrastructure is proven working, and shadow mode's
"never charge for an unmatched/unpriced model" behavior is proven correct.
A live reconciliation of an actually-priced, actually-billed request (shadow
charge vs. new-api's own consume log for the same request ID) was **not**
exercised in this session — doing so needs a real, funded, correctly-grouped
test account on new-api, which wasn't available for this smoke test. The
storage-layer correctness this depends on (reservation/settlement math,
sign conventions, idempotency) already has 31 passing real-PostgreSQL
integration tests with zero known bugs as of commit `785e02bc`/`6014d9dc`/`785e02bc`
(see the billing integration test work earlier in this branch's history).

**Follow-up before claiming full reconciliation evidence:** correlate a
handful of real production requests (organic traffic, not synthetic) via
`GET /internal/billing/shadow-events` against new-api's own consume logs for
the same time window, once real traffic has flowed through shadow mode for a
representative period (hours to a day, not minutes).

## Step 4: Failure and recovery cases

Not separately exercised against production in this session — the
corresponding code paths (upstream rejection, transport failure, missing
terminal usage, recovery-worker replay, retry-across-channels) each already
have dedicated passing tests: 30+ real-Postgres integration tests
(`storage/billing_integration_test.go`, `storage/recovery_integration_test.go`)
plus the fake-backed unit suites for `billing`/`relay` reviewed in Tasks
15-19. Re-verifying these specific failure modes against production traffic
is a candidate for the "representative period" window mentioned above, not a
blocking gate for shadow deployment itself (shadow mode cannot mutate real
funds regardless of outcome).

## Step 5: Authoritative go/no-go criteria

- [x] Exact deterministic fixture parity (Task 11's golden parity suite,
      already passing pre-existing).
- [~] Explained live mismatches — no representative-period (hours/days) shadow
      reconciliation against new-api's own consume log was performed before
      cutover. This is a **known, accepted residual risk**, not a closed item —
      see "Accepted risk" below.
- [~] Zero unexplained stale reservations — not observable pre-cutover (shadow
      mode never reserves). Should be monitored post-cutover via
      `usage_events` rows stuck in `reserved`/`settlement_pending` past the
      recovery worker's window.
- [x] Successful recovery replay — proven directly against real Postgres by
      the Task 17 recovery integration tests (`storage/recovery_integration_test.go`,
      5/5 passing).
- [x] Direct-provider or non-charging-new-api upstream ownership — **confirmed**
      by direct inspection of new-api's database: Reizo's token
      (`tokens.id=162`, group `gpt-pro`) has `unlimited_quota=true`. New-api
      records `used_quota` for observability but never enforces or meaningfully
      bills against this token — it is not a real, funded, metered account on
      new-api's side. `REIZO_GATEWAY_UPSTREAM_OWNERSHIP=non_charging_new_api`
      is the correct and now-verified setting.
- [~] Tested rollback to shadow/off — the mechanism (edit
      `/etc/reizo/gateway.env`'s `REIZO_GATEWAY_BILLING_MODE` back to
      `shadow`, or restore `gateway.env.pre-authoritative-bak` /
      `gateway.env.pre-go-bak` + the corresponding `.service.pre-go-bak` unit,
      then `systemctl restart reizo-gateway`) was **not dry-run** before
      cutover. Low risk: it's the same binary, a config-only change, and the
      backup files are confirmed present on `176.122.164.148`.
- [x] Recorded approval: user explicitly authorized proceeding ("可以切") on
      2026-08-06 after being shown this checklist with open items, accepting
      the residual reconciliation-window risk below.

## Step 6: Authoritative cutover executed (2026-08-06, ~00:35 UTC)

Per explicit user authorization, proceeded without waiting for a
representative-period shadow reconciliation window. What was verified instead,
as the strongest available substitute:

- `REIZO_GATEWAY_BILLING_OWNER=go`, `REIZO_GATEWAY_UPSTREAM_OWNERSHIP=non_charging_new_api`
  (empirically confirmed, not assumed — see above), and
  `REIZO_GATEWAY_RECOVERY_DIR=/opt/reizo-gateway/recovery` (created,
  `0700`) added to `/etc/reizo/gateway.env`.
  `/etc/reizo/gateway.env.pre-authoritative-bak` preserved as a
  mode-only rollback point (in addition to the full `.pre-go-bak` Fastify
  rollback from Step 2).
- `REIZO_GATEWAY_BILLING_MODE` flipped to `authoritative`, service
  restarted. **`/readyz` returned 200**, which is meaningful automated proof:
  it only returns 200 after `runStartupGates` (Task 19) passes DB
  connectivity, the complete required-table list (including the funding-path
  tables added in the post-Task-20 follow-up), one active valid catalog,
  internal token presence, recovery-directory writability,
  `BILLING_OWNER=go`, and allowed upstream ownership — all in one gate, all
  fail-closed.
- Smoke-tested with the same synthetic, unfunded identity used in shadow-mode
  testing: request correctly rejected with `503 billing_error/billing_unavailable`
  **before any upstream relay call was made** — no cost incurred, no crash,
  fails closed for an unknown identity exactly as designed.
- `reizo.service` (the main app) confirmed unaffected: `active`, `/studio`
  returns 200 throughout.

**Accepted risk, explicitly not closed by this cutover:** no real, funded
account's request has yet been traced end-to-end (Go's shadow/authoritative
charge vs. new-api's own consume log for the same request ID) in production.
The correctness this depends on is backed by 31 passing real-PostgreSQL
integration tests covering the exact reservation/settlement/refund/funding-
preference logic now running live, plus the fail-closed proof above — but a
live reconciliation against a real paid transaction has not been done. This
should be performed as soon as practical after cutover (compare the first
handful of real `usage_events` rows against new-api's logs for the same
request IDs) rather than treated as optional follow-up.

**Rollback, if needed:** `REIZO_GATEWAY_BILLING_MODE=shadow` in
`/etc/reizo/gateway.env` (or restore `.pre-authoritative-bak`), then
`systemctl restart reizo-gateway`. Full revert to the old Fastify gateway:
restore `/etc/systemd/system/reizo-gateway.service.pre-go-bak` and
`/etc/reizo/gateway.env.pre-go-bak`, `systemctl daemon-reload`, restart —
`/opt/reizo-gateway.previous-fastify` still holds the complete prior
deployment.
