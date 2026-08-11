# Reizo Go Gateway Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Fastify Gateway with a Go service that preserves the current HTTP contract and implements new-api-compatible pricing, usage normalization, pre-consumption, settlement, refund, subscription fallback, API-key quota, shadow reconciliation, and durable recovery.

**Architecture:** Keep Drizzle as the single schema/migration owner because the Next.js control plane already consumes that schema, while the Go process uses `pgx` repositories against the same PostgreSQL database. Split the Go service into transport, identity, relay, usage, pricing, billing, storage, importer, and observability modules; freeze a price quote before relay and pass one billing operation through every retry and terminal path. Ship in three runnable increments: Go transport with billing off, shadow calculation with imported pricing, then authoritative mutation after reconciliation and single-owner checks.

**Tech Stack:** Go 1.25.1, standard `net/http`, `pgx/v5`, `shopspring/decimal`, `expr-lang/expr`, `tiktoken-go/tokenizer`, Prometheus client, PostgreSQL 16, Drizzle Kit, Go `testing`/`httptest`, Vitest only for unchanged Next.js callers.

---

## Source References And Locked Boundaries

Implement calculation semantics from these owned new-api sources, adapting their inputs and persistence rather than importing the whole application:

- `E:/CodeCode/new-api/relay/helper/price.go`: lookup precedence, group ratios, pre-consumption, unpriced-model behavior.
- `E:/CodeCode/new-api/service/text_quota.go`: text, cache, image, audio, tool-call, fixed-price, and minimum-quota settlement.
- `E:/CodeCode/new-api/service/billing_session.go`: one billing session shared across relay attempts.
- `E:/CodeCode/new-api/service/billing.go`: settlement delta behavior.
- `E:/CodeCode/new-api/service/wallet_fallback_billing.go`: subscription/wallet preference and fallback.
- `E:/CodeCode/new-api/service/quota.go`: API-key quota and final accounting order.
- `E:/CodeCode/new-api/setting/ratio_setting/model_ratio.go`: model normalization and wildcard behavior.
- `E:/CodeCode/new-api/setting/ratio_setting/cache_ratio.go`: cache ratio defaults and overrides.
- `E:/CodeCode/new-api/pkg/billingexpr/`: expression compilation, request functions, snapshots, and rounding.
- `E:/CodeCode/new-api/service/token_estimator.go`, `token_counter.go`, and `usage_helpr.go`: missing-usage fallback.
- `E:/CodeCode/new-api/relay/compatible_handler.go`, `responses_handler.go`, and `claude_handler.go`: terminal usage and stream behavior.

The following boundaries are fixed for this implementation:

- Auth.js and browser session cookies stay in Next.js.
- Go accepts only a valid internal token plus user ID for Studio identity, or a native Reizo API key for external identity.
- Drizzle generates PostgreSQL migrations; Go never creates or alters tables at runtime.
- `off` performs no billing writes; `shadow` writes only `billing_shadow_events`; `authoritative` is the only mode that writes quota and ledgers.
- Go authoritative mode cannot start without `REIZO_GATEWAY_BILLING_OWNER=go` and an upstream ownership declaration of `provider` or `non_charging_new_api`.
- No request body, generated content, raw API key, upstream credential, DSN, or arbitrary upstream error body is stored in billing metadata or logs.

## Target File Map

### Go process and configuration

- Create `services/gateway/go.mod` and `services/gateway/go.sum`: isolated Go module and pinned parity dependencies.
- Create `services/gateway/cmd/gateway/main.go`: process lifecycle, startup validation, and graceful shutdown.
- Create `services/gateway/internal/config/config.go` and `config_test.go`: environment parsing for listeners, upstreams, billing mode, database, recovery, and limits.
- Create `services/gateway/internal/observability/logging.go` and `metrics.go`: redacted structured logging and Prometheus metrics.

### HTTP, identity, and relay

- Create `services/gateway/internal/httpapi/routes.go`, `errors.go`, `cors.go`, `body_store.go`, `server.go`, and focused tests: the Fastify-compatible public and operational contract.
- Create `services/gateway/internal/identity/types.go`, `service.go`, and tests: internal-token primitives and identity policy; PostgreSQL lookup stays in storage.
- Create `services/gateway/internal/relay/types.go`, `headers.go`, `static_selector.go`, `client.go`, `retry.go`, `stream.go`, and tests: configured upstream relay, safe headers, streaming, attempts, and the future `ChannelSelector` seam.

### Usage and pricing

- Create `services/gateway/internal/usage/types.go`, `registry.go`, `request.go`, `counter.go`, `openai.go`, `anthropic.go`, `media.go`, and tests: canonical usage plus request/output fallback.
- Create `services/gateway/internal/pricing/types.go`, `matcher.go`, `catalog.go`, `engine.go`, `tiered.go`, `tools.go`, and tests: frozen quotes and new-api-compatible integer quota results.
- Create `services/gateway/testdata/newapi-parity.json`: deterministic expected results transcribed from new-api tests and sanitized production pricing cases.

### PostgreSQL, billing, and imports

- Modify `src/lib/platform/db/schema.ts` and `src/lib/platform/types.ts`: native pricing, billing policy, subscription quota, shadow, attempt, and recovery state.
- Create `drizzle/0003_go_gateway_billing.sql`, `drizzle/meta/0003_snapshot.json`, and modify `drizzle/meta/_journal.json`: generated migration artifacts.
- Create `services/gateway/internal/storage/postgres.go`, `catalog.go`, `identity.go`, `billing.go`, `shadow.go`, `recovery.go`, and integration tests: all SQL ownership.
- Create `services/gateway/internal/billing/types.go`, `policy.go`, `service.go`, `recovery.go`, and tests: reserve, settle, reverse, idempotency, fallback, and recovery orchestration.
- Create `services/gateway/cmd/pricing-import/main.go` and `internal/importer/{types,newapi,sanitize,import}.go` with tests: dry-run-by-default catalog import.
- Create `services/gateway/compose.test.yml` and `scripts/test-go-gateway-integration.ps1`: repeatable PostgreSQL integration environment.

### Cutover and cleanup

- Modify `package.json`, `package-lock.json`, `.gitignore`, `.env.example`, `services/gateway/README.md`, `docs/DEPLOY.md`, `.github/workflows/deploy.yml`, and `scripts/package-standalone.mjs`: Go build/run/deploy instructions, ignored local binaries, and safety gates.
- Delete `services/gateway/src/` only after the Go contract suite passes.
- Create `.github/workflows/gateway.yml`: format, unit, race, build, and PostgreSQL integration checks.

## Phase 1: Go Transport With Billing Off

### Task 1: Bootstrap The Go Module And Strict Configuration

**Files:**
- Create: `services/gateway/go.mod`
- Create: `services/gateway/go.sum`
- Create: `services/gateway/internal/config/config.go`
- Create: `services/gateway/internal/config/config_test.go`

- [ ] **Step 1: Write failing configuration tests**

Cover defaults, explicit upstreams, no `NEW_API_URL` fallback, invalid URLs, three billing modes, and authoritative ownership guards:

```go
func TestLoadDoesNotUseNewAPIURL(t *testing.T) {
	t.Setenv("NEW_API_URL", "https://retired.example")
	cfg, err := Load()
	require.NoError(t, err)
	require.Empty(t, cfg.Upstreams)
}

func TestValidateRejectsUnsafeAuthoritativeMode(t *testing.T) {
	cfg := Config{BillingMode: BillingAuthoritative, DatabaseURL: "postgres://db", InternalToken: "secret"}
	err := cfg.Validate()
	require.ErrorContains(t, err, "REIZO_GATEWAY_BILLING_OWNER=go")
}
```

- [ ] **Step 2: Run the tests and confirm the package does not exist**

Run: `go -C services/gateway test ./internal/config -run 'TestLoad|TestValidate' -v`

Expected: FAIL because `go.mod` and `internal/config` do not exist.

- [ ] **Step 3: Add the module and configuration types**

Pin dependency versions already used by new-api where parity matters:

```go
module reizo/services/gateway

go 1.25.1

require (
	github.com/expr-lang/expr v1.17.8
	github.com/google/uuid v1.6.0
	github.com/jackc/pgx/v5 v5.9.2
	github.com/prometheus/client_golang v1.22.0
	github.com/shopspring/decimal v1.4.0
	github.com/stretchr/testify v1.11.1
	github.com/tiktoken-go/tokenizer v0.6.2
)
```

Define exact modes and ownership values:

