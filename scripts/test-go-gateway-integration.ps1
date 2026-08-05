<#
.SYNOPSIS
    Runs the go-gateway-billing PostgreSQL integration test suite against a
    disposable, throwaway Postgres instance.

.DESCRIPTION
    1. Starts *only* the `postgres` service defined in
       services/gateway/compose.test.yml, under the dedicated compose
       project `winlume-gateway-test`.
    2. Waits for it to report healthy (pg_isready).
    3. Builds a TEST_DATABASE_URL pointing at it (never printed).
    4. Applies drizzle/0000 .. drizzle/0003 in order with
       `psql -v ON_ERROR_STOP=1`, then runs a lightweight post-migration
       sanity check (see Test-MigrationsApplied below) because
       ON_ERROR_STOP alone cannot detect a migration file that runs every
       statement successfully but never commits its transaction.
    5. Runs `go test -tags=integration ./...` in services/gateway.
    6. In a finally block, verifies that the compose project actually
       running under the `winlume-gateway-test` name is the one this script
       started, then tears it down (including its volume). This script must
       never remove a compose project/volume it did not first verify.

    Safe to run repeatedly and safe to Ctrl-C: the finally block always
    attempts teardown, and teardown is scoped to the verified test project
    only. It never touches any other database, container, or volume.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/test-go-gateway-integration.ps1
#>

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ComposeFile = Join-Path $RepoRoot "services/gateway/compose.test.yml"
$GatewayDir = Join-Path $RepoRoot "services/gateway"
$DrizzleDir = Join-Path $RepoRoot "drizzle"
$ComposeProject = "winlume-gateway-test"

$PgHost = "127.0.0.1"
$PgPort = 55432
$PgUser = "gateway_test"
$PgPassword = "gateway_test"
$PgDatabase = "winlume_gateway_test"

# Tables introduced by (or already present before) drizzle/0003 that would
# not exist if 0003's transaction was opened but never committed. This is a
# real historical bug: drizzle/0003_go_gateway_billing.sql used to open a
# `BEGIN` (required to run `ALTER TYPE ... ADD VALUE` outside its own
# surrounding transaction) but never closed it with `COMMIT`. `psql -v
# ON_ERROR_STOP=1` reports success in that case -- every statement ran fine
# -- and the whole migration silently vanishes on disconnect. Checking for
# these tables from a *fresh* connection after psql exits is what would have
# caught it.
$ExpectedTablesAfterMigrations = @(
    "users",                     # from 0000, sanity that early migrations ran
    "wallets",                   # from 0000/0001
    "pricing_catalog_versions",  # from 0003
    "billing_shadow_events",     # from 0003
    "gateway_relay_attempts"     # from 0003
)

$script:ComposeStarted = $false

function Test-DockerAvailable {
    $null = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $?) {
        throw "docker is not available on PATH. Install Docker Desktop (or the docker CLI) and ensure the daemon is running before running this script."
    }
}

function Get-ComposeProjectContainerIds {
    param([string]$ProjectName)

    # `docker compose -p <name> ... ps -q` only ever lists containers that
    # docker compose itself has labeled with that project name -- this is
    # the verification step: we do not trust that $ComposeProject is what we
    # think it is, we ask docker what is actually running under that label.
    $ids = & docker compose -p $ProjectName -f $ComposeFile ps -q 2>$null
    if ($LASTEXITCODE -ne 0) {
        return @()
    }
    return @($ids | Where-Object { $_ -and $_.Trim() -ne "" })
}

function Start-TestPostgres {
    Write-Host "Starting disposable Postgres (compose project '$ComposeProject')..."
    & docker compose -p $ComposeProject -f $ComposeFile up -d postgres
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose up failed for project '$ComposeProject'."
    }
    $script:ComposeStarted = $true

    Write-Host "Waiting for Postgres to become healthy..."
    $deadline = (Get-Date).AddSeconds(60)
    $healthy = $false
    while ((Get-Date) -lt $deadline) {
        $containerId = (& docker compose -p $ComposeProject -f $ComposeFile ps -q postgres 2>$null | Select-Object -First 1)
        if ($containerId) {
            $status = (& docker inspect --format "{{.State.Health.Status}}" $containerId 2>$null)
            if ($status -eq "healthy") {
                $healthy = $true
                break
            }
        }
        Start-Sleep -Seconds 2
    }
    if (-not $healthy) {
        throw "Postgres did not become healthy within 60 seconds."
    }
    Write-Host "Postgres is healthy."
}

function Get-TestDatabaseUrl {
    # Not printed anywhere. Callers must not Write-Host this value.
    return "postgres://${PgUser}:${PgPassword}@${PgHost}:${PgPort}/${PgDatabase}?sslmode=disable"
}

