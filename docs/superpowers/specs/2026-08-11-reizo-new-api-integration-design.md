# Reizo × new-api Integration — Design

Status: draft for review
Date: 2026-08-11
Author: Claude (design), pending user approval before handoff to implementing AI

## 1. Why this document exists

`E:\CodeCode\winlume` (Reizo) currently owns its **own** billing engine: a Postgres
wallet/ledger/usage/subscription system (`src/lib/platform/db/schema.ts`) plus a
separately-deployed Go process (`services/gateway`) that authenticates API keys, relays
LLM calls, and does authoritative or shadow billing. This was itself the product of an
earlier one-time migration **out of** new-api (`scripts/migrate-new-api.ts`,
`docs/MIGRATE_NEW_API.md`).

The product direction is now reversed: **new-api becomes the sole authority for model
inference, quota, and usage logging again.** Reizo becomes a workbench product (Studio,
teams, virtual API keys) that is a thin BFF in front of new-api — no self-hosted wallet,
no Go gateway. Reizo has not launched publicly, so this cutover does not need to preserve
or migrate existing wallet/usage data; the two servers involved (Reizo prod at
`176.122.164.148`, new-api prod at `15.204.82.213`, domain `v2api.top`) stay as-is except
for the changes described here.

This doc is the technical design. It is meant to be handed to an implementing AI/engineer
along with a detailed task plan (produced separately via `writing-plans` after this doc is
approved), and reviewed again by Claude once implemented.

## 2. Goals / non-goals

**Goals**
- One Reizo team (`organizations` row) ⇄ one new-api user, 1:1, quota pool lives on that
  new-api account.
- Team admins can mint/revoke virtual `sk-...` API keys; each maps to one new-api token
  under the team's new-api user.
- Studio (the in-product chat/agent surface) draws from the same team quota via a hidden,
  non-user-visible new-api token.
- All outbound model traffic — Studio and virtual keys alike — physically goes through
  Reizo's domain; new-api's address is never exposed to end users.
- Registration is all-or-nothing: Reizo user + default team + new-api user, or nothing.
- Team admins can see: total team balance/usage, per-key usage, Studio usage separately.

**Non-goals (this iteration)**
- No self-built billing ledger, no dual bookkeeping, no shadow-billing reconciliation.
- No per-member hard quota caps (soft/future).
- No payment integration (manual quota top-up via ops for now; interface reserved).
- No migration of existing wallet/usage data — those tables are dropped, not migrated.
- No multi-workspace switcher UI polish beyond "current team" — data model supports
  multiple memberships per user, but UI only exposes the active one.

## 3. Data model changes (`src/lib/platform/db/schema.ts`)

### 3.1 Reused as-is
- `users` — no schema change. `legacyNewApiUserId` stays (harmless leftover from the old
  per-user migration; not used by the new design, which maps at the **team** level).
- `organizations` — this **is** "team". No rename needed.
- `organizationMemberships` (`role`: owner/admin/member/viewer) — `owner` and `admin` are
  treated as "超管" for key-management purposes (see §5.4). No schema change.

### 3.2 New column
- `users.currentOrganizationId` (`uuid`, nullable, FK → `organizations.id`, `ON DELETE SET
  NULL`) — persists which team is "current" for a user across sessions, per memo §3.3.

### 3.3 New table — `team_new_api_mapping`
```
organization_id   uuid PK, FK -> organizations.id, ON DELETE CASCADE
new_api_user_id   integer NOT NULL, unique
new_api_username  varchar(64) NOT NULL          -- for debugging/support only
new_api_password_ciphertext  text NOT NULL      -- AES-GCM; needed to re-login and remint the PAT if it's ever lost
new_api_pat_ciphertext  text NOT NULL           -- AES-GCM; see §5.2 — confirmed required, not optional
created_at / updated_at
```
1:1 with `organizations`. §5.2 confirms new-api's token routes are self-scoped, so every
team needs its own new-api PAT here — this column is **not** conditional.

### 3.4 Extended table — `apiKeys`
Add:
```
new_api_token_id         integer            -- new-api's token id for this key
new_api_key_ciphertext   text NOT NULL       -- AES-256-GCM ciphertext of the real "sk-..." from new-api
is_studio_hidden         boolean NOT NULL DEFAULT false   -- true = auto-provisioned Studio token, not user-manageable
```
Drop (billing-engine-specific, no longer meaningful once new-api owns quota):
```
quota_limit_microcredits
```
Keep but **unenforced in v1** (reserved for future use, not read by the proxy):
`scopes`, `allowed_models`, `allowed_groups`, `ip_allowlist`.

