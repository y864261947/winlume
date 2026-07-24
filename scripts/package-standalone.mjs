/**
 * Package Next.js standalone output for /opt/winlume deploy.
 * Run after: npm run build
 *
 * Output: winlume-deploy.tar.gz (gitignored)
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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
must(join(root, "content", "skills"), "content/skills");

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
mkdirSync(join(stage, ".next", "static"), { recursive: true });
cpSync(join(root, ".next", "static"), join(stage, ".next", "static"), { recursive: true });
if (existsSync(join(root, "public"))) {
  cpSync(join(root, "public"), join(stage, "public"), { recursive: true });
}
mkdirSync(join(stage, "content"), { recursive: true });
cpSync(join(root, "content", "skills"), join(stage, "content", "skills"), {
  recursive: true,
});
mkdirSync(join(stage, "data"), { recursive: true });
writeFileSync(
  join(stage, ".env.production.example"),
  [
    "NODE_ENV=production",
    "PORT=3001",
    "HOSTNAME=127.0.0.1",
    "NEW_API_URL=https://v2api.top",
    "WINLUME_GATEWAY_TOKEN=",
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
