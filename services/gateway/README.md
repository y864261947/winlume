# Reizo Gateway

The gateway is a standalone Go process, separate from the Next.js application.
It provides authenticated, bounded streaming relay for OpenAI-compatible and
provider-native protocols, plus wallet accounting (shadow or authoritative
billing). It intentionally never falls back to `NEW_API_URL`, so it remains
usable after old new-api is retired.

The default listener is `127.0.0.1:4010`. Keep it on a private interface and
let nginx or another edge proxy expose only the API paths that need to be
public.

## Local development

From the repository root:

```bash
$env:REIZO_GATEWAY_BILLING_MODE="off"
npm run gateway:dev
curl http://127.0.0.1:4010/healthz
```

Run the Next application separately. In native mode it uses
`REIZO_GATEWAY_URL` (default `http://127.0.0.1:4010`) for Studio requests.

```bash
npm run dev
npm run gateway:dev
```

`npm run gateway:dev` runs `go run ./cmd/gateway` directly against the
`services/gateway` module. `npm run gateway:pricing-import` runs
`go run ./cmd/pricing-import` the same way, for importing/activating a
pricing catalog from a new-api source (see `internal/importer`).

## Production build

Build a static Linux binary (this repository has no cgo dependency, so
`CGO_ENABLED=0` is safe and keeps the binary portable across hosts):

```bash
npm run gateway:build
# equivalent to:
# CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go -C services/gateway build -trimpath -o gateway ./cmd/gateway
```

Copy the resulting `services/gateway/gateway` binary to the production host,
for example `/opt/reizo-gateway/reizo-gateway`, and point systemd's
`ExecStart` at that path directly (no Node, no `tsx`, no `npm ci` on the
gateway host). See [docs/DEPLOY.md](../../docs/DEPLOY.md) for the full unit
file and environment layout.

## Production configuration

At least one upstream is required for `/readyz` to return `200`:

```bash
REIZO_GATEWAY_OPENAI_UPSTREAM_URL=https://provider.example/v1
REIZO_GATEWAY_OPENAI_UPSTREAM_API_KEY=provider-service-key
REIZO_GATEWAY_BILLING_MODE=shadow

# The Reizo web process and gateway must share this secret. It is a
# server-to-server credential, never a browser value.
REIZO_GATEWAY_INTERNAL_TOKEN=replace-with-a-distinct-random-secret

# Keep browser origins explicit when a browser must call the public API.
REIZO_GATEWAY_CORS_ORIGINS=https://app.winlume.example

# The default trusts a same-host nginx proxy (127.0.0.1 and ::1). When the
# proxy runs elsewhere, list only its fixed IPs or CIDRs.
REIZO_GATEWAY_TRUSTED_PROXY_IPS=127.0.0.1,::1
```

`REIZO_GATEWAY_<FAMILY>_UPSTREAM_URL` selects a family-specific upstream,
for example `REIZO_GATEWAY_CLAUDE_UPSTREAM_URL` or
`REIZO_GATEWAY_GEMINI_UPSTREAM_URL`. The matching
`..._UPSTREAM_API_KEY` may contain either a raw API key or a complete
authorization value. Images, audio, embeddings, and realtime use the OpenAI
upstream unless overridden.

## API-key verification

Studio requests use the internal token and UUID user ID. External requests
verify against PostgreSQL-backed API keys (`REIZO_GATEWAY_USE_PLATFORM_DATABASE`,
default true whenever `DATABASE_URL` is set) or, as a fallback/test mode,
a static SHA-256 hash list:

```bash
# SHA-256 hexadecimal values, comma separated
REIZO_GATEWAY_API_KEY_HASHES=
```

If no verifier is configured, API-key requests fail closed with `503`.
`REIZO_GATEWAY_ALLOW_UNVERIFIED_KEYS=true` remains a local diagnostic escape
hatch and must not be enabled in production.