`key_prefix` / `key_hash` keep their existing meaning: `key_hash` = SHA-256 of the full
virtual key, `key_prefix` = first chars for list-view display. The virtual key plaintext
is still shown exactly once at creation, never stored.

### 3.5 Dropped tables (billing engine, gateway-only, or unused post-cutover)
`wallets`, `wallet_ledger_entries`, `usage_events`, `api_key_quota_ledger_entries`,
`billing_shadow_events`, `gateway_relay_attempts`, `billing_profiles`,
`api_key_billing_policies`, `pricing_catalog_versions`, `pricing_model_rules`,
`pricing_group_rules`, `model_availability`, `subscription_plans`, `subscriptions`,
`subscription_quota_states`, `subscription_quota_ledger_entries`, `payment_providers`,
`payment_orders`, `enterprise_billing_requests`, `channels`.

Kept, unrelated to billing: `personalityPresets`, `toolPresets`, `authIdentities`.

This is a single forward-only drizzle migration. Take a `pg_dump` of the production DB
immediately before running it on `176.122.164.148`, even though the data itself is
disposable — cheap insurance against an unrelated table being dropped by mistake.

## 4. new-api adapter (server-only)

New module, e.g. `src/lib/newapi/client.ts` — the **only** place in the codebase allowed
to call new-api's HTTP API. Everything else goes through it.

Functions (mapped to endpoints confirmed in `E:\CodeCode\new-api\router\api-router.go` /
`controller/user.go` / `controller/token.go`):

| Function | new-api endpoint | Auth |
|---|---|---|
| `createUser({username, password, displayName})` | `POST /api/user/` | global admin PAT |
| `disableUser(newApiUserId)` (compensation only) | `POST /api/user/manage` `{id, action:"disable"}` | global admin PAT |
| `addQuota(newApiUserId, amount)` | `POST /api/user/manage` `{id, action:"add_quota", mode:"add", value:amount}` | global admin PAT |
| `getUserQuota(newApiUserId)` | `GET /api/user/:id` | global admin PAT |
| `loginAndMintPat(username, password)` | `POST /api/user/login` then `GET /api/user/self/token` | the team new-api user's own credentials (session cookie carried between the two calls) |
| `createToken(name)` | `POST /api/token/` | **team PAT** (`team_new_api_mapping.new_api_pat_ciphertext`) |
| `fetchTokenKey(tokenId)` | `POST /api/token/:id/key` | **team PAT** |
| `revokeToken(tokenId)` | `DELETE /api/token/:id` | **team PAT** |
| `getTokenUsage(tokenSk, range)` | `GET /api/log/token` or `GET /api/usage/token/` | the token's own `sk-` as bearer (`middleware.TokenAuthReadOnly()` — decrypt `new_api_key_ciphertext` server-side) |

Auth token for the "global admin PAT" rows: `NEW_API_ADMIN_TOKEN` env var, a Personal
Access Token generated once for a dedicated new-api admin/root account
(`GET /api/user/self/token` on that account), sent as `Authorization: Bearer <token>`.

`ManageRequest` shape confirmed in `controller/user.go` (`type ManageRequest struct { Id
int; Action string; Value int; Mode string }`); valid `Action` values include `disable`,
`enable`, `delete`, `promote`, `demote`, `add_quota` (with `Mode` `add`/`subtract`/`override`).

## 5. Registration & key lifecycle

### 5.1 Registration transaction (new-api-first, per decision)

```
1. POST new-api create user (role=common, generate a random password)  -> new_api_user_id
2. POST new-api login as that user (username + the generated password) -> session cookie
3. GET  new-api /api/user/self/token (same session)                    -> new-api PAT
4. Using that team PAT: POST new-api create token "studio"             -> new_api_token_id
5. Using that team PAT: POST new-api fetch token key                   -> sk-...
6. BEGIN local Postgres transaction:
     insert users
     insert organizations (default team, name = user's display name)
     insert organization_memberships (role='owner')
     insert team_new_api_mapping (
       organization_id, new_api_user_id, new_api_username,
       new_api_password_ciphertext = AES-GCM(generated password),
       new_api_pat_ciphertext = AES-GCM(pat from step 3)
     )
     insert api_keys (is_studio_hidden=true, new_api_token_id, new_api_key_ciphertext = AES-GCM(sk))
     update users.current_organization_id
   COMMIT
7. On step 6 failure: best-effort call new-api (global admin PAT) to disable the user
   created in step 1. If that compensation call also fails, log loudly (structured log +
   alert) — an orphaned new-api account is an accepted, rare failure mode per product
   decision, not something the transaction blocks on.
```
Registration fails (HTTP error to the client) if steps 1–5 fail. It also fails if step 6
fails, after best-effort compensation.

