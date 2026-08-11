# Gateway Service Accounts & Admin Backend Design

Status: approved design, pending implementation plan
Date: 2026-08-06

## 1. Summary

`services/gateway` currently authenticates two kinds of callers with two
different mechanisms: real end users via `api_keys` rows looked up in
Postgres (`LookupAPIKey`, [identity.go](../../../services/gateway/internal/storage/identity.go)),
and the Reizo Next.js app via a shared-secret "trusted internal token"
(`x-reizo-internal-token` + `x-reizo-internal-user-id`,
[gateway.ts](../../../src/lib/agent/provider/gateway.ts)) that lets it
impersonate any user ID. Reizo also carries two separate static env-var
tokens (`REIZO_GATEWAY_TOKEN`, `REIZO_IMAGE_GATEWAY_TOKEN`) left over from
a pre-Go-gateway routing constraint that no longer applies.

As more internal applications need to call the gateway, this design gives
every internal application its own first-class identity — a **service
account** — reusing the existing `users` + `api_keys` machinery instead of
building a parallel system. It also adds a minimal gateway admin backend
(inside the existing Next.js app) to view, quota-limit, and revoke these
service-account keys, and retires the internal-token mechanism and the
env-var token split.

## 2. Goals

- Give each internal application (Reizo app, and future internal apps) its
  own revocable, independently quota-limited API key.
- Replace `x-reizo-internal-token` impersonation with standard
  `Authorization: Bearer <service-account-key>` auth, reusing the existing
  `LookupAPIKey` path unchanged.
- Consolidate Reizo's three current env-var tokens into one
  service-account key.
- Add a `/gateway-admin` surface for viewing service accounts, editing their
  quota, and revoking keys.
- Keep the gateway's admin surface decoupled from `/account` (end-user
  self-service) and from organization-level roles, so adding future internal
  apps never depends on Reizo's own customer-facing auth model.

## 3. Non-goals

- Per-model or per-protocol access control for API keys (`Scopes`,
  `AllowedModels`, `AllowedGroups`, `IPAllowlist` remain unenforced — this is
  a pre-existing gap across the whole key system, not something this design
  introduces or fixes).
- Self-service creation of new service accounts from the admin UI. Creating
  one is an infrequent, operator-run action.
- A Reizo product-admin backend (managing Reizo's own end users, teams,
  content). That is a separate, later effort; this design only covers the
  gateway's operational surface.
- Changing how the gateway selects upstream provider channels
  (`StaticSelector`) — channel selection is already keyed by protocol family,
  not by caller identity, and stays that way.

## 4. Confirmed Decisions

1. **Identity model**: a service account is a `users` row with a new
   `is_service_account` flag, carrying one or more normal `api_keys` rows.
   No new tables. This reuses `LookupAPIKey`, `EnrichIdentityBilling`, quota
   accounting, and billing-group pricing without any new code path.
2. **No per-user attribution in the gateway.** The gateway does not track
   which end user inside an internal app triggered a call. A caller may
   optionally send an opaque `x-reizo-user-ref` header that the gateway
   logs verbatim for cross-referencing against the calling app's own user
   data; it is never used for quota, billing, or access decisions. Reizo
   (or any other internal app) owns its own end-user-level tracking.
3. **Auth mechanism**: `x-reizo-internal-token` / `x-reizo-internal-user-id`
   is retired. All internal-app traffic authenticates the same way external
   API traffic does: `Authorization: Bearer <service-account-key>`.
4. **No new access-control enforcement.** Isolation between service accounts
   is via `api_key_billing_policies.quota_limit` (hard spend cap) and
   `billing_group` (accounting/rate separation) only. Model/route scoping is
   explicitly out of scope (see Non-goals).
5. **Key provisioning**: service-account keys are created by a one-time,
   idempotent seed script/migration (outputs the plaintext key once, same
   pattern as the existing pricing-import tooling described in
   [2026-08-04-go-gateway-design.md](2026-08-04-go-gateway-design.md)). The
   admin UI can view, edit quota, and revoke — not create.
6. **One key per app**, not one per capability. The historical
   chat/image token split existed because of upstream channel provisioning
   in the old (pre-Go) gateway; `StaticSelector.Select`
   ([static_selector.go:44](../../../services/gateway/internal/relay/static_selector.go))
   proves upstream channel choice is keyed by protocol family in gateway
   config, not by the caller's inbound key, so the split has no remaining
   purpose. Reizo gets one service-account key that replaces
   `REIZO_GATEWAY_TOKEN`, `REIZO_IMAGE_GATEWAY_TOKEN`, and
   `REIZO_GATEWAY_INTERNAL_TOKEN`.