function Invoke-Migrations {
    param([string]$DatabaseUrl)

    $null = Get-Command psql -ErrorAction SilentlyContinue
    if (-not $?) {
        throw "psql is not available on PATH. Install the PostgreSQL client tools before running this script."
    }

    $migrationFiles = Get-ChildItem -Path $DrizzleDir -Filter "*.sql" |
        Where-Object { $_.Name -match "^\d{4}_" } |
        Sort-Object Name

    if (-not $migrationFiles -or $migrationFiles.Count -eq 0) {
        throw "No migration files found under $DrizzleDir."
    }

    foreach ($file in $migrationFiles) {
        Write-Host "Applying migration $($file.Name)..."
        & psql $DatabaseUrl -v ON_ERROR_STOP=1 -f $file.FullName --quiet
        if ($LASTEXITCODE -ne 0) {
            throw "Migration $($file.Name) failed (psql exit code $LASTEXITCODE)."
        }
    }

    Test-MigrationsApplied -DatabaseUrl $DatabaseUrl -AppliedFileCount $migrationFiles.Count
}

function Test-MigrationsApplied {
    param(
        [string]$DatabaseUrl,
        [int]$AppliedFileCount
    )

    # IMPORTANT: this check must run over a *fresh* psql invocation/connection,
    # not reuse any session the migration files held open. A migration file
    # that opens a transaction and never commits it will still show its
    # objects as visible to further statements sent down the *same*
    # connection/session; only a brand-new connection after full disconnect
    # reveals that the transaction was rolled back on connection close. Each
    # `psql -f` above runs as its own process/connection and has already
    # fully exited by the time we get here, so this query is safe.
    Write-Host "Verifying $AppliedFileCount migration file(s) actually committed..."

    $tableList = ($ExpectedTablesAfterMigrations | ForEach-Object { "'$_'" }) -join ","
    $query = "SELECT string_agg(table_name, ',') FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ($tableList);"

    $result = & psql $DatabaseUrl -v ON_ERROR_STOP=1 --quiet --tuples-only --no-align -c $query
    if ($LASTEXITCODE -ne 0) {
        throw "Post-migration verification query failed (psql exit code $LASTEXITCODE)."
    }

    $foundTables = @()
    if ($result) {
        $foundTables = @($result.Trim() -split "," | Where-Object { $_ -ne "" })
    }

    $missing = $ExpectedTablesAfterMigrations | Where-Object { $foundTables -notcontains $_ }
    if ($missing.Count -gt 0) {
        throw "Post-migration verification failed: expected tables missing after applying migrations (likely an uncommitted migration transaction): $($missing -join ', ')"
    }

    Write-Host "Post-migration verification passed: all expected tables are present."
}

function Invoke-IntegrationTests {
    param([string]$DatabaseUrl)

    Write-Host "Running go test -tags=integration ./... in services/gateway ..."
    Push-Location $GatewayDir
    try {
        $env:TEST_DATABASE_URL = $DatabaseUrl
        & go test -tags=integration ./...
        $exitCode = $LASTEXITCODE
    }
    finally {
        Remove-Item Env:\TEST_DATABASE_URL -ErrorAction SilentlyContinue
        Pop-Location
    }

    if ($exitCode -ne 0) {
        throw "go test -tags=integration failed (exit code $exitCode)."
    }
}

function Remove-TestPostgres {
    if (-not $script:ComposeStarted) {
        Write-Host "Skipping teardown: this script never started the test compose project."
        return
    }

    # Verification, not trust: ask docker what is actually running under the
    # $ComposeProject label right now, using the exact compose file this
    # script uses. Only tear down if docker confirms there is something
    # there that this project/file combination owns. This is what prevents
    # `down -v` from ever being run "blind" against whatever happens to be
    # the current docker compose context.
    $containerIds = Get-ComposeProjectContainerIds -ProjectName $ComposeProject
    if ($containerIds.Count -eq 0) {
        Write-Host "No containers found under verified compose project '$ComposeProject'; nothing to tear down."
        return
    }

    Write-Host "Verified $($containerIds.Count) container(s) under compose project '$ComposeProject'. Tearing down (including volume)..."
    & docker compose -p $ComposeProject -f $ComposeFile down -v
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "docker compose down -v exited with code $LASTEXITCODE for project '$ComposeProject'. Manual cleanup may be required: docker compose -p $ComposeProject -f `"$ComposeFile`" down -v"
        return
    }
    Write-Host "Test compose project '$ComposeProject' stopped and removed."
}

try {
    Test-DockerAvailable
    Start-TestPostgres

    $databaseUrl = Get-TestDatabaseUrl
    Invoke-Migrations -DatabaseUrl $databaseUrl
    Invoke-IntegrationTests -DatabaseUrl $databaseUrl

    Write-Host "Integration tests passed."
}
finally {
    Remove-TestPostgres
}
