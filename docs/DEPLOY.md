# WinLume production deployment

## Runtime topology

Native WinLume is a two-process deployment with one PostgreSQL source of
truth:

| Process | Default bind | Owns |
| --- | --- | --- |
| Next.js web/control plane | `127.0.0.1:3001` | Auth.js, account and console UI, Studio, platform APIs. |
| Go gateway | `127.0.0.1:4010` | OpenAI-compatible public API, streaming proxying, API-key verification, wallet accounting. |
| PostgreSQL | private network | Users, organizations, keys, wallets, usage, subscriptions, payment records. |

Keep both HTTP listeners private. nginx terminates public TLS, sends web
traffic to port `3001`, and sends only the intended protocol paths such as
`/v1/` to port `4010`. The web process calls the gateway through
`WINLUME_GATEWAY_URL`, normally its loopback address.

`NEW_API_URL` is not a native production dependency. It is allowed only while
`WINLUME_AUTH_MODE=legacy` is deliberately enabled, or for the controlled
new-api migration. Do not set a default old endpoint during a native deploy.

## Host

- App directory: `/opt/winlume` Next.js standalone package, port `127.0.0.1:3001`
- Gateway directory: `/opt/winlume-gateway` Go binary + recovery directory, port `127.0.0.1:4010`
- Web service: `winlume.service`
- Gateway service: `winlume-gateway.service`
- Public hostname: configure the production DNS name and nginx virtual host for this environment

Existing operational host credentials remain in the gitignored `docs/INFRA.md`.
Verify the configured deploy target before changing DNS or systemd units; this
document intentionally does not make an old new-api host the production source
of truth.

## Required secrets and environment

Store files with owner-only permissions, for example `/etc/winlume/web.env`
and `/etc/winlume/gateway.env`. Do not put provider keys, database URLs, or
internal tokens in GitHub logs, the deployment tarball, or client bundles.

`/etc/winlume/web.env`:

```bash
NODE_ENV=production
NEXTAUTH_URL=https://winlume.example
AUTH_SECRET=replace-with-a-long-random-secret
DATABASE_URL=postgres://winlume:...
WINLUME_AUTH_MODE=winlume
WINLUME_GATEWAY_URL=http://127.0.0.1:4010
WINLUME_GATEWAY_INTERNAL_TOKEN=replace-with-a-distinct-random-secret
```

`/etc/winlume/gateway.env`:

```bash
DATABASE_URL=postgres://winlume:...
WINLUME_GATEWAY_HOST=127.0.0.1
WINLUME_GATEWAY_PORT=4010
WINLUME_GATEWAY_OPENAI_UPSTREAM_URL=https://provider.example/v1
WINLUME_GATEWAY_OPENAI_UPSTREAM_API_KEY=provider-service-key
WINLUME_GATEWAY_USE_PLATFORM_DATABASE=true
WINLUME_GATEWAY_INTERNAL_TOKEN=replace-with-the-same-internal-secret-as-web
WINLUME_GATEWAY_CORS_ORIGINS=https://winlume.example
WINLUME_GATEWAY_RESERVATION_MICROCREDITS=1000
WINLUME_GATEWAY_REQUEST_COST_MICROCREDITS=1000

# Billing safety gate. Start every new environment on "shadow": it writes
# usage/ledger rows without owning quota enforcement, so it is safe to run
# in production before any authoritative cutover. Only Task 23/24-authorized
# cutover work may change this to "authoritative".
WINLUME_GATEWAY_BILLING_MODE=shadow
# Required (must be "go") only when WINLUME_GATEWAY_BILLING_MODE=authoritative.
# WINLUME_GATEWAY_BILLING_OWNER=go
# Required for authoritative billing: "provider" for a directly-billed
# upstream, or "non_charging_new_api" for a new-api upstream that never bills.
# WINLUME_GATEWAY_UPSTREAM_OWNERSHIP=provider
# Required for authoritative billing: an absolute directory the gateway
# process exclusively owns for crash-recovery journals. Create it with the
# same owner as the systemd unit's User= and never share it with another
# process or gateway instance.
# WINLUME_GATEWAY_RECOVERY_DIR=/var/lib/winlume-gateway/recovery
```

The internal token must match exactly in both files. In native mode the
gateway uses `DATABASE_URL` to verify user-created API keys and attach the
user/organization identity for wallet accounting. Do not configure
`WINLUME_GATEWAY_API_KEY_HASHES` in that mode, because static hashes take
precedence over database verification. Keep
`WINLUME_GATEWAY_ALLOW_UNVERIFIED_KEYS` unset or `false` in production.

