# Go Gateway Shadow Deployment — Reconciliation Runbook

## Status: shadow mode live on production (2026-08-05, ~17:06 UTC)

## Step 1: Catalog activation

See `docs/operations/go-gateway-pricing-import-2026-08-04.md`. One active
catalog confirmed (`c4966c6e-7b03-4b1d-aad7-c24b673c3ad6`, hash
`c31bde94...`), matching plan expectations: no duplicate content, exactly one
`active` row, prior draft preserved for rollback reference.

## Step 2: Go installed as the sole traffic-handling gateway, shadow mode

- Binary: `services/gateway/cmd/gateway`, built
  `CGO_ENABLED=0 GOOS=linux GOARCH=amd64`, installed at
  `/opt/winlume-gateway/winlume-gateway` on `176.122.164.148`.
- `winlume-gateway.service` rewritten to `ExecStart=/opt/winlume-gateway/winlume-gateway`
  directly (no Node/npm/tsx). Runs as the same user as before (root, matching
  the prior Fastify deployment's operational pattern — not yet moved to a
  dedicated `winlume-gateway` system user; that hardening is a candidate
  follow-up, not required for this cutover).
- `/etc/winlume/gateway.env` gained `DATABASE_URL` (same production database
  the migration above targeted) and an explicit `WINLUME_GATEWAY_BILLING_MODE=shadow`
  (was already the config default, set explicitly for operational clarity).
  All previously-configured upstream/CORS/internal-token values were reused
  unchanged — the Go config reads the identical env var names as the old
  Fastify gateway for those.
- **Rollback preserved:** `/opt/winlume-gateway.previous-fastify` (full prior
  deployment directory), `/etc/systemd/system/winlume-gateway.service.pre-go-bak`,
  and `/etc/winlume/gateway.env.pre-go-bak` all left in place on the host.
  Rollback is: stop the service, restore the two backed-up files, `systemctl
  daemon-reload`, restart.
- Verified after cutover: `systemctl is-active` → `active` for both
  `winlume-gateway.service` and `winlume.service`; `/healthz` → 200; `/readyz`
  → 200 (confirms DB reachable + active catalog present, the shadow-mode
  readiness requirement); `/capabilities` → valid JSON route catalog.
- New-api remains the sole billing owner. Go is authoritative for nothing yet
  — `WINLUME_GATEWAY_BILLING_MODE=shadow` only ever writes
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

## Step 5: Authoritative go/no-go criteria (not yet met — do not cut over)

Required before Task 24 may proceed:

- [x] Exact deterministic fixture parity (Task 11's golden parity suite,
      already passing pre-existing).
- [ ] Explained live mismatches — requires the representative-period shadow
      reconciliation from Step 3's follow-up, not yet done.
- [ ] Zero unexplained stale reservations — requires the representative
      period; shadow mode never reserves, so this specifically needs to be
      checked once authoritative-adjacent testing (or a longer shadow window
      with real traffic patterns) exists.
- [x] Successful recovery replay — proven directly against real Postgres by
      the Task 17 recovery integration tests (`storage/recovery_integration_test.go`,
      5/5 passing).
- [ ] Direct-provider or non-charging-new-api upstream ownership — not yet
      confirmed which applies to WinLume's current new-api account/channel
      configuration; this must be verified before `WINLUME_GATEWAY_UPSTREAM_OWNERSHIP`
      can be set for an authoritative attempt.
- [ ] Tested rollback to shadow/off — the rollback mechanism (stop, restore
      backed-up unit/env files, restart) is documented above but has not
      itself been dry-run.
- [ ] Recorded approval: who approved ownership transfer and when — N/A,
      not requested; Task 24 is out of scope until explicitly authorized.

**This branch is in shadow mode. Task 24 (authoritative cutover) requires an
explicit, separate go-ahead and should not proceed until the unchecked items
above are closed.**