```go
type BillingMode string

const (
	BillingOff           BillingMode = "off"
	BillingShadow        BillingMode = "shadow"
	BillingAuthoritative BillingMode = "authoritative"
)

type UpstreamOwnership string

const (
	OwnershipProvider          UpstreamOwnership = "provider"
	OwnershipNonChargingNewAPI UpstreamOwnership = "non_charging_new_api"
)
```

`Load` must preserve the current `REIZO_GATEWAY_<FAMILY>_UPSTREAM_URL` and credential names, default to `127.0.0.1:4010`, a 50 MiB request limit, loopback trusted proxies, and `shadow` billing. `Validate` must reject unknown modes, missing database/internal token in shadow or authoritative mode, an empty recovery directory in authoritative mode, and unsafe ownership declarations.

- [ ] **Step 4: Format, tidy, and run tests**

Run: `go -C services/gateway fmt ./internal/config && go -C services/gateway mod tidy && go -C services/gateway test ./internal/config -v`

Expected: PASS and `go.sum` is created.

- [ ] **Step 5: Commit the bootstrap**

```bash
git add services/gateway/go.mod services/gateway/go.sum services/gateway/internal/config
git commit -m "feat(gateway): bootstrap Go runtime configuration"
```

### Task 2: Port Route Catalog, Operational Endpoints, CORS, And Errors

**Files:**
- Create: `services/gateway/internal/httpapi/routes.go`
- Create: `services/gateway/internal/httpapi/errors.go`
- Create: `services/gateway/internal/httpapi/cors.go`
- Create: `services/gateway/internal/httpapi/server.go`
- Create: `services/gateway/internal/httpapi/server_test.go`

- [ ] **Step 1: Write contract tests from the Fastify suite**

Port every test name from `services/gateway/src/server.test.ts` and add aliases for `/health` and `/ready`. Assert the existing envelope exactly:

