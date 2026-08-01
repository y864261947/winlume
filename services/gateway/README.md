# WinLume Gateway

The gateway is a standalone Fastify process, separate from the Next.js
application. It owns OpenAI-compatible protocol proxying, external API-key
verification, and native wallet usage accounting. It intentionally never
falls back to `NEW_API_URL`, so it remains usable after old new-api is retired.

The default listener is `127.0.0.1:4010`. Keep it on a private interface and
let nginx or another edge proxy expose only the API paths that need to be
public.

## Local development

From the repository root:

```bash
npm run gateway:dev
curl http://127.0.0.1:4010/healthz
```

Run the Next application separately. In native mode it uses
`WINLUME_GATEWAY_URL` (default `http://127.0.0.1:4010`) for Studio requests.

```bash
npm run dev
npm run gateway:dev
```

## Production configuration

At least one upstream is required for `/readyz` to return `200`:

```bash
WINLUME_GATEWAY_OPENAI_UPSTREAM_URL=https://provider.example/v1
WINLUME_GATEWAY_OPENAI_UPSTREAM_API_KEY=provider-service-key

# The WinLume web process and gateway must share this secret. It is a
# server-to-server credential, never a browser value.
WINLUME_GATEWAY_INTERNAL_TOKEN=replace-with-a-distinct-random-secret

# Keep browser origins explicit when a browser must call the public API.
WINLUME_GATEWAY_CORS_ORIGINS=https://app.winlume.example

# The default trusts a same-host nginx proxy (127.0.0.1 and ::1). When the
# proxy runs elsewhere, list only its fixed IPs or CIDRs.
WINLUME_GATEWAY_TRUSTED_PROXY_IPS=127.0.0.1,::1
```

`WINLUME_GATEWAY_<FAMILY>_UPSTREAM_URL` selects a family-specific upstream,
for example `WINLUME_GATEWAY_CLAUDE_UPSTREAM_URL` or
`WINLUME_GATEWAY_GEMINI_UPSTREAM_URL`. The matching
`..._UPSTREAM_API_KEY` may contain either a raw API key or a complete
authorization value. Images, audio, embeddings, and realtime use the OpenAI
upstream unless overridden.

## API-key verification

Native production should use the same PostgreSQL database as the web process:

```bash
DATABASE_URL=postgres://winlume:...
WINLUME_GATEWAY_USE_PLATFORM_DATABASE=true
```

With `DATABASE_URL` present, database verification is enabled by default. It
checks active WinLume API keys, scopes, and IP allowlists, and supplies the
user/organization identity needed for usage accounting. Run
`npm run db:migrate` before starting this mode.

IP allowlists use the client address from `X-Forwarded-For` only when the
socket peer matches `WINLUME_GATEWAY_TRUSTED_PROXY_IPS`. The default trusts
only loopback for a same-host nginx deployment. Keep the gateway listener
private, and never trust every proxy when an API key can use IP restrictions.

Static hashes are a deliberately limited fallback for an isolated gateway or
test environment:

```bash
# SHA-256 hexadecimal values, comma separated
WINLUME_GATEWAY_API_KEY_HASHES=
WINLUME_GATEWAY_USE_PLATFORM_DATABASE=false
```

Do not set static hashes and expect database lookup too: configured static
hashes take precedence. If neither verifier is configured, requests fail
closed with `503`. `WINLUME_GATEWAY_ALLOW_UNVERIFIED_KEYS=true` is a local
diagnostic escape hatch and must not be enabled in production.

Studio authenticates to the gateway with `x-winlume-internal-token` and
`x-winlume-internal-user-id`. The legacy-compatible
`x-winlume-internal-identity` and `x-winlume-internal-user` aliases are
accepted only with the same token. Browser-supplied `New-Api-User` and
`x-winlume-user` are never trusted or forwarded.

## Wallet accounting

For native database identities, the gateway can reserve prepaid credits before
proxying and settle or reverse the immutable ledger entry afterwards:

```bash
# Amounts are integer microcredits.
WINLUME_GATEWAY_RESERVATION_MICROCREDITS=1000
WINLUME_GATEWAY_REQUEST_COST_MICROCREDITS=1000
```

Set the reservation high enough to cover the expected final cost. A successful
upstream may set `x-winlume-cost-microcredits` (or
`x-winlume-usage-cost-microcredits`) to replace the fixed settlement amount.
Failed or rejected upstream requests release the reservation. The default
values are `0`: usage is recorded for identities with a user id, but no hold
or debit is created. Static-hash-only keys have no user id, so they do not
participate in wallet accounting.

## Operations

| Endpoint | Purpose |
| --- | --- |
| `GET /healthz` | Process liveness; no upstream check. |
| `GET /readyz` | Readiness; returns `503` until an upstream adapter exists. |
| `GET /capabilities` | Configured adapters and the supported route catalog. |

Protocol routes preserve streaming responses and include a gateway-generated
`x-request-id`. Routes without a configured protocol family return `501`;
unknown routes return `404`.

Deploy this as its own systemd process. The current Next.js standalone tarball
contains only the web application; it does not bundle gateway source or its
runtime dependencies. Keep a production checkout (including `node_modules`)
for the gateway, run `npm ci`, and use `npm run gateway:start` from that
checkout. The full dual-process example, nginx routing, and cutover sequence
are in [docs/DEPLOY.md](../../docs/DEPLOY.md).
