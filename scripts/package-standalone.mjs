/**
 * Package Next.js standalone output for the web/control-plane deploy.
 * Run after: npm run build
 *
 * Output: winlume-deploy.tar.gz (gitignored)
 *
 * The Go gateway is intentionally not bundled here. It ships as its own
 * Linux binary and systemd unit; see docs/DEPLOY.md.
 */
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const stage = join(root, "_deploy_clean");
const tarOut = join(root, "winlume-deploy.tar.gz");
const standalone = join(root, ".next", "standalone");

function must(path, label) {
  if (!existsSync(path)) {
    console.error(`Missing ${label}: ${path}`);
    process.exit(1);
  }
}

must(join(standalone, "server.js"), "standalone server.js");
must(join(root, ".next", "static"), ".next/static");
const contentDirectories = ["skills", "production-packs"];
for (const directory of contentDirectories) {
  must(join(root, "content", directory), `content/${directory}`);
}

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

cpSync(join(standalone, "server.js"), join(stage, "server.js"));
cpSync(join(standalone, "package.json"), join(stage, "package.json"));
if (existsSync(join(standalone, "node_modules"))) {
  cpSync(join(standalone, "node_modules"), join(stage, "node_modules"), { recursive: true });
}

if (existsSync(join(standalone, ".next"))) {
  cpSync(join(standalone, ".next"), join(stage, ".next"), { recursive: true });
}

// Turbopack standalone can externalize packages under hashed names such as
// `pg-<hash>`. Symlink those back to the real package so require() resolves.
// The server output must be copied before scanning it; otherwise this block
// silently sees no `.next/server` directory and production misses the links.
{
  const stageModules = join(stage, "node_modules");
  const nextServer = join(stage, ".next", "server");
  if (existsSync(stageModules) && existsSync(nextServer)) {
    const hashNames = new Set();
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
        const text = readFileSync(full, "utf8");
        for (const match of text.matchAll(/["']((?:pg|bcryptjs|sharp)-[a-f0-9]{8,})["']/g)) {
          hashNames.add(match[1]);
        }
      }
    };
    walk(nextServer);
    for (const hashed of hashNames) {
      const real = hashed.replace(/-[a-f0-9]{8,}$/, "");
      const linkPath = join(stageModules, hashed);
      const targetPath = join(stageModules, real);
      if (!existsSync(targetPath) || existsSync(linkPath)) continue;
      try {
        if (existsSync(linkPath) && lstatSync(linkPath).isSymbolicLink()) continue;
        symlinkSync(real, linkPath);
        console.log(`linked external ${hashed} -> ${real}`);
      } catch (error) {
        console.warn(`failed to link ${hashed}:`, error);
      }
    }
  }
}
mkdirSync(join(stage, ".next", "static"), { recursive: true });
cpSync(join(root, ".next", "static"), join(stage, ".next", "static"), { recursive: true });
if (existsSync(join(root, "public"))) {
  cpSync(join(root, "public"), join(stage, "public"), { recursive: true });
}
mkdirSync(join(stage, "content"), { recursive: true });
for (const directory of contentDirectories) {
  cpSync(join(root, "content", directory), join(stage, "content", directory), {
    recursive: true,
  });
}
mkdirSync(join(stage, "data"), { recursive: true });

// Ship SQL migrations + the production migrator so deploy can apply schema
// changes before restarting the web process. Snapshots are not required at
// runtime (only meta/_journal.json + *.sql).
{
  must(join(root, "drizzle", "meta", "_journal.json"), "drizzle journal");
  must(join(root, "scripts", "db-migrate.mjs"), "db-migrate script");
  const drizzleStage = join(stage, "drizzle");
  mkdirSync(join(drizzleStage, "meta"), { recursive: true });
  cpSync(join(root, "drizzle", "meta", "_journal.json"), join(drizzleStage, "meta", "_journal.json"));
  for (const entry of readdirSync(join(root, "drizzle"))) {
    if (!entry.endsWith(".sql")) continue;
    cpSync(join(root, "drizzle", entry), join(drizzleStage, entry));
  }
  mkdirSync(join(stage, "scripts"), { recursive: true });
  cpSync(join(root, "scripts", "db-migrate.mjs"), join(stage, "scripts", "db-migrate.mjs"));

  // Ensure `pg` is resolvable for the migrator even if the Next standalone
  // tree omits it (it is a direct dependency of the app, but be explicit).
  const stagePg = join(stage, "node_modules", "pg");
  const rootPg = join(root, "node_modules", "pg");
  if (!existsSync(stagePg) && existsSync(rootPg)) {
    mkdirSync(join(stage, "node_modules"), { recursive: true });
    cpSync(rootPg, stagePg, { recursive: true });
    console.log("bundled node_modules/pg for db-migrate");
  }
  // pg's optional native deps / transitive `postgres-array` etc.
  for (const dep of ["pg-types", "pg-protocol", "pg-connection-string", "pg-pool", "pg-int8", "pgpass", "postgres-array", "postgres-bytea", "postgres-date", "postgres-interval", "xtend", "split2"]) {
    const from = join(root, "node_modules", dep);
    const to = join(stage, "node_modules", dep);
    if (!existsSync(to) && existsSync(from)) {
      cpSync(from, to, { recursive: true });
    }
  }
}

writeFileSync(
  join(stage, ".env.production.example"),
  [
    "# This environment file is for the Next.js web/control-plane process.",
    "# Deploy the Go gateway binary separately; see docs/DEPLOY.md.",
    "NODE_ENV=production",
    "PORT=3001",
    "HOSTNAME=127.0.0.1",
    "NEXTAUTH_URL=https://winlume.example",
    "AUTH_SECRET=",
    "DATABASE_URL=",
    "WINLUME_AUTH_MODE=winlume",
    "WINLUME_GATEWAY_URL=http://127.0.0.1:4010",
    "WINLUME_GATEWAY_INTERNAL_TOKEN=",
    "WINLUME_SERVICE_KEY=",
    "# NEW_API_URL=  # legacy compatibility only; leave unset after cutover",
    "",
  ].join("\n"),
);

rmSync(tarOut, { force: true });
const tar = spawnSync(
  "tar",
  ["-czf", tarOut, "-C", stage, "."],
  { stdio: "inherit", shell: process.platform === "win32" },
);
if (tar.status !== 0) {
  console.error("tar failed");
  process.exit(tar.status ?? 1);
}
console.log("Wrote", tarOut);