```go
type ErrorBody struct {
	Error struct {
		Type    string `json:"type"`
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
	RequestID string `json:"request_id"`
}

func TestUnconfiguredFamilyReturns501(t *testing.T) {
	s := NewServer(TestDependencies())
	r := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"gpt-4o-mini"}`))
	r.Header.Set("Authorization", "Bearer wl_test")
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	require.Equal(t, http.StatusNotImplemented, w.Code)
	require.Contains(t, w.Body.String(), `"code":"protocol_not_configured"`)
}
```

- [ ] **Step 2: Run the HTTP package and confirm failure**

Run: `go -C services/gateway test ./internal/httpapi -v`

Expected: FAIL because the HTTP package is incomplete.

- [ ] **Step 3: Implement the explicit route catalog**

Represent the current precedence without a catch-all that can accidentally expose a route:

```go
var PublicRoutes = []Route{
	{ID: "openai-images", Family: "images", Prefixes: []string{"/v1/images"}},
	{ID: "openai-audio", Family: "audio", Prefixes: []string{"/v1/audio"}},
	{ID: "openai-embeddings", Family: "embeddings", Prefixes: []string{"/v1/embeddings"}},
	{ID: "openai-realtime", Family: "realtime", Prefixes: []string{"/v1/realtime"}},
	{ID: "claude-messages", Family: "claude", Prefixes: []string{"/v1/messages", "/anthropic/v1/messages"}},
	{ID: "gemini-models", Family: "gemini", Prefixes: []string{"/v1beta/models", "/gemini/v1beta/models"}},
	{ID: "midjourney", Family: "midjourney", Prefixes: []string{"/mj", "/midjourney"}},
	{ID: "suno", Family: "suno", Prefixes: []string{"/suno"}},
	{ID: "video", Family: "video", Prefixes: []string{"/video", "/videos", "/v1/video", "/v1/videos"}},
	{ID: "tasks", Family: "task", Prefixes: []string{"/api/task", "/api/tasks", "/api/async", "/api/queue", "/v1/tasks", "/v1/jobs"}},
	{ID: "openai", Family: "openai", Prefixes: []string{"/v1"}},
}
```

Accept only `GET`, `POST`, `PUT`, `PATCH`, and `DELETE`; give operational routes their own handlers; preserve valid inbound `x-request-id` values and otherwise generate UUIDs.

- [ ] **Step 4: Implement CORS and readiness semantics**

Allow an origin only when it is in `REIZO_GATEWAY_CORS_ORIGINS`, set `Vary: Origin`, handle preflight without authentication, return liveness regardless of upstream state, and return readiness `503` until a configured relay and required billing dependencies are ready.

- [ ] **Step 5: Run focused HTTP tests**

Run: `go -C services/gateway test ./internal/httpapi -run 'TestHealth|TestReady|TestCapabilities|TestCORS|TestUnconfigured' -v`

Expected: PASS.

- [ ] **Step 6: Commit the HTTP shell**

```bash
git add services/gateway/internal/httpapi
git commit -m "feat(gateway): port HTTP route contract"
```

### Task 3: Port Authentication And Header Security

**Files:**
- Create: `services/gateway/internal/identity/types.go`
- Create: `services/gateway/internal/identity/service.go`
- Create: `services/gateway/internal/identity/service_test.go`
- Create: `services/gateway/internal/relay/headers.go`
- Create: `services/gateway/internal/relay/headers_test.go`

- [ ] **Step 1: Write authentication and redaction tests**

Port all assertions from `auth.test.ts` and the sensitive-header section of `server.test.ts`. Include a constant-time internal-token check, `Authorization: Bearer`, `x-api-key`, and rejection of browser-controlled identity headers.

```go
func TestStudioIdentityRequiresInternalToken(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	r.Header.Set("New-Api-User", "attacker")
	r.Header.Set("x-reizo-internal-user-id", "user-1")
	_, err := AuthenticateStudio(r, "server-secret")
	require.ErrorIs(t, err, ErrUnauthorized)
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `go -C services/gateway test ./internal/identity ./internal/relay -run 'TestStudio|TestAPIKey|TestHeaders' -v`

Expected: FAIL because the implementation is absent.

- [ ] **Step 3: Implement identity primitives**

Use SHA-256 only as the existing lookup digest and never retain the raw key after lookup:

```go
type Identity struct {
	Source         Source
	UserID         uuid.UUID
	APIKeyID       *uuid.UUID
	OrganizationID *uuid.UUID
	APIKeyDisplay  string
}

func HashAPIKey(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
```

Compare the internal token with `subtle.ConstantTimeCompare`; validate the user ID as UUID; accept legacy internal user aliases only after token validation; never read `New-Api-User` or `x-reizo-user` as authentication.

- [ ] **Step 4: Implement the exact header allow/block policy**

Port `HOP_BY_HOP`, `REQUEST_BLOCKED`, and `RESPONSE_BLOCKED` from `services/gateway/src/headers.ts`. Strip connection-scoped headers, caller authorization, cookies, forwarding headers, all internal Reizo identity headers, CR/LF values, and values over 16 KiB. Inject configured upstream authorization and only the server-validated `new-api-user` identity when that compatibility header is required.

- [ ] **Step 5: Run package tests and race tests**

Run: `go -C services/gateway test -race ./internal/identity ./internal/relay -v`

Expected: PASS.

- [ ] **Step 6: Commit authentication and header filtering**

```bash
git add services/gateway/internal/identity services/gateway/internal/relay/headers.go services/gateway/internal/relay/headers_test.go
git commit -m "feat(gateway): port identity and header security"
```

### Task 4: Implement Bounded Body Storage And Streaming Relay

**Files:**
- Create: `services/gateway/internal/httpapi/body_store.go`
- Create: `services/gateway/internal/httpapi/body_store_test.go`
- Create: `services/gateway/internal/relay/types.go`
- Create: `services/gateway/internal/relay/static_selector.go`
- Create: `services/gateway/internal/relay/client.go`
- Create: `services/gateway/internal/relay/stream.go`
- Create: `services/gateway/internal/relay/client_test.go`

- [ ] **Step 1: Write body, proxy, query, multipart, and disconnect tests**

The store must retain small bodies in memory, spill larger bodies to an owner-only temporary file, reopen them for retries, enforce 50 MiB, and delete the file on close. Relay tests must use `httptest.Server` and verify byte-for-byte bodies, query strings, immediate SSE flushing, upstream errors, and cancellation only on a real client disconnect.

- [ ] **Step 2: Run tests and confirm failure**

Run: `go -C services/gateway test ./internal/httpapi ./internal/relay -run 'TestBodyStore|TestProxy|TestStream|TestDisconnect' -v`

Expected: FAIL because storage and relay are not implemented.

- [ ] **Step 3: Define the future-proof relay seam**

```go
type Channel struct {
	ID            string
	Family        string
	BaseURL       *url.URL
	Authorization string
	Headers       http.Header
	RawType       int
}

type AttemptHistory []Attempt

type ChannelSelector interface {
	Select(context.Context, Request, AttemptHistory) (Channel, error)
}
```

`StaticSelector` maps each protocol family to exactly one environment-backed `Channel`. It returns `ErrNoChannel` for an unconfigured family and does not contain billing logic.

- [ ] **Step 4: Implement request relay and streaming observation**

Build upstream URLs with `url.URL`, preserve `RawQuery`, set `Host` from the upstream URL, use a shared tuned `http.Transport`, and never use the default client without timeouts. The response copier must flush each SSE frame, call an `Observer.Observe` hook before writing downstream, and call `Observer.Complete` exactly once with status, headers, byte count, EOF/error, and client-disconnect state.

- [ ] **Step 5: Run relay tests with the race detector**

Run: `go -C services/gateway test -race ./internal/httpapi ./internal/relay -v`

Expected: PASS with no races or leaked temporary files.

- [ ] **Step 6: Commit the zero-billing relay**

```bash
git add services/gateway/internal/httpapi/body_store* services/gateway/internal/relay
git commit -m "feat(gateway): add bounded streaming relay"
```

### Task 5: Wire The Go Process In `off` Mode

**Files:**
- Create: `services/gateway/cmd/gateway/main.go`
- Create: `services/gateway/cmd/gateway/main_test.go`
- Create: `services/gateway/internal/observability/logging.go`
- Modify: `package.json`
- Modify: `services/gateway/README.md`

- [ ] **Step 1: Write process assembly and shutdown tests**

Inject configuration and listeners so the test can assert startup, `/healthz`, `/readyz`, signal cancellation, and non-zero exit on invalid config without opening port 4010.

- [ ] **Step 2: Run the entrypoint tests and verify failure**

Run: `go -C services/gateway test ./cmd/gateway -v`

Expected: FAIL because `run` is undefined.

- [ ] **Step 3: Assemble the server with explicit dependencies**

```go
func run(ctx context.Context, cfg config.Config, ln net.Listener) error {
	logger := observability.NewLogger(os.Stdout)
	selector := relay.NewStaticSelector(cfg.Upstreams)
	server := httpapi.NewServer(httpapi.Dependencies{
		Config: cfg, Logger: logger, Selector: selector,
		Billing: billing.NewOffService(),
	})
	return httpapi.Serve(ctx, ln, server, 15*time.Second)
}
```

The logger must have typed fields and no generic header/body dumping. `off` mode must authenticate and relay but never open a billing transaction or write a shadow event.

- [ ] **Step 4: Point development scripts at Go without deleting Fastify yet**

Set:

```json
{
  "gateway:dev": "go -C services/gateway run ./cmd/gateway",
  "test:gateway": "go -C services/gateway test ./..."
}
```

Keep `gateway:start` until the production binary task so existing deployment instructions are not temporarily broken.

- [ ] **Step 5: Run the local contract smoke test**

Run: `$env:REIZO_GATEWAY_BILLING_MODE='off'; $env:REIZO_GATEWAY_OPENAI_UPSTREAM_URL='http://127.0.0.1:9'; go -C services/gateway run ./cmd/gateway`

In a second terminal run: `curl.exe -fsS http://127.0.0.1:4010/healthz`

Expected: `{"status":"ok"}`. Stop the process with Ctrl+C and confirm graceful shutdown.

- [ ] **Step 6: Commit the runnable Go process**

```bash
git add services/gateway/cmd services/gateway/internal/observability package.json services/gateway/README.md
git commit -m "feat(gateway): run Go transport in billing off mode"
```

## Phase 2: Native Pricing And Shadow Billing

### Task 6: Add The Native Pricing And Billing Schema

**Files:**
- Modify: `src/lib/platform/db/schema.ts`
- Modify: `src/lib/platform/types.ts`
- Create: `drizzle/0003_go_gateway_billing.sql`
- Create: `drizzle/meta/0003_snapshot.json`
- Modify: `drizzle/meta/_journal.json`

- [ ] **Step 1: Add schema-shape tests before changing the schema**

Create `src/lib/platform/db/gateway-schema.test.ts` that asserts exported table names and required enum values, especially `settlement_pending`:

```ts
expect(USAGE_EVENT_STATUSES).toEqual([
  "reserved", "settlement_pending", "settled", "reversed", "failed",
]);
expect(getTableName(pricingCatalogVersions)).toBe("pricing_catalog_versions");
expect(getTableName(billingShadowEvents)).toBe("billing_shadow_events");
```

- [ ] **Step 2: Run the schema test and verify failure**

Run: `npm test -- src/lib/platform/db/gateway-schema.test.ts`

Expected: FAIL because the new exports do not exist.

- [ ] **Step 3: Add enums and pricing tables**

Add enums for catalog state (`draft`, `active`, `retired`), price mode (`ratio`, `fixed`, `tiered_expr`), funding preference (`subscription_first`, `wallet_first`, `subscription_only`, `wallet_only`), and subscription ledger entry type (`hold`, `release`, `debit`, `refund`, `reset`, `adjustment`).

Add:

- `pricing_catalog_versions` with unique `source_hash`, numeric `quota_per_unit`, `pre_consumed_tokens`, algorithm version, sanitized JSON snapshot, and a partial unique index for one active row.
- `pricing_model_rules` unique on `(catalog_version_id, model_key)`, with all ratios/prices, tiered expression/hash/version, tool prices, protocol families, and rule hash.
- `pricing_group_rules` unique on `(catalog_version_id, user_group, billing_group)`.
- `model_availability` unique on `(catalog_version_id, model, billing_group, provider_type)` and no credential/base-URL columns.

- [ ] **Step 4: Add billing policy and audit tables**

Add:

- `billing_profiles`, one row per user.
- `api_key_billing_policies`, one row per API key with group, unlimited flag, quota limit, and policy metadata.
- `api_key_quota_ledger_entries`, signed immutable quota entries with `(api_key_id, idempotency_key)` uniqueness.
- `subscription_quota_states`, one row per subscription with reset window, window/cumulative limits and counters.
- `subscription_quota_ledger_entries`, immutable entries with `(subscription_id, idempotency_key)` uniqueness.
- `billing_shadow_events`, indexed by request ID, model, outcome, mismatch class, and creation time.
- `gateway_relay_attempts`, unique on `(usage_event_id, attempt_number)`.

Extend `usage_events` with catalog ID, canonical usage/provenance JSON, completion state, stream end reason, funding kind/reference, reserved/actual quota, settlement attempt count, channel cost/profit, operation ID, completion snapshot timestamp, and `settlement_pending` status.

- [ ] **Step 5: Generate and inspect the migration**

Run: `npm run db:generate -- --name=go_gateway_billing`

Expected: creates `drizzle/0003_go_gateway_billing.sql`, `drizzle/meta/0003_snapshot.json`, and updates `_journal.json`. Inspect the SQL to ensure it only adds the intended enum value, tables, columns, indexes, constraints, and foreign keys; it must not drop existing data.

- [ ] **Step 6: Run schema and TypeScript checks**

Run: `npm test -- src/lib/platform/db/gateway-schema.test.ts && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 7: Commit the schema**

```bash
git add src/lib/platform/db/schema.ts src/lib/platform/types.ts src/lib/platform/db/gateway-schema.test.ts drizzle/0003_go_gateway_billing.sql drizzle/meta/0003_snapshot.json drizzle/meta/_journal.json
git commit -m "feat(db): add versioned gateway billing schema"
```

### Task 7: Define Canonical Usage And Request Estimation

**Files:**
- Create: `services/gateway/internal/usage/types.go`
- Create: `services/gateway/internal/usage/request.go`
- Create: `services/gateway/internal/usage/counter.go`
- Create: `services/gateway/internal/usage/request_test.go`
- Create: `services/gateway/internal/usage/counter_test.go`

- [ ] **Step 1: Write canonicalization and token-count tests**

Cover OpenAI messages, Responses input, Claude system/messages, tools, strings/arrays, malformed JSON, requested max output, OpenAI tokenizer selection, and non-OpenAI estimation.

- [ ] **Step 2: Run tests and verify failure**

Run: `go -C services/gateway test ./internal/usage -run 'TestEstimate|TestCount' -v`

Expected: FAIL because the usage package is absent.

- [ ] **Step 3: Define usage with explicit provenance**

```go
type Provenance string

const (
	Upstream       Provenance = "upstream"
	LocallyCounted Provenance = "locally_counted"
	RequestEstimate Provenance = "request_estimate"
	ProviderCost   Provenance = "provider_cost"
	Derived        Provenance = "derived"
)

type Canonical struct {
	RawInputTokens       int64
	TextInputTokens      int64
	TextOutputTokens     int64
	ReasoningTokens      int64
	CacheReadTokens      int64
	CacheWriteTokens     int64
	CacheWrite5mTokens   int64
	CacheWrite1hTokens   int64
	ImageInputTokens     int64
	ImageOutputTokens    int64
	AudioInputTokens     int64
	AudioOutputTokens    int64
	Calls                map[string]int64
	DurationMilliseconds int64
	ProviderCostUSD      decimal.Decimal
	Fields               map[string]Provenance
	Complete             bool
	TerminalEvent        string
}
```

`TextInputTokens` is the normalized base input after subtracting cache/media subcategories only when the source protocol reports a total that includes them. Preserve `RawInputTokens` so audit metadata can explain the subtraction.

- [ ] **Step 4: Port new-api request estimation rules**

Use `tiktoken-go/tokenizer` for OpenAI text models and new-api's model-family estimator for Claude, Gemini, Grok, and unknown models. Return `Estimate{PromptTokens, MaxOutputTokens, Model, Protocol}` and never mutate the relayed request body.

- [ ] **Step 5: Run usage tests and format**

Run: `go -C services/gateway fmt ./internal/usage && go -C services/gateway test ./internal/usage -v`

Expected: PASS.

- [ ] **Step 6: Commit canonical usage primitives**

```bash
git add services/gateway/internal/usage
git commit -m "feat(gateway): add canonical usage and token estimation"
```

### Task 8: Normalize OpenAI, Responses, Grok, Images, And Audio

**Files:**
- Create: `services/gateway/internal/usage/registry.go`
- Create: `services/gateway/internal/usage/openai.go`
- Create: `services/gateway/internal/usage/media.go`
- Create: `services/gateway/internal/usage/openai_test.go`
- Create: `services/gateway/internal/usage/media_test.go`
- Create: `services/gateway/testdata/usage/openai/`

- [ ] **Step 1: Add sanitized response fixtures and failing tests**

Fixtures must include chat JSON, chat SSE terminal usage, SSE without usage, Responses JSON, Responses SSE, cached/reasoning details, xAI/Grok OpenAI-compatible usage, image token usage, image per-call output, transcription usage, speech duration, malformed SSE, and a disconnected partial stream.

- [ ] **Step 2: Run normalizer tests and verify failure**

Run: `go -C services/gateway test ./internal/usage -run 'TestOpenAI|TestResponses|TestGrok|TestImage|TestAudio' -v`

Expected: FAIL because the normalizers are absent.

- [ ] **Step 3: Implement the observer registry and OpenAI parsing**

```go
type Observer interface {
	Observe([]byte) error
	Complete(Completion) (Canonical, error)
}

type Factory interface {
	New(protocol string, contentType string, estimate Estimate) (Observer, error)
}
```

Parse non-stream JSON from a spillable temporary response store. Parse SSE incrementally with an explicit maximum event size, including usage-only terminal chunks. If upstream usage is absent, count emitted `choices[].delta.content`, Responses output text, and tool argument text locally while retaining request-estimated input provenance.

- [ ] **Step 4: Normalize Grok and media without double counting**

Route xAI/Grok OpenAI-compatible payloads through the OpenAI observer. Map `prompt_tokens_details.cached_tokens`, image/audio token details, `completion_tokens_details.reasoning_tokens`, image counts/sizes/quality, audio durations, and provider cost. Subtract cached/image/audio categories from base text only when the upstream total includes them.

- [ ] **Step 5: Run normalizer and race tests**

Run: `go -C services/gateway test -race ./internal/usage -v`

Expected: PASS, including a partial stream that produces locally counted output and `Complete=false`.

- [ ] **Step 6: Commit OpenAI-family usage normalization**

```bash
git add services/gateway/internal/usage services/gateway/testdata/usage/openai
git commit -m "feat(gateway): normalize OpenAI and Grok usage"
```

### Task 9: Normalize Native Anthropic Usage

**Files:**
- Create: `services/gateway/internal/usage/anthropic.go`
- Create: `services/gateway/internal/usage/anthropic_test.go`
- Create: `services/gateway/testdata/usage/anthropic/`

- [ ] **Step 1: Add Claude JSON and SSE fixtures**

Include `message_start`, content deltas, `message_delta`, `message_stop`, cache read, cache creation, 5-minute/1-hour cache creation, web-search count, missing terminal usage, malformed ordering, and client disconnect.

- [ ] **Step 2: Run Anthropic tests and verify failure**

Run: `go -C services/gateway test ./internal/usage -run TestAnthropic -v`

Expected: FAIL because the Anthropic observer is absent.

- [ ] **Step 3: Implement Claude usage merge semantics**

Keep `message_start.usage` as the initial snapshot, merge later non-zero fields from `message_delta.usage`, finalize on `message_stop`, and treat Claude `input_tokens` as uncached base input. Preserve separate 5-minute and 1-hour cache writes and set generic cache write to the larger valid aggregate instead of adding it twice.

- [ ] **Step 4: Implement missing-usage fallback**

When input usage is absent, use the request estimate; when output usage is absent, count emitted text locally. A disconnected stream with content returns a partial canonical usage; a response with zero billable units returns zero usage and explicitly marks `TerminalEvent`.

- [ ] **Step 5: Run all usage tests**

Run: `go -C services/gateway test -race ./internal/usage -v`

Expected: PASS.

- [ ] **Step 6: Commit Anthropic normalization**

```bash
git add services/gateway/internal/usage/anthropic* services/gateway/testdata/usage/anthropic
git commit -m "feat(gateway): normalize Anthropic usage"
```

### Task 10: Port Model Matching, Frozen Quotes, And Tiered Expressions

**Files:**
- Create: `services/gateway/internal/pricing/types.go`
- Create: `services/gateway/internal/pricing/matcher.go`
- Create: `services/gateway/internal/pricing/catalog.go`
- Create: `services/gateway/internal/pricing/tiered.go`
- Create: `services/gateway/internal/pricing/matcher_test.go`
- Create: `services/gateway/internal/pricing/tiered_test.go`

- [ ] **Step 1: Write matching and expression tests from new-api**

Cover exact fixed price before ratio, `gpt-4-gizmo-*`, `gpt-4o-gizmo-*`, Gemini thinking-budget wildcards, `*-openai-compact`, unpriced model rejection, request `header`/`param` functions, expression hash/version, tier crossing, and half-away-from-zero rounding.

- [ ] **Step 2: Run pricing tests and verify failure**

Run: `go -C services/gateway test ./internal/pricing -run 'TestMatch|TestTiered' -v`

Expected: FAIL because pricing is absent.

- [ ] **Step 3: Define frozen quote and charge contracts**

```go
type Quote struct {
	CatalogVersionID uuid.UUID
	AlgorithmVersion string
	Model             string
	MatchedModel      string
	Mode              Mode
	GroupRatio        decimal.Decimal
	Rule              Rule
	Estimated         usage.Estimate
	ReservedQuota     int64
	Expression        *ExpressionSnapshot
}

type Charge struct {
	Quota       int64
	CostQuota   *int64
	ProfitQuota *int64
	Breakdown   Breakdown
}
```

The quote must contain every price input needed at settlement; final calculation must not reload the active catalog.

- [ ] **Step 4: Port deterministic matching and expression code**

Port only the required behavior from `ratio_setting` and `pkg/billingexpr`. Compile expressions with a 256-entry hash cache. Whitelist expression functions and expose sanitized request headers/body only through the same v1 functions. Reject non-finite outputs and expression compile failures during import, not during normal relay.

- [ ] **Step 5: Run matching and tiered tests**

Run: `go -C services/gateway test -race ./internal/pricing -run 'TestMatch|TestTiered' -v`

Expected: PASS with exact integer results.

- [ ] **Step 6: Commit the pricing lookup layer**

```bash
git add services/gateway/internal/pricing
git commit -m "feat(gateway): port model matching and tiered pricing"
```

### Task 11: Port Reservation And Settlement Arithmetic With Golden Parity

**Files:**
- Create: `services/gateway/internal/pricing/engine.go`
- Create: `services/gateway/internal/pricing/tools.go`
- Create: `services/gateway/internal/pricing/engine_test.go`
- Create: `services/gateway/testdata/newapi-parity.json`

- [ ] **Step 1: Add differential golden cases**

Each fixture contains catalog rule, group, request estimate, canonical usage, expected reservation, expected final quota, expected delta, and expected breakdown. Include ratio/fixed/tiered, cache read/write/1-hour, Claude semantics, image/audio, tools, zero/missing usage, partial stream, minimum quota, and rounding boundaries.

```json
{
  "name": "openai_cached_ratio",
  "rule": {"model_ratio":"0.5","completion_ratio":"4","cache_read_ratio":"0.1"},
  "group_ratio": "1.2",
  "usage": {"text_input_tokens":600,"cache_read_tokens":400,"text_output_tokens":100},
  "expected_quota": 624
}
```

- [ ] **Step 2: Run golden tests and verify failure**

Run: `go -C services/gateway test ./internal/pricing -run TestNewAPIParity -v`

Expected: FAIL because `Engine` is incomplete.

- [ ] **Step 3: Implement pre-consumption exactly**

For ratio mode, truncate positive decimal quota after:

```text
(max(estimated_prompt_tokens, pre_consumed_tokens) + requested_max_output_tokens)
* model_ratio * group_ratio
```

For fixed mode, truncate `model_price_usd * quota_per_unit * group_ratio`. For tiered mode, execute the expression against estimates and round with `math.Round` after group ratio. Reject an unpriced model before relay when self-use fallback is disabled.

- [ ] **Step 4: Implement settlement exactly**

Use `decimal.Decimal` for all stored numeric inputs. Calculate base text, cache, media, and output without duplicate categories; add separately priced audio/media and tool surcharges; apply group ratio at the same point as new-api; use half-away-from-zero final rounding; return zero when total billable usage is zero; and return one when non-zero ratio usage rounds to zero, matching `text_quota.go`.

- [ ] **Step 5: Keep channel cost separate**

Calculate optional channel cost from an explicit channel-cost rule and set `ProfitQuota = customer quota - cost quota`. Missing cost data returns nil cost/profit and never changes customer quota.

- [ ] **Step 6: Run exact parity and race tests**

Run: `go -C services/gateway test -race ./internal/pricing -run 'TestNewAPIParity|TestReserve|TestCalculate' -v`

Expected: PASS with integer equality for every fixture.

- [ ] **Step 7: Commit the pricing engine**

```bash
git add services/gateway/internal/pricing services/gateway/testdata/newapi-parity.json
git commit -m "feat(gateway): match new-api billing arithmetic"
```

### Task 12: Implement The Safe Production Pricing Importer

**Files:**
- Create: `services/gateway/internal/importer/types.go`
- Create: `services/gateway/internal/importer/newapi.go`
- Create: `services/gateway/internal/importer/sanitize.go`
- Create: `services/gateway/internal/importer/import.go`
- Create: `services/gateway/internal/importer/import_test.go`
- Create: `services/gateway/cmd/pricing-import/main.go`
- Create: `services/gateway/cmd/pricing-import/main_test.go`

- [ ] **Step 1: Write importer tests using fake source and target stores**

Cover default dry-run, required `--apply`, JSON map parsing, effective defaults `QuotaPerUnit=500000` and `PreConsumedQuota=500`, malformed/non-finite values, expression compilation, canonical hashing, duplicate no-op, changed catalog, atomic activation, rollback preservation, unknown provider type 60 disabled, and secret redaction.

- [ ] **Step 2: Run importer tests and verify failure**

Run: `go -C services/gateway test ./internal/importer ./cmd/pricing-import -v`

Expected: FAIL because the importer is absent.

- [ ] **Step 3: Implement read-only source loading**

Read only the new-api option/config rows needed for `ModelRatio`, `ModelPrice`, `CompletionRatio`, `CacheRatio`, `CreateCacheRatio`, `ImageRatio`, `AudioRatio`, `AudioCompletionRatio`, `GroupRatio`, `GroupGroupRatio`, billing modes/expressions, tool prices, and effective defaults. Read sanitized ability/model/channel-type metadata without selecting channel keys, base URLs, custom headers, or channel settings.

- [ ] **Step 4: Implement canonical validation and hashing**

Decode JSON structurally into `map[string]json.Number`, sort canonical keys, validate finite bounded decimals, compile expressions, derive Claude 1-hour cache ratio as `create_cache_ratio * 1.6`, preserve raw unknown provider types, and compute a SHA-256 hash over the sanitized canonical snapshot plus algorithm version.

- [ ] **Step 5: Implement transactional apply**

Insert a draft catalog, all rules/groups/availability, validate counts and hashes, retire the prior active row, and activate the draft in one target transaction. An identical hash never inserts duplicate content; `--activate=false` returns an explicit no-op, while a later `--activate=true` may promote that already validated draft in a state-only transaction. The report may print counts, validation messages, algorithm version, and hashes only.

- [ ] **Step 6: Implement CLI safety**

Use `NEW_API_DATABASE_URL` only for the source and `DATABASE_URL` for Reizo. Default to dry-run, require `--apply` for writes, require `--source-label`, accept explicit `--activate=true|false`, and return non-zero on validation failure. Never echo DSNs.

- [ ] **Step 7: Run importer tests**

Run: `go -C services/gateway test -race ./internal/importer ./cmd/pricing-import -v`

Expected: PASS.

- [ ] **Step 8: Commit the importer**

```bash
git add services/gateway/internal/importer services/gateway/cmd/pricing-import
git commit -m "feat(gateway): import versioned new-api pricing"
```

### Task 13: Add PostgreSQL Catalog, Identity, And Shadow Repositories

**Files:**
- Create: `services/gateway/internal/storage/postgres.go`
- Create: `services/gateway/internal/storage/catalog.go`
- Create: `services/gateway/internal/storage/identity.go`
- Create: `services/gateway/internal/storage/shadow.go`
- Create: `services/gateway/internal/storage/storage_test.go`

- [ ] **Step 1: Write repository tests against `pgxmock`-free interfaces**

Use small query interfaces and table-driven fake rows for active catalog loading, missing catalog, API-key hash lookup, user status, expiry, IP/model/group/scopes, billing profile defaults, shadow insert, and cursor pagination/filter building.

- [ ] **Step 2: Run storage tests and verify failure**

Run: `go -C services/gateway test ./internal/storage -run 'TestCatalog|TestIdentity|TestShadow' -v`

Expected: FAIL because repositories do not exist.

- [ ] **Step 3: Implement pool and catalog repository**

Use `pgxpool.NewWithConfig`, bounded connections, statement timeouts, health checks, and context deadlines. Load the one active catalog and all child rules in a repeatable-read transaction; build an immutable in-memory catalog; refresh only when the active version ID changes.

- [ ] **Step 4: Implement fail-closed identity lookup**

Hash the raw API key before the query, select only active/unexpired keys joined to active users and optional policy, enforce scopes, IP CIDRs, allowed models/groups, and return `ErrIdentityStoreUnavailable` on database errors. Update `last_used_at` asynchronously only after successful authentication; failure to update it does not change authentication.

- [ ] **Step 5: Implement shadow storage and query filters**

Persist sanitized canonical usage, quote, calculated charge, optional reference charge, delta, outcome, mismatch class, catalog version, completion state, and provenance. Cursor order is `(created_at DESC, id DESC)` and the cursor encodes both values. Do not accept arbitrary SQL sort/filter input.

- [ ] **Step 6: Run storage tests**

Run: `go -C services/gateway test -race ./internal/storage -v`

Expected: PASS.

- [ ] **Step 7: Commit read-side storage**

```bash
git add services/gateway/internal/storage
git commit -m "feat(gateway): load identity pricing and shadow data"
```

### Task 14: Integrate Shadow Billing And Reconciliation Endpoint

**Files:**
- Create: `services/gateway/internal/billing/types.go`
- Create: `services/gateway/internal/billing/service.go`
- Create: `services/gateway/internal/billing/service_test.go`
- Modify: `services/gateway/internal/httpapi/server.go`
- Modify: `services/gateway/internal/httpapi/server_test.go`

- [ ] **Step 1: Write end-to-end shadow tests**

Assert that a successful JSON response, terminal SSE usage, missing-usage stream, partial disconnect, zero usage, unpriced model, and upstream rejection create the expected shadow event while never calling a mutating funding store. Assert `off` creates no event.

- [ ] **Step 2: Run shadow tests and verify failure**

Run: `go -C services/gateway test ./internal/billing ./internal/httpapi -run 'TestShadow|TestOff' -v`

Expected: FAIL because the shadow lifecycle is not connected.

- [ ] **Step 3: Implement one operation lifecycle**

```go
type Service interface {
	Begin(context.Context, BeginRequest) (*Operation, error)
	Complete(context.Context, *Operation, usage.Canonical, Completion) (Result, error)
	Fail(context.Context, *Operation, Failure) error
}
```

In shadow mode, `Begin` loads and freezes a quote but does not reserve funds. `Complete` calculates one charge and writes one shadow event. `Fail` records a sanitized failed outcome with the quoted reservation but no actual charge.

- [ ] **Step 4: Add the protected reconciliation endpoint**

`GET /internal/billing/shadow-events` requires the internal token without a user ID. Support `cursor`, `limit` capped at 200, `from`, `to`, `model`, `request_id`, `outcome`, and `mismatch_class`. Return only IDs, numeric usage/price data, provenance, states, deltas, timestamps, and sanitized error class.

- [ ] **Step 5: Run shadow and HTTP tests**

Run: `go -C services/gateway test -race ./internal/billing ./internal/httpapi -run 'TestShadow|TestInternalBilling|TestOff' -v`

Expected: PASS.

- [ ] **Step 6: Commit shadow billing**

```bash
git add services/gateway/internal/billing services/gateway/internal/httpapi
git commit -m "feat(gateway): add shadow billing reconciliation"
```

## Phase 3: Authoritative Billing And Durable Recovery

### Task 15: Implement Atomic API-Key And Wallet Reservation

**Files:**
- Create: `services/gateway/internal/storage/billing.go`
- Create: `services/gateway/internal/storage/billing_integration_test.go`
- Create: `services/gateway/internal/billing/policy.go`
- Create: `services/gateway/internal/billing/policy_test.go`

- [ ] **Step 1: Write PostgreSQL transaction tests**

Cover concurrent wallet holds, API-key quota exhaustion, reservation rollback when funding fails, duplicate operation IDs, zero reservation, and immutable ledger keys. Use at least two concurrent database connections and assert only one overspending request succeeds.

- [ ] **Step 2: Run integration tests and verify failure**

Run: `$env:TEST_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:55432/reizo_gateway_test?sslmode=disable'; go -C services/gateway test -tags=integration ./internal/storage -run TestReserve -v`

Expected: FAIL because authoritative storage is absent.

- [ ] **Step 3: Implement ordered transactional reservation**

Inside one serializable transaction:

1. Acquire `pg_advisory_xact_lock(hashtextextended(user_id::text, 0))`.
2. Insert or load the unique usage operation and reject a duplicate in-flight operation.
3. Compute API-key spendable quota from its immutable ledger; append `apikey:{operation}:hold` when bounded.
4. Select the funding source according to the frozen policy.
5. Compute wallet spendable balance from its ledger; append `wallet:{operation}:hold` when selected.
6. Mark the usage event `reserved` with funding kind/reference and quoted reservation.

Any failure rolls back both the API-key and funding hold before an upstream call can begin.

- [ ] **Step 4: Implement wallet settlement and reversal**

Settlement appends a release for the original hold and a debit for actual quota using deterministic keys, then updates the usage event in the same transaction. Reversal appends only the matching release and marks `reversed`. Repeated calls return the existing terminal state. A zero actual charge releases the full hold and writes no zero-value ledger entry.

- [ ] **Step 5: Run concurrency and idempotency tests**

Run: `go -C services/gateway test -race -tags=integration ./internal/storage -run 'TestReserve|TestWallet|TestIdempotent' -v`

Expected: PASS and no negative spendable balance.

- [ ] **Step 6: Commit API-key and wallet transactions**

```bash
git add services/gateway/internal/storage/billing* services/gateway/internal/billing/policy*
git commit -m "feat(gateway): reserve API key and wallet quota atomically"
```

### Task 16: Add Subscription Quota And Funding Fallback

**Files:**
- Modify: `services/gateway/internal/storage/billing.go`
- Modify: `services/gateway/internal/storage/billing_integration_test.go`
- Modify: `services/gateway/internal/billing/policy.go`
- Modify: `services/gateway/internal/billing/policy_test.go`

- [ ] **Step 1: Add failing tests for all four funding preferences**

Test `subscription_first`, `wallet_first`, `subscription_only`, and `wallet_only`; inactive/expired subscriptions; insufficient window quota; cumulative cap; daily reset; fallback; concurrent holds; and an overage that stays on the selected source.

- [ ] **Step 2: Run subscription tests and verify failure**

Run: `go -C services/gateway test -tags=integration ./internal/storage ./internal/billing -run 'TestSubscription|TestFundingPreference' -v`

Expected: FAIL because subscription quota is not connected.

- [ ] **Step 3: Implement reset and spendable subscription quota**

Lock the subscription quota row, advance expired reset windows deterministically, append a `reset` audit entry, and calculate spendable quota from window/cumulative limits minus debits and active holds. Never use payment order amount as token quota; the native quota state is authoritative.

- [ ] **Step 4: Implement exact fallback order**

Try only the ordered sources allowed by the preference. Fall back solely on insufficient quota, not on database or invariant errors. Freeze the selected source in the usage event. Settlement overage must charge that source or enter `settlement_pending`; it must not switch sources after generation.

- [ ] **Step 5: Run subscription tests with race detection**

Run: `go -C services/gateway test -race -tags=integration ./internal/storage ./internal/billing -run 'TestSubscription|TestFundingPreference' -v`

Expected: PASS.

- [ ] **Step 6: Commit subscription funding**

```bash
git add services/gateway/internal/storage/billing.go services/gateway/internal/storage/billing_integration_test.go services/gateway/internal/billing/policy.go services/gateway/internal/billing/policy_test.go
git commit -m "feat(gateway): add subscription quota fallback"
```

### Task 17: Complete Settlement, Refund, Idempotency, And Recovery

**Files:**
- Modify: `services/gateway/internal/billing/service.go`
- Create: `services/gateway/internal/billing/recovery.go`
- Create: `services/gateway/internal/billing/recovery_test.go`
- Modify: `services/gateway/internal/storage/billing.go`
- Create: `services/gateway/internal/storage/recovery.go`
- Create: `services/gateway/internal/storage/recovery_integration_test.go`

- [ ] **Step 1: Write lifecycle and crash tests**

Cover exact settlement delta, full refund on final relay failure, partial-stream charge, duplicate settle/refund, settle-after-refund rejection, refund-after-settle no-op, database failure after response, stale reservation refund, persisted completion retry, and committed settlement never refunded.

- [ ] **Step 2: Run lifecycle tests and verify failure**

Run: `go -C services/gateway test -tags=integration ./internal/billing ./internal/storage -run 'TestSettle|TestRefund|TestRecovery' -v`

Expected: FAIL because recovery is absent.

- [ ] **Step 3: Persist completion before the settlement transaction**

After usage normalization, write canonical usage, provenance, terminal state, actual quota, and `settlement_pending` with a deterministic operation ID. Then run the atomic release/debit/state transition. Use `context.WithoutCancel` plus a bounded timeout so a client disconnect does not cancel billing of already generated output.

- [ ] **Step 4: Add an owner-only local recovery spool for database outages**

In authoritative mode, if even the pending snapshot cannot reach PostgreSQL, atomically write a JSON envelope containing only operation ID, usage event ID, catalog ID, canonical numeric usage, final quota, completion state, and checksum under `REIZO_GATEWAY_RECOVERY_DIR` with directory mode `0700` and file mode `0600`. Fsync the file and directory, replay idempotently, then delete only after PostgreSQL confirms a terminal state.

- [ ] **Step 5: Implement the recovery worker**

On startup and every 30 seconds:

- settle `settlement_pending` events from their frozen quote/snapshot;
- replay local spool envelopes;
- reverse expired `reserved` events without a completion snapshot;
- skip every terminal event;
- increment attempt count and emit a sanitized metric/error class.

- [ ] **Step 6: Run recovery integration tests**

Run: `go -C services/gateway test -race -tags=integration ./internal/billing ./internal/storage -run 'TestSettle|TestRefund|TestRecovery' -v`

Expected: PASS with one terminal ledger outcome per operation.

- [ ] **Step 7: Commit durable lifecycle handling**

```bash
git add services/gateway/internal/billing services/gateway/internal/storage
git commit -m "feat(gateway): add durable settlement and refund recovery"
```

### Task 18: Add Retry Accounting Without Coupling Billing To Channels

**Files:**
- Create: `services/gateway/internal/relay/retry.go`
- Create: `services/gateway/internal/relay/retry_test.go`
- Modify: `services/gateway/internal/relay/client.go`
- Modify: `services/gateway/internal/billing/service.go`
- Modify: `services/gateway/internal/storage/billing.go`

- [ ] **Step 1: Write shared-session retry tests**

Use an in-memory selector with multiple channels to prove that retries share one operation and reservation, record separate attempts, settle once after success, refund once after all failures, stop after response commitment, and do not retry uncertain paid task submissions.

- [ ] **Step 2: Run retry tests and verify failure**

Run: `go -C services/gateway test ./internal/relay ./internal/billing -run TestRetry -v`

Expected: FAIL because retry policy is absent.

- [ ] **Step 3: Implement explicit retry classification**

Retry only configured transport errors, timeouts before response headers, and configured upstream statuses while the downstream response is uncommitted. Mark task submissions non-retryable after any uncertain upstream acceptance. Pass `AttemptHistory` to `ChannelSelector` and let it refuse already-used channels.

- [ ] **Step 4: Persist attempts outside customer charge arithmetic**

Write attempt number, channel ID, raw provider type, timing, status, retry reason, and sanitized error class to `gateway_relay_attempts`. The pricing engine and funding policy receive no selector internals. Static production configuration still exposes one channel per family; multi-channel database selection remains a future adapter.

- [ ] **Step 5: Run retry and race tests**

Run: `go -C services/gateway test -race ./internal/relay ./internal/billing -run TestRetry -v`

Expected: PASS and exactly one terminal billing call per request.

- [ ] **Step 6: Commit retry lifecycle support**

```bash
git add services/gateway/internal/relay services/gateway/internal/billing/service.go services/gateway/internal/storage/billing.go
git commit -m "feat(gateway): share billing across relay attempts"
```

### Task 19: Add Metrics, Redacted Logs, And Authoritative Startup Gates

**Files:**
- Modify: `services/gateway/internal/observability/logging.go`
- Create: `services/gateway/internal/observability/metrics.go`
- Create: `services/gateway/internal/observability/observability_test.go`
- Modify: `services/gateway/internal/httpapi/server.go`
- Modify: `services/gateway/cmd/gateway/main.go`

- [ ] **Step 1: Write redaction and metric tests**

Feed secret-bearing headers, DSNs, request bodies, upstream errors, and generated content through failure paths and assert none appear in logs or metric labels. Assert request, attempts, usage provenance, shadow mismatch, reserve/settle/refund/pending, recovery, insufficient funds, charge/cost/profit counters.

- [ ] **Step 2: Run observability tests and verify failure**

Run: `go -C services/gateway test ./internal/observability -v`

Expected: FAIL because metrics are absent.

- [ ] **Step 3: Add bounded-cardinality metrics**

Expose `/metrics` only on the private listener and label by protocol, normalized model family, billing mode, outcome, provenance, and sanitized error class. Never label by user ID, API key ID, request ID, exact arbitrary model, channel URL, or error message.

- [ ] **Step 4: Enforce authoritative startup checks**

Before listening, authoritative mode must verify database connectivity, migration/table presence, one active valid catalog, internal token, recovery directory permissions, `BILLING_OWNER=go`, allowed upstream ownership, and at least one configured upstream. Shadow mode requires database, active catalog, and internal token but does not require ownership transfer.

- [ ] **Step 5: Run observability and startup tests**

Run: `go -C services/gateway test -race ./internal/observability ./cmd/gateway ./internal/httpapi -v`

Expected: PASS.

- [ ] **Step 6: Commit observability and gates**

```bash
git add services/gateway/internal/observability services/gateway/internal/httpapi/server.go services/gateway/cmd/gateway/main.go
git commit -m "feat(gateway): add billing metrics and ownership gates"
```

## Phase 4: Integration, Fastify Removal, And Shadow Rollout

### Task 20: Add Repeatable PostgreSQL Integration And CI

**Files:**
- Create: `services/gateway/compose.test.yml`
- Create: `scripts/test-go-gateway-integration.ps1`
- Create: `.github/workflows/gateway.yml`

- [ ] **Step 1: Add a dedicated disposable PostgreSQL service**

Use PostgreSQL 16 with database `reizo_gateway_test`, fixed local port `55432`, health check `pg_isready`, and a named volume scoped to the compose project `reizo-gateway-test`. The script must verify the compose project name before removing the test volume.

- [ ] **Step 2: Implement the PowerShell test driver**

The script must:

1. start only the test PostgreSQL service;
2. set `TEST_DATABASE_URL` without printing it;
3. apply `drizzle/0000` through `0003` with `psql -v ON_ERROR_STOP=1`;
4. run integration tests;
5. stop and remove only the verified test compose project in `finally`.

- [ ] **Step 3: Add CI jobs**

Run `go fmt` cleanliness, `go vet ./...`, `go test ./...`, `go test -race ./...`, build both commands, start PostgreSQL 16, apply migrations, and run `-tags=integration`. Also run `npm test -- src/lib/agent/provider/gateway.test.ts src/lib/platform/db/gateway-schema.test.ts` to protect the Next.js caller contract.

- [ ] **Step 4: Run the integration driver locally**

Run: `powershell -ExecutionPolicy Bypass -File scripts/test-go-gateway-integration.ps1`

Expected: all Go integration tests pass and `docker compose -p reizo-gateway-test ps` reports no running test service afterward.

- [ ] **Step 5: Commit integration infrastructure**

```bash
git add services/gateway/compose.test.yml scripts/test-go-gateway-integration.ps1 .github/workflows/gateway.yml
git commit -m "test(gateway): add PostgreSQL integration coverage"
```

### Task 21: Run The Production Pricing Dry-Run And Apply An Inactive Catalog

**Files:**
- Modify: `docs/DEPLOY.md`
- Create: `docs/operations/go-gateway-pricing-import-2026-08-04.md`

- [ ] **Step 1: Build the reviewed importer binary**

Run: `go -C services/gateway build -trimpath -o pricing-import.exe ./cmd/pricing-import`

Expected: exit 0 and a local ignored binary.

- [ ] **Step 2: Use the production connection skill in read-only source mode**

Follow `E:/CodeCode/reizo/.agents/skills/connect-newapi-server/SKILL.md`. Supply source and target DSNs through process environment or protected server environment files without displaying their values. Do not query channel key/token columns.

- [ ] **Step 3: Run the dry-run**

Run on the approved host/environment:

```bash
./pricing-import --source-label=new-api-15-204-82-213
```

Expected: dry-run report with 286 model ratios, 97 fixed prices, 72 completion ratios, 104 cache read ratios, 54 cache write ratios, 1 image ratio, 5 audio input ratios, 7 audio output ratios, 18 group ratios, effective defaults 500000/500, and validation of eight enabled unpriced models. Differences from the 2026-08-04 baseline require investigation before apply.

- [ ] **Step 4: Apply without activation and verify target hashes**

Run:

```bash
./pricing-import --source-label=new-api-15-204-82-213 --apply --activate=false
```

Expected: one draft catalog, deterministic source/rule hashes, no source writes, no credentials in the report, and rerunning the same command reports a no-op.

- [ ] **Step 5: Record only sanitized reconciliation evidence**

Document counts, hashes, importer version, timestamp, draft catalog ID, validation outcome, and the list of unpriced model names. Do not document DSNs, tokens, channel URLs, request content, or raw option snapshots.

- [ ] **Step 6: Commit operational evidence**

```bash
git add docs/DEPLOY.md docs/operations/go-gateway-pricing-import-2026-08-04.md
git commit -m "docs(gateway): record pricing import verification"
```

### Task 22: Remove Fastify Gateway And Switch Build/Operations To Go

**Files:**
- Delete: `services/gateway/src/`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`
- Modify: `.env.example`
- Modify: `services/gateway/README.md`
- Modify: `docs/DEPLOY.md`
- Modify: `.github/workflows/deploy.yml`
- Modify: `scripts/package-standalone.mjs`

- [ ] **Step 1: Run the full Go contract suite before deletion**

Run: `go -C services/gateway test -race ./... && go -C services/gateway build ./cmd/gateway ./cmd/pricing-import`

Expected: PASS.

- [ ] **Step 2: Remove the TypeScript Gateway source**

Delete only `services/gateway/src/`. Do not remove Fastify itself from dependencies because `services/media-worker/src/server.ts` still uses it. Remove `@fastify/cors` only after `rg '@fastify/cors'` confirms no remaining consumer.

- [ ] **Step 3: Update package scripts and lockfile**

Set:

```json
{
  "gateway:dev": "go -C services/gateway run ./cmd/gateway",
  "gateway:build": "go -C services/gateway build -trimpath ./cmd/gateway",
  "gateway:pricing-import": "go -C services/gateway run ./cmd/pricing-import",
  "test:gateway": "go -C services/gateway test ./..."
}
```

Remove `gateway:start` because production runs the built binary. Add `/services/gateway/gateway`, `/services/gateway/gateway.exe`, and `/services/gateway/pricing-import.exe` to `.gitignore`. Run `npm uninstall @fastify/cors` to update `package-lock.json` mechanically.

- [ ] **Step 4: Update production service instructions**

Build a Linux binary with `CGO_ENABLED=0 GOOS=linux GOARCH=amd64`, install it as `/opt/reizo-gateway/reizo-gateway`, and set systemd `ExecStart=/opt/reizo-gateway/reizo-gateway`. Document `REIZO_GATEWAY_BILLING_MODE=shadow`, recovery directory ownership, active catalog, internal token, and upstream ownership. Remove the Node/tsx checkout requirement and every statement that calls the Gateway Fastify.

- [ ] **Step 5: Run repository verification after deletion**

Run:

```bash
rg -n "Fastify gateway|standalone Fastify|services/gateway/src|gateway:start|@fastify/cors" package.json package-lock.json docs services scripts .github
npm test -- src/lib/agent/provider/gateway.test.ts src/lib/platform/db/gateway-schema.test.ts
go -C services/gateway test -race ./...
npm run build
```

Expected: the search returns no stale Gateway references, all tests pass, and the Next.js production build succeeds.

- [ ] **Step 6: Commit the runtime replacement**

```bash
git add -A services/gateway package.json package-lock.json .gitignore .env.example docs/DEPLOY.md .github/workflows/deploy.yml scripts/package-standalone.mjs
git commit -m "refactor(gateway): replace Fastify runtime with Go"
```

### Task 23: Deploy Go In Shadow Mode And Reconcile Before Ownership Transfer

**Files:**
- Modify: `docs/DEPLOY.md`
- Create: `docs/operations/go-gateway-shadow-reconciliation.md`

- [ ] **Step 1: Activate the reviewed catalog**

Only after the inactive draft counts/hashes have been reviewed, run:

```bash
./pricing-import --source-label=new-api-15-204-82-213 --apply --activate=true
```

Expected: no duplicate catalog content, the matching validated draft becomes active in one state transaction, exactly one catalog is active, and the prior active version remains available as retired/draft for rollback.

- [ ] **Step 2: Install Go as the only traffic-handling Gateway in shadow mode**

Set `REIZO_GATEWAY_BILLING_MODE=shadow`. Keep new-api as the sole billing owner. Point nginx port 4010 at the Go binary and do not run Fastify. Verify `/healthz`, `/readyz`, `/capabilities`, `/metrics`, OpenAI JSON/SSE, Responses SSE, Claude SSE, image, and audio calls.

- [ ] **Step 3: Reconcile correlated requests**

Query `/internal/billing/shadow-events` with the internal token and correlate request IDs with new-api consume logs. Compare reservation, actual integer quota, usage provenance, cache/media/tool breakdown, terminal state, and refund outcome. Store aggregate counts and mismatch classes only.

- [ ] **Step 4: Exercise failure and recovery cases**

Test upstream rejection, transport failure, client disconnect after output, missing terminal usage, process termination after pending snapshot, retry-before-commit, duplicate idempotency key, and PostgreSQL interruption. Confirm no Reizo wallet/API-key/subscription ledger mutation occurs in shadow mode.

- [ ] **Step 5: Define the authoritative go/no-go evidence**

Require exact deterministic fixture parity, explained live mismatches, zero unexplained stale reservations, successful recovery replay, direct-provider or non-charging-new-api upstream ownership, and a tested rollback to shadow/off. Record who approved ownership transfer and when.

- [ ] **Step 6: Commit the reconciliation runbook**

```bash
git add docs/DEPLOY.md docs/operations/go-gateway-shadow-reconciliation.md
git commit -m "docs(gateway): define shadow reconciliation gates"
```

### Task 24: Controlled Authoritative Cutover

**Files:**
- Modify: `docs/operations/go-gateway-shadow-reconciliation.md`

- [ ] **Step 1: Confirm one billing owner before changing mode**

Verify the upstream is direct Provider access or the new-api internal account cannot charge the Reizo customer again. Confirm Fastify is absent and no second Go instance uses authoritative mode against the same traffic without shared idempotency.

- [ ] **Step 2: Switch one controlled deployment**

Set `REIZO_GATEWAY_BILLING_MODE=authoritative`, `REIZO_GATEWAY_BILLING_OWNER=go`, and the reviewed upstream ownership value. Restart one Gateway instance and require readiness success before routing controlled traffic.

- [ ] **Step 3: Verify money movement request by request**

For a funded test account, confirm API-key hold, wallet/subscription hold, one upstream call, release plus final debit on success, full release on final failure, partial usage settlement on disconnect, and no duplicate entries after retrying the same idempotency key.

- [ ] **Step 4: Monitor and expand gradually**

Monitor reservations, settlements, refunds, pending count/age, recovery attempts, insufficient quota, customer charge, channel cost, profit, and new-api correlated charges. Expand traffic only while every request has one billing owner and ledger deltas reconcile.

- [ ] **Step 5: Execute rollback if an invariant fails**

Set Go to `shadow` or `off`, restore new-api billing ownership if required, leave committed Go operations for deterministic recovery, and never replay or manually duplicate ledger entries. Keep the prior binary and pricing catalog available.

- [ ] **Step 6: Record final cutover evidence**

Append sanitized timestamps, active catalog hash, deployed binary checksum, request outcome counts, pending/recovery status, owner confirmation, and rollback result to the reconciliation runbook.

- [ ] **Step 7: Commit the completed cutover record**

```bash
git add docs/operations/go-gateway-shadow-reconciliation.md
git commit -m "docs(gateway): record authoritative billing cutover"
```

## Final Verification Matrix

Run these commands from `E:/CodeCode/reizo` after Task 22 and before any production cutover:

```bash
go -C services/gateway fmt ./...
go -C services/gateway vet ./...
go -C services/gateway test ./...
go -C services/gateway test -race ./...
go -C services/gateway build -trimpath ./cmd/gateway ./cmd/pricing-import
powershell -ExecutionPolicy Bypass -File scripts/test-go-gateway-integration.ps1
npm test -- src/lib/agent/provider/gateway.test.ts src/lib/platform/db/gateway-schema.test.ts
npx tsc --noEmit
npm run build
```

Expected results:

- Every Go unit, race, differential, relay, importer, and PostgreSQL integration test passes.
- The Next.js Gateway caller tests and schema tests pass without Auth.js changes.
- The production build succeeds.
- `services/gateway/src` no longer exists.
- Default mode is `shadow`.
- `off` performs no billing writes.
- `shadow` writes only reconciliation rows.
- `authoritative` cannot become ready without ownership, database, catalog, internal-token, recovery, and upstream safety checks.
- A request has one reservation, one terminal settlement or reversal, and at most one customer charge across all relay attempts.

## Self-Review Results

- Spec coverage: transport compatibility, internal/API-key auth, OpenAI/Responses/Claude/Grok/image/audio usage, missing-usage fallback, model matching, fixed/ratio/tiered pricing, cache/media/tools, price import, wallet/API-key/subscription funding, retries, idempotency, shadow reconciliation, recovery, metrics, Fastify removal, and single-owner rollout all map to explicit tasks.
- File ownership: Drizzle owns schema migrations; Go storage owns runtime SQL; HTTP does not calculate prices or balances; relay selection does not own billing.
- Type consistency: `usage.Canonical` feeds `pricing.Engine`; `pricing.Quote` is frozen into `billing.Operation`; `billing.Service` is the only HTTP-facing billing lifecycle; storage accepts operation IDs and deterministic ledger keys.
- Safety: production import is dry-run first and credential-free; unknown provider types stay disabled; authoritative startup fails closed; Fastify deletion occurs only after the Go contract suite passes.