7. **Admin backend location**: a new route group in the existing Reizo
   Next.js app (e.g. `/gateway-admin`), not a separate deployable project.
   It is a thin UI over the gateway's own admin HTTP API — decoupling comes
   from that API boundary, not from repository separation.
8. **Admin backend auth**: reuse the existing `platform_role` enum on
   `users` (`"user" | "admin"`, already wired into Auth.js session via
   `getCurrentAuthContext()` in [session.ts](../../../src/lib/auth/session.ts))
   rather than building a separate login system. `/gateway-admin` pages and
   API routes require `platformRole === "admin"` and nothing else — no
   organization-role check, no other Reizo business-status check — so the
   gate stays a single, independent condition even though it rides on the
   same session mechanism.
9. **Next.js ↔ Gateway service-to-service auth**: a new static shared secret,
   `GATEWAY_ADMIN_TOKEN`, authorizes a small set of new admin-only HTTP
   endpoints on the Go gateway (list service accounts, view usage/spend,
   update quota, revoke key). This token is server-side only, never sent to
   the browser, following the same pattern as the existing
   `REIZO_GATEWAY_TOKEN`.

## 5. Architecture

### 5.1 Request flow (after this change)

```
Internal app (Reizo, future apps)
  --Authorization: Bearer <service-account-key>-->
  services/gateway  (LookupAPIKey, unchanged)
  --routes by protocol family via StaticSelector, unchanged-->
  Upstream provider
```

No new code path is added to the hot request path — a service account is
indistinguishable from a regular user's API key to `LookupAPIKey` and the
billing/pricing engine. The only new gateway surface is the admin API
(below), which sits outside the relay path.

### 5.2 Admin surface

```
Browser (admin, platformRole=admin)
  --Next.js session cookie-->
  /gateway-admin/*  (Next.js pages + route handlers)
  --Authorization: Bearer $GATEWAY_ADMIN_TOKEN-->
  services/gateway admin API  (new, e.g. /internal/admin/service-accounts)
  --pgx-->
  Postgres (users, api_keys, api_key_billing_policies)
```

`/gateway-admin` route handlers check `getCurrentAuthContext().platformRole
=== "admin"` before proxying to the gateway's admin API. The gateway's admin
endpoints check `GATEWAY_ADMIN_TOKEN` and are otherwise unauthenticated by
user identity — they trust the Next.js server, not the browser.

Admin API v1 surface (Go side, new):
- `GET /internal/admin/service-accounts` — list, with quota/usage summary.
- `PATCH /internal/admin/service-accounts/:id` — edit `quota_limit` /
  `billing_group` / `unlimited`.
- `POST /internal/admin/service-accounts/:id/revoke` — set `api_keys.status`
  to revoked.

### 5.3 Data model change

One migration: add `is_service_account boolean not null default false` to
`users`. No changes to `api_keys` or `api_key_billing_policies` — they
already carry everything a service account needs.

### 5.4 Migration of existing Reizo traffic

- Seed one service-account user + one `api_keys` row for Reizo itself.
- Replace `REIZO_GATEWAY_TOKEN`, `REIZO_IMAGE_GATEWAY_TOKEN`, and
  `REIZO_GATEWAY_INTERNAL_TOKEN` with a single `REIZO_SERVICE_KEY` env
  var read by [gateway.ts](../../../src/lib/agent/provider/gateway.ts).
- Remove the `legacyTransport`/`x-reizo-internal-token`/`New-Api-User`
  branches from `gateway.ts` once the new key path is verified in
  production.
- Deployment/rollout against the live gateway and Reizo Postgres uses the
  existing ops access documented for those machines (see
  `E:\CodeCode\new-api\.claude\skills\connect-new-api-server-15-204-82-213`
  and `E:\CodeCode\reizo\.agents\skills\connect-reizo-server`).

## 6. Testing

- Unit: `LookupAPIKey` already covers key lookup; add a case asserting a
  service-account row authenticates identically to a normal user row (no
  branching on `is_service_account` in the auth path).
- Unit: admin API handlers — quota edit and revoke, plus `GATEWAY_ADMIN_TOKEN`
  rejection on missing/wrong token.
- Integration: `/gateway-admin` route handlers reject non-admin sessions
  (403) and unauthenticated requests (redirect/401).
- Manual: issue a Reizo service-account key via the seed script, point a
  local Reizo app at it, verify chat and image generation both work
  through the single key.

## 7. Open items deferred to future work

- Per-model/per-protocol access control (Scopes/AllowedModels enforcement)
  if a real isolation need shows up between internal apps.
- Self-service service-account creation in the admin UI, once app count
  grows enough to justify it.
- A separate Reizo product-admin backend for managing Reizo's own end
  users/teams/content (explicitly out of scope here).