The generated new-api password (step 1) is stored encrypted (step 6) so the team PAT can
be re-minted later if it's ever lost — the team's new-api login is otherwise never exposed
to the user; they only ever interact with Reizo's own session.

### 5.2 Resolved — new-api token API scoping (verified against source, 2026-08-11)

Confirmed by reading `E:\CodeCode\new-api`:

- `router/api-router.go` (`tokenRoute := apiRouter.Group("/token")`, `tokenRoute.Use(middleware.UserAuth())`)
  — all token CRUD routes require only `UserAuth`, not `AdminAuth`/`RootAuth`, and take
  **no user-id parameter**.
- `controller/token.go` — every handler (`GetAllTokens`, `GetToken`, `AddToken`,
  `DeleteToken`, `UpdateToken`, batch variants) resolves the target user via
  `userId := c.GetInt("id")`, which `middleware/auth.go` sets from **whoever the calling
  credential belongs to** (`classifyDashboardCredential` → `model.ValidateAccessToken(raw)`
  for a PAT, or the live session for a cookie). There is no admin-impersonation path.
- `controller/user.go` `GenerateAccessToken` (the `/api/user/self/token` PAT-mint
  endpoint) is likewise `id := c.GetInt("id")` — self-scoped only. An admin PAT cannot
  mint another user's PAT either; the only way to get a team's PAT is to authenticate
  **as** that team's new-api user at least once.