Studio authenticates to the gateway with `x-reizo-internal-token` and
`x-reizo-internal-user-id`. The legacy-compatible
`x-reizo-internal-identity` and `x-reizo-internal-user` aliases are
accepted only with the same token. Browser-supplied `New-Api-User` and
`x-reizo-user` are never trusted or forwarded.

## Billing safety

`REIZO_GATEWAY_BILLING_MODE` gates what the process is allowed to do at
startup (`Validate` refuses to start if the mode's requirements are unmet):

- `off` — no billing transaction, shadow event, quota reservation, or wallet
  mutation. Useful for local development only.
- `shadow` (default) — writes usage/ledger rows alongside the existing
  billing owner, without enforcing quota. Requires `DATABASE_URL` and
  `REIZO_GATEWAY_INTERNAL_TOKEN`. This is the safe default for running the
  Go gateway in production before cutover: it observes real traffic without
  becoming the system of record.
- `authoritative` — the Go gateway is the sole quota/ledger owner for the
  requests it serves. In addition to the `shadow` requirements it also
  requires:
  - `REIZO_GATEWAY_BILLING_OWNER=go`
  - `REIZO_GATEWAY_UPSTREAM_OWNERSHIP` set to `provider` (a directly billed
    upstream) or `non_charging_new_api` (a new-api upstream that never bills)
  - `REIZO_GATEWAY_RECOVERY_DIR`, an absolute path to a directory the
    gateway process exclusively owns (see below)

## Channel encryption

`REIZO_CHANNEL_ENCRYPTION_KEY` is the AES-256 key used to encrypt the
`channels` table's `api_key` column at rest
(`internal/storage/channels.go`, `internal/storage/channel_crypto.go`). It is
required whenever the gateway opens its database-backed store — that is, in
`shadow` (the default) or `authoritative` billing mode — and the process
fails to start without it; only `off` mode (no billing database at all) can
run without it.

The value must decode to exactly 32 bytes: either 64 hex characters, or
base64 (standard or URL-safe, padded or not). Generate one with:

```bash
openssl rand -hex 32
```

Losing this key makes every stored channel `api_key` permanently unreadable
(rows written before this key existed are read back as plaintext unchanged —
see the migration note at the top of `channel_crypto.go` — but every row
written or re-saved after this key exists is only recoverable with it). Back
it up like any other production secret, and never commit it or log it.

## Recovery directory

`REIZO_GATEWAY_RECOVERY_DIR` is a crash-recovery journal directory used only
in `authoritative` billing mode (see `internal/billing/recovery.go`). It must:

- be an absolute path
- be writable by, and owned by, the OS user the gateway process runs as
  (for example the systemd unit's `User=`)
- never be shared with another process or another gateway instance — two
  writers to the same recovery directory can corrupt in-flight recovery state
- persist across restarts (do not point it at `/tmp` or another
  auto-cleared path)

## Pricing catalog

Authoritative and shadow billing price requests from the `pricing_catalog_versions`
table's `active` row (`internal/storage/catalog.go`, `ErrNoActiveCatalog` if
none is active). Import and activate a catalog with:

```bash
npm run gateway:pricing-import -- --source-label=<label> --apply --activate
```

Omit `--apply` for a dry run, or omit `--activate` to import without flipping
the active catalog. The command reads `NEW_API_DATABASE_URL` (source) and
`DATABASE_URL` (target, only when `--apply` is set).

## Operations

| Endpoint | Purpose |
| --- | --- |
| `GET /healthz` | Process liveness; no upstream check. |
| `GET /readyz` | Readiness; returns `503` until an upstream adapter exists. |
| `GET /capabilities` | Configured adapters and the supported route catalog. |

Protocol routes preserve streaming responses and include a gateway-generated
`x-request-id`. Routes without a configured protocol family return `501`;
unknown routes return `404`.

The Next.js standalone tarball does not include the gateway. It ships and
deploys as its own Linux binary and systemd unit, independent from the web
release. See [docs/DEPLOY.md](../../docs/DEPLOY.md) for the build, unit file,
and cutover details.
