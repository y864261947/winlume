/**
 * Production-safe PostgreSQL migrator for Reizo.
 *
 * Compatible with drizzle-kit's journal format and the
 * drizzle.__drizzle_migrations table, but depends only on `pg` so it can
 * run from the Next.js standalone package (no drizzle-kit on the host).
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/db-migrate.mjs
 *   node scripts/db-migrate.mjs --dry-run
 *   node scripts/db-migrate.mjs --migrations-dir=/path/to/drizzle
 *
 * Behaviour:
 * - Applies pending migrations in journal order inside a transaction each.
 * - If the journal table is empty but the schema already exists (legacy
 *   production installs that never recorded migrations), auto-baselines
 *   migrations whose effects are already present, then applies the rest.
 * - Exits non-zero on failure so deploy pipelines stop before restarting
 *   the app onto an incompatible schema.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

function parseArgs(argv) {
  const options = {
    dryRun: false,
    migrationsDir: join(repoRoot, "drizzle"),
    help: false,
  };
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg.startsWith("--migrations-dir=")) {
      const value = arg.slice("--migrations-dir=".length);
      options.migrationsDir = isAbsolute(value) ? value : resolve(process.cwd(), value);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function loadPg() {
  const require = createRequire(import.meta.url);
  const candidates = [
    join(process.cwd(), "node_modules", "pg"),
    join(repoRoot, "node_modules", "pg"),
    "pg",
  ];
  let lastError;
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `Cannot resolve the "pg" package. Install dependencies or ship node_modules/pg with the deploy package. Last error: ${lastError}`,
  );
}

function readMigrations(migrationsDir) {
  const journalPath = join(migrationsDir, "meta", "_journal.json");
  if (!existsSync(journalPath)) {
    throw new Error(`Missing migration journal: ${journalPath}`);
  }
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
    throw new Error(`Migration journal has no entries: ${journalPath}`);
  }

  return journal.entries.map((entry) => {
    const sqlPath = join(migrationsDir, `${entry.tag}.sql`);
    if (!existsSync(sqlPath)) {
      throw new Error(`Missing migration SQL: ${sqlPath}`);
    }
    const sql = readFileSync(sqlPath, "utf8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((part) => part.trim())
      .filter(Boolean);
    return {
      tag: entry.tag,
      folderMillis: entry.when,
      hash: createHash("sha256").update(sql).digest("hex"),
      statements,
    };
  });
}

/**
 * Cheap presence probes for migrations that may already exist on a DB that
 * was created outside drizzle's journal. Unknown tags return false so they
 * always run (safe default for future migrations).
 */
async function migrationAlreadyApplied(client, tag) {
  const q = async (sql, params = []) => {
    const result = await client.query(sql, params);
    return result.rows[0]?.ok === true;
  };

  if (tag.startsWith("0000_")) {
    return q(`SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
    ) AS ok`);
  }
  if (tag.startsWith("0001_")) {
    return q(`SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'payment_orders'
    ) AS ok`);
  }
  if (tag.startsWith("0002_")) {
    return q(`SELECT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'personality_presets_personal_default_unique'
    ) AS ok`);
  }
  if (tag.startsWith("0003_")) {
    return q(`SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'api_key_billing_policies'
    ) AS ok`);
  }
  if (tag.startsWith("0004_")) {
    return q(`SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'is_service_account'
    ) AS ok`);
  }
  if (tag.startsWith("0008_")) {
    return q(`SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'studio_skills'
    ) AS ok`);
  }
  return false;
}

async function ensureMigrationsTable(client) {
  await client.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);
}

async function loadApplied(client) {
  const result = await client.query(
    `SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at ASC, id ASC`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    hash: row.hash,
    createdAt: Number(row.created_at),
  }));
}

async function recordMigration(client, migration) {
  await client.query(
    `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
    [migration.hash, migration.folderMillis],
  );
}

async function applyMigration(client, migration, { dryRun, baseline }) {
  if (dryRun) {
    console.log(
      `[dry-run] ${baseline ? "baseline" : "apply"} ${migration.tag} (${migration.statements.length} statements)`,
    );
    return;
  }

  await client.query("BEGIN");
  try {
    if (!baseline) {
      for (const statement of migration.statements) {
        await client.query(statement);
      }
    }
    await recordMigration(client, migration);
    await client.query("COMMIT");
    console.log(
      `${baseline ? "baselined" : "applied"} ${migration.tag} hash=${migration.hash.slice(0, 12)}…`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

function printHelp() {
  console.log(`Usage: node scripts/db-migrate.mjs [options]

Options:
  --dry-run                 Print planned actions without writing
  --migrations-dir=PATH     Override drizzle folder (default: ./drizzle)
  --help                    Show this help

Requires DATABASE_URL in the environment.
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    return 2;
  }

  const migrations = readMigrations(options.migrationsDir);
  const { Client } = loadPg();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await loadApplied(client);
    const appliedHashes = new Set(applied.map((row) => row.hash));
    // drizzle-kit also keys "already applied" by the highest created_at.
    // We prefer hash matching so baselined/out-of-order rows stay correct.
    const lastCreatedAt = applied.reduce(
      (max, row) => (Number.isFinite(row.createdAt) ? Math.max(max, row.createdAt) : max),
      0,
    );

    const journalEmpty = applied.length === 0;
    let usersExists = false;
    if (journalEmpty) {
      const probe = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'users'
        ) AS ok
      `);
      usersExists = probe.rows[0]?.ok === true;
      if (usersExists) {
        console.log(
          "Migration journal is empty but public.users exists — will baseline already-present migrations.",
        );
      }
    }

    let appliedCount = 0;
    let baselinedCount = 0;
    let skippedCount = 0;

    for (const migration of migrations) {
      if (appliedHashes.has(migration.hash)) {
        skippedCount += 1;
        continue;
      }
      // Mirror drizzle-kit ordering guard: never re-apply older folderMillis
      // once a newer row exists, unless this hash was simply never recorded.
      if (lastCreatedAt > 0 && migration.folderMillis <= lastCreatedAt && !journalEmpty) {
        // Hash not recorded but folderMillis is older than last applied —
        // treat as a journal gap and baseline if effects exist, else apply.
      }

      let baseline = false;
      if (journalEmpty && usersExists) {
        baseline = await migrationAlreadyApplied(client, migration.tag);
      } else if (!appliedHashes.has(migration.hash)) {
        // Hash missing: either a journal gap or the SQL was applied by hand
        // before the deploy recorded it. Probe known tags even when this
        // folderMillis is newer than the last journal row.
        baseline = await migrationAlreadyApplied(client, migration.tag);
      }

      await applyMigration(client, migration, {
        dryRun: options.dryRun,
        baseline,
      });
      if (baseline) baselinedCount += 1;
      else appliedCount += 1;
      appliedHashes.add(migration.hash);
    }

    console.log(
      `migrate complete: applied=${appliedCount} baselined=${baselinedCount} already_recorded=${skippedCount} dry_run=${options.dryRun}`,
    );
    return 0;
  } finally {
    await client.end().catch(() => {});
  }
}

main()
  .then((code) => {
    process.exit(code ?? 0);
  })
  .catch((error) => {
    console.error("db-migrate failed:", error instanceof Error ? error.message : error);
    if (error && typeof error === "object" && "stack" in error) {
      console.error(error.stack);
    }
    process.exit(1);
  });
