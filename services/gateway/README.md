# WinLume Gateway

The gateway is a standalone Go process, separate from the Next.js application.
The current runnable increment provides authenticated, bounded streaming relay
with billing explicitly disabled. It intentionally never falls back to
`NEW_API_URL`, so it remains usable after old new-api is retired.

The default listener is `127.0.0.1:4010`. Keep it on a private interface and
let nginx or another edge proxy expose only the API paths that need to be
public.

## Local development

From the repository root:

```bash
$env:WINLUME_GATEWAY_BILLING_MODE="off"
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
WINLUME_GATEWAY_BILLING_MODE=off

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

## API-key verification in the off-mode increment

Studio requests use the internal token and UUID user ID. External requests can
use the existing static SHA-256 lookup list while PostgreSQL identity storage is
being wired in a later increment:

```bash
# SHA-256 hexadecimal values, comma separated
WINLUME_GATEWAY_API_KEY_HASHES=
```

If no verifier is configured, API-key requests fail closed with `503`.
`WINLUME_GATEWAY_ALLOW_UNVERIFIED_KEYS=true` remains a local diagnostic escape
hatch and must not be enabled in production. Database-backed API-key status,
scope, IP allowlist, user, and organization lookup will replace this temporary
off-mode fallback before authoritative billing is available.

Studio authenticates to the gateway with `x-winlume-internal-token` and
`x-winlume-internal-user-id`. The legacy-compatible
`x-winlume-internal-identity` and `x-winlume-internal-user` aliases are
accepted only with the same token. Browser-supplied `New-Api-User` and
`x-winlume-user` are never trusted or forwarded.

## Billing safety

This process currently refuses to start unless
`WINLUME_GATEWAY_BILLING_MODE=off`. It does not open a billing transaction,
write a shadow event, reserve quota, or mutate a wallet. Shadow and
authoritative modes stay fail-closed until their PostgreSQL and recovery
dependencies are implemented and tested.

## Operations

| Endpoint | Purpose |
| --- | --- |
| `GET /healthz` | Process liveness; no upstream check. |
| `GET /readyz` | Readiness; returns `503` until an upstream adapter exists. |
| `GET /capabilities` | Configured adapters and the supported route catalog. |

Protocol routes preserve streaming responses and include a gateway-generated
`x-request-id`. Routes without a configured protocol family return `501`;
unknown routes return `404`.

The Next.js standalone tarball does not include the Gateway. During this
increment, `gateway:dev` runs Go while `gateway:start` intentionally remains the
legacy production command until the binary packaging task is complete. Do not
cut production traffic to the Go process yet. The deployment and cutover work
is tracked in [docs/DEPLOY.md](../../docs/DEPLOY.md).