Amounts are integer microcredits. Set the reservation to cover the maximum
expected final charge, especially if an upstream returns
`x-winlume-cost-microcredits`. `0` records usage without an immutable wallet
hold or debit, which is useful only before prepaid enforcement is enabled.

If `WINLUME_GATEWAY_RECOVERY_DIR` is configured (authoritative mode only),
create it and set ownership before starting the service, matching the
systemd unit's `User=`:

```bash
mkdir -p /var/lib/winlume-gateway/recovery
chown winlume-gateway:winlume-gateway /var/lib/winlume-gateway/recovery
chmod 700 /var/lib/winlume-gateway/recovery
```

## Database and migration

### Automatic on every web deploy

The production GitHub Actions workflow (`.github/workflows/deploy.yml`) runs
schema migrations **after** unpacking the new release and restoring `.env`,
and **before** restarting `winlume.service`:

```bash
# remote host, WorkingDirectory=/opt/winlume
node scripts/db-migrate.mjs
```

The standalone tarball ships:

- `drizzle/*.sql` and `drizzle/meta/_journal.json`
- `scripts/db-migrate.mjs` (depends only on `pg`, no `drizzle-kit` on the host)

If migrations fail, the deploy aborts and the new process is **not** started.
That is intentional: code that expects new columns/tables must never come up
against an old schema (this is how Google login broke when
`users.is_service_account` was missing).

`scripts/db-migrate.mjs` is compatible with drizzle-kit's
`drizzle.__drizzle_migrations` journal. On a legacy database that already
has tables but an empty journal, it auto-baselines migrations whose effects
are already present, then applies only the remaining ones.

### Manual / local

From a full repo checkout (dev machines, emergency ops):

```bash
npm ci
# Prefer the production-compatible runner (also works locally):
npm run db:migrate:prod
# Or drizzle-kit's own runner (requires drizzle-kit):
npm run db:migrate
```

On the production host after a manual unpack:

```bash
cd /opt/winlume
set -a && . ./.env && [ -f /etc/winlume/web.env ] && . /etc/winlume/web.env; set +a
node scripts/db-migrate.mjs
# optional: node scripts/db-migrate.mjs --dry-run
```

Apply large or risky schema migrations in a maintenance window with a tested
PostgreSQL backup. The deploy workflow must not automatically import new-api
data. That migration is a separate, operator-reviewed action:

```bash
DATABASE_URL='postgres://winlume:...' \
NEW_API_MIGRATION_SOURCE_FILE=/secure/new-api-export.json \
npm run migration:new-api -- --report=/secure/new-api-dry-run.json

DATABASE_URL='postgres://winlume:...' \
NEW_API_MIGRATION_SOURCE_FILE=/secure/new-api-export.json \
WINLUME_MIGRATION_CHANNEL_ENCRYPTION_KEY='separately-managed-secret' \
npm run migration:new-api -- \
  --apply \
  --report=/secure/new-api-apply-report.json \
  --channel-artifact=/secure/new-api-channels.enc.json
```

Read [MIGRATE_NEW_API.md](MIGRATE_NEW_API.md) before performing either command.
The source connection must be read-only, reports must be stored in a restricted
directory, and old sessions/OAuth/MFA/passkeys are intentionally not imported.

## Web package

The existing standalone tarball contains only the Next.js web application:

```bash
npm ci
npm run build
npm run package:deploy
# produces winlume-deploy.tar.gz
```

Unpack it into `/opt/winlume`, preserve its `data/` directory if local runtime
storage is still in use, and configure `winlume.service` to load
`/etc/winlume/web.env`:

```ini
[Unit]
Description=WinLume Next.js web/control plane
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/winlume
Environment=PORT=3001
Environment=HOSTNAME=127.0.0.1
EnvironmentFile=/etc/winlume/web.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

The generated `.env.production.example` is a template only. Replace every
secret before enabling the unit.

## Gateway process

The standalone web tarball deliberately does **not** bundle the gateway. The
gateway is a single statically-linked Go binary with no Node, `npm`, or `tsx`
dependency on the production host.

Build the Linux binary from a repository checkout (CI or a build host, not
necessarily the production host itself):

```bash
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
  go -C services/gateway build -trimpath -o gateway ./cmd/gateway