**Conclusion: Path B is required, not optional.** Token create/list/revoke and PAT
minting must be done with each team's own new-api PAT — hence §3.3's
`new_api_pat_ciphertext` (and `new_api_password_ciphertext`, needed to re-mint the PAT if
it's ever lost) are mandatory columns, not conditional ones. The global
`NEW_API_ADMIN_TOKEN` is used only for the two routes confirmed under `adminRoute`:
user creation (`POST /api/user/`) and quota/status management (`POST /api/user/manage`).

One operational item to check before relying on the login step (§5.1 step 2): `POST
/api/user/login` runs through `middleware.TurnstileCheck()`, which is a no-op unless
`common.TurnstileCheckEnabled` is set — confirm this is off for the account used in
automated registration (or that a valid bypass exists) before implementation, by checking
the `turnstile_check_enabled` value in new-api's `options` table on `15.204.82.213`.

### 5.3 Virtual key CRUD (team admins only)

- Create: decrypt the team's `new_api_pat_ciphertext` → `createToken` (new-api) →
  `fetchTokenKey` → generate Reizo-side `sk-` (**the
  user-facing virtual key, independent random string, not new-api's own key material** —
  per memo §4.1, must not be derivable from a fixed secret + userId) → store
  `key_hash = sha256(virtual_sk)`, `new_api_key_ciphertext = AES-GCM(new_api_sk)` → return
  virtual `sk-` to the client once, never store plaintext.
- Revoke: mark `api_keys.status = 'revoked'`, `revoked_at = now()`; best-effort revoke the
  underlying new-api token too (not launched in critical path — a revoked local key stops
  working at the proxy layer regardless of new-api-side state).
- List: standard query scoped to `organization_id`, no need to touch new-api.

### 5.4 Authorization

Only `organization_memberships.role IN ('owner', 'admin')` may create/revoke virtual keys
for their current organization. Enforced in the route handler, same pattern as existing
`src/app/api/console/*` routes.

## 6. Proxy — `/v1/*`

New Next.js route handler, e.g. `src/app/api/v1/[...path]/route.ts`, replacing
`services/gateway`'s relay responsibility entirely:

1. Extract `Authorization: Bearer sk-...`.
2. `sha256` it, look up `api_keys` by `key_hash`; reject if missing, `status != 'active'`,
   or `expires_at` in the past.
3. Decrypt `new_api_key_ciphertext` (AES-256-GCM, key from `REIZO_TOKEN_ENCRYPTION_KEY`).
4. Forward the request verbatim to `${NEW_API_URL}/v1/<path>` with
   `Authorization: Bearer <decrypted new-api sk>`, streaming the response body straight
   through (SSE-compatible passthrough — Next.js Route Handlers support
   `ReadableStream` responses).
5. Fire-and-forget update `api_keys.last_used_at`.
6. Propagate new-api's error responses/status codes unchanged (no re-wrapping).

Studio's internal LLM calls (`src/lib/agent/provider/gateway.ts` today) get repointed to
call new-api the same way, using the team's hidden Studio token
(`api_keys.is_studio_hidden = true` row for `users.current_organization_id`) — either by
calling this same proxy internally or by sharing the decrypt-and-forward helper directly
(avoids an extra network hop for server-to-server Studio calls; final choice left to the
implementer, both are equivalent in behavior).

## 7. Observability (team admin view)

- Total balance / total usage: `getUserQuota(mapping.new_api_user_id)` →
  `quota`/`used_quota`.
- Per-key usage: for each `api_keys` row, decrypt its new-api sk server-side, call
  `getTokenUsage`. Cache/batch this — do not do N synchronous new-api calls per page
  load if N is large; a short-TTL in-memory or Redis cache is acceptable for v1.
- Studio usage: same call, filtered to the `is_studio_hidden` key's token — shown as a
  distinct line item, not summed silently into "keys".

## 8. Env vars

```
NEW_API_URL=https://v2api.top                # or internal address if one becomes available
NEW_API_ADMIN_TOKEN=...                      # PAT of a dedicated new-api admin account, server-only
REIZO_TOKEN_ENCRYPTION_KEY=...               # 32-byte key for AES-256-GCM, base64 or hex
```
`REIZO_GATEWAY_*` variables are retired along with the gateway (see §9).

## 9. Decommissioning `services/gateway`

Confirmed safe to drop with no compatibility shim (user decision — nothing else in
production depends on it that isn't covered by this redesign).

Touch points found in `src/` referencing the gateway (6 files, all to be repointed to the
new-api adapter/proxy instead of deleted outright, since they implement real product
surface, not gateway-specific glue):
`src/lib/studio/capabilities.server.ts`, `src/lib/gateway-admin/server.ts`,
`src/lib/agent/provider/gateway.ts` (+ its `.test.ts`), `src/lib/agent/provider/ai-sdk.test.ts`,
`src/app/api/catalog/plaza/route.ts`.

Also remove once the cutover is live: `src/app/gateway-admin/**`,
`src/app/api/gateway-admin/**`, `scripts/migrate-new-api.ts` +
`docs/MIGRATE_NEW_API.md` (obsolete, opposite-direction migration), and eventually the
`services/gateway` directory itself + its systemd unit on `176.122.164.148` (unit name
not yet confirmed — inspect with `systemctl list-units | grep -i gateway` on that host
before removing; don't assume the name).

Suggested order: (1) ship the new-api-backed proxy + registration flow behind the
existing code paths, (2) verify end-to-end on the box, (3) flip Studio + `/v1/*` traffic
over, (4) stop and disable the gateway systemd service, (5) delete gateway code and the
old billing schema/migration script in a follow-up commit once nothing references them.

## 10. Risks / things the implementer must not skip

1. **§5.2 token-scoping — resolved, Path B.** Every team needs its own new-api PAT
   (minted via a real login as that team's new-api user). Don't try to shortcut this with
   the global admin PAT for token operations — verified against source that it won't work.
2. **AES-GCM key handling** — `REIZO_TOKEN_ENCRYPTION_KEY` must never be logged, and a
   missing/rotated key silently breaks every stored `new_api_key_ciphertext`. No rotation
   mechanism in v1 — document this limitation, don't build key rotation now (non-goal).
3. **Streaming passthrough correctness** — SSE responses from new-api must not be
   buffered by the Route Handler; verify with a real streaming chat completion, not just
   a non-streaming request.
4. **Destructive migration** — the schema migration in §3.5 drops tables. `pg_dump` first
   on `176.122.164.148` even though data loss is accepted in principle.
5. **Compensation is best-effort, not guaranteed** — orphaned new-api accounts on local-tx
   failure are an accepted risk, not a bug to "fix" by adding retry/saga machinery (that
   would be scope creep beyond what was asked for).
