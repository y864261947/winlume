# Go Gateway — Outstanding Work After Authoritative Cutover

Status as of 2026-08-06: all 24 plan tasks (`docs/superpowers/plans/2026-08-04-go-gateway-billing.md`)
are implemented and committed. The Go Gateway is live in production on
`176.122.164.148` in `WINLUME_GATEWAY_BILLING_MODE=authoritative`, replacing
Fastify entirely. This document tracks what is deliberately still open.

## 1. No real-money reconciliation yet (highest priority)

No real, funded user account has had a complete request traced end-to-end
(WinLume's `usage_events` reservation → settlement → the same request's entry
in new-api's own consume log) since the authoritative cutover. Everything up
to that point is verified by:

- 31 real-PostgreSQL integration tests for `storage/billing.go`'s
  Reserve/Settle/Reverse/funding-preference logic (zero known bugs).
- The authoritative startup gate (`runStartupGates`) passing in production
  (`/readyz` → 200): DB connectivity, complete required-table list, one
  active catalog, internal token, recovery directory, billing owner, and
  upstream ownership all validated.
- A fail-closed smoke test: an unfunded synthetic identity was correctly
  rejected before any upstream relay call, with no cost incurred.

What is **not** yet proven: that a real paid request settles for the correct
amount, debits the correct wallet/API-key/subscription source, and matches
what new-api itself logged for the same request.

**Action needed:** as soon as practical, take a handful of real production
requests and compare their `usage_events` row (reserved/actual quota, funding
kind, status) against new-api's own log for the same request ID. Query
`/internal/billing/shadow-events`-style data is not available once in
authoritative mode (that endpoint is shadow-only) — use `usage_events`,
`wallet_ledger_entries`, `api_key_quota_ledger_entries`, and
`subscription_quota_ledger_entries` directly.

## 2. No gradual-rollout monitoring period

The plan's Task 24 Step 4 calls for monitoring reservations, settlements,
refunds, pending count/age, recovery attempts, insufficient-funds count, and
customer charge/cost/profit while gradually expanding traffic. This cutover
was a single direct flip (per explicit user authorization on 2026-08-06,
skipping the staged rollout) rather than a gradual expansion. The metrics
this monitoring would use already exist (`services/gateway/internal/observability/metrics.go`,
Task 19) — nothing needs to be built, only watched. `/metrics` is reachable
via the same internal-token-gated route as `/internal/billing/shadow-events`.

**Action needed:** watch `gateway_billing_operations_total`,
`gateway_insufficient_funds_total`, `gateway_recovery_events_total`, and the
charge/cost/profit counters for the first days of real traffic. No specific
thresholds were defined — use judgment on what looks anomalous relative to
the historical (pre-migration) Fastify billing volume, if any comparable
data exists.

## 3. Production failure-mode exercises not repeated live

Upstream rejection, transport failure, missing terminal usage, and recovery-
worker replay were all proven against a real (but isolated, non-production)
PostgreSQL database during development (Tasks 15-20). They were not
separately re-triggered against the live production deployment after
cutover. Low risk given the identical code path and database schema, but
listed here for completeness per the plan's Task 23 Step 4 / Task 24 Step 4.

## 4. Operational hardening not done (optional, non-blocking)

- The gateway process runs as `root`, matching the prior Fastify deployment's
  operational pattern. `docs/DEPLOY.md`'s documented production setup
  recommends a dedicated `winlume-gateway` system user; this was not created
  during cutover to minimize the number of changes in a single deployment.
- Rollback (both mode-only, to `shadow`, and full reversion to Fastify) has
  documented steps and preserved backup files
  (`gateway.env.pre-authoritative-bak`, `gateway.env.pre-go-bak`,
  `winlume-gateway.service.pre-go-bak`, `/opt/winlume-gateway.previous-fastify`)
  but the rollback procedure itself has not been dry-run.

## 5. Known, accepted, non-blocking code-level findings

Carried forward from the branch's own review history — none of these are
money-safety issues, all were explicitly triaged and either fixed or
deliberately deferred:

- No retry on Postgres serialization failures was found and **fixed**
  (commit `6014d9dc`) before cutover.
- The `refund` event's metric always records `outcome="success"` regardless
  of whether the underlying `Fail()` call actually succeeded (its error is
  discarded at the call site in `cmd/gateway/main.go`). Same shape as the
  `settle`/`"attempted"` finding that was fixed for `settle`; `refund` was
  left as-is. Cosmetic — does not affect actual billing correctness, only a
  diagnostic metric's label accuracy.
- `main.go`/`handlePublicRequest` has grown large (~700 lines) from
  accumulated metric-recording call sites across Tasks 17-19. Noted as a
  future readability pass, not a correctness issue.

## Full history

See `.superpowers/sdd/progress.md` in this worktree for the complete,
chronological task-by-task ledger (what was built, what each review found,
every commit SHA), and the other files in `docs/operations/` for the
pricing-import and shadow-deployment records.