```

`npm run gateway:build` runs the same command for a local/dev-arch build.
Copy the resulting binary to the production host:

```bash
install -d -m 755 /opt/winlume-gateway
install -m 755 services/gateway/gateway /opt/winlume-gateway/winlume-gateway
```

`npm run db:migrate` (run once, from any host that can reach
`DATABASE_URL`, typically the web checkout) applies the shared schema the
gateway reads and writes; the gateway binary itself runs no migrations.

Start the gateway with a systemd unit that points directly at the binary:

```ini
[Unit]
Description=WinLume Go gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=winlume-gateway
Group=winlume-gateway
WorkingDirectory=/opt/winlume-gateway
EnvironmentFile=/etc/winlume/gateway.env
ExecStart=/opt/winlume-gateway/winlume-gateway
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

If `WINLUME_GATEWAY_BILLING_MODE=authoritative` is set, create
`WINLUME_GATEWAY_RECOVERY_DIR` and give it the same owner as this unit's
`User=` before the first start (see the recovery directory example above).

After adding or changing either unit:

```bash
systemctl daemon-reload
systemctl enable --now winlume winlume-gateway
curl -fsS http://127.0.0.1:3001/studio >/dev/null
curl -fsS http://127.0.0.1:4010/healthz
curl -fsS http://127.0.0.1:4010/readyz
```

`/readyz` returns `503` until at least one upstream adapter is configured.
Use `/capabilities` to confirm the protocol families that can be served. See
[services/gateway/README.md](../services/gateway/README.md) for API-key and
accounting behavior.

## nginx routing

Keep the gateway listener private and use streaming-safe proxy settings:

```nginx
location /v1/ {
    proxy_pass http://127.0.0.1:4010;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Request-ID $request_id;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_read_timeout 3600;
}

location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

Use the correct TLS virtual host for the environment. Do not cache `/api/`,
`/studio`, or streaming protocol responses. Browser CORS is not an API-key
security boundary; clients must still keep user-issued API keys out of
untrusted browser code. The gateway trusts forwarding headers only from
loopback by default. If nginx runs on another machine, set
`WINLUME_GATEWAY_TRUSTED_PROXY_IPS` to that proxy's fixed address or CIDR
before enabling API-key IP allowlists.

## GitHub Actions web deployment

`.github/workflows/deploy.yml` packages and restarts the web standalone
service. It normalizes the package-local environment to
`WINLUME_AUTH_MODE=winlume` and removes inherited legacy variables. It also
refuses the deployment when `/etc/winlume/web.env` still declares legacy mode
or a `NEW_API_URL`/legacy credential, because that file has higher systemd
precedence. It does not update or restart `/opt/winlume-gateway`. Build and
copy the new gateway binary and restart `winlume-gateway.service` as a
coordinated step, then verify both health endpoints. Keep database and
gateway secrets pre-provisioned on the host rather than passing them through
workflow output.

## new-api shutdown checklist

1. Take recoverable target and source database backups; apply WinLume schema migrations.
2. Run a dry-run migration, review reconciliation counts/balances, then run the explicit `--apply` import.
3. Configure the encrypted channel handoff in the native gateway and verify `/readyz` plus `/capabilities`.
4. Deploy the web and gateway processes with `WINLUME_AUTH_MODE=winlume`, matching internal tokens, and a native `WINLUME_GATEWAY_URL`.
5. Verify login, registration, migrated API keys, wallet balances, a metered gateway request, and subscription/payment history with production-like data.
6. Announce that sessions, OAuth bindings, MFA, and passkeys must be enrolled again; invalidate old access paths.
7. Remove `NEW_API_URL`, legacy OAuth credentials, and legacy transport tokens from both `/opt/winlume/.env` and `/etc/winlume/web.env`; the web deploy rejects these values by design. Confirm every `WINLUME_GATEWAY_*_UPSTREAM_URL` in `/etc/winlume/gateway.env` targets a new direct provider/channel, observe the native path, and only then stop old new-api.

Do not run both systems as independent writers for balances or usage after the
cutover. Keep source backups and migration reports until reconciliation and
rollback windows have closed.

## Skills corpus

The production web image should include the full `content/skills` corpus. Run
`IMPORT_ALL=1 node scripts/import-agency-agents.mjs` before the web build when
regenerating it. MCP is not enabled; tools are server builtins only.
