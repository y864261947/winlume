import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { getPlatformRepositories } from "@/lib/platform/repositories";
import { skillToInsert } from "@/lib/platform/repositories/skills";
import { OPEN_CATALOGS, type OpenCatalogId } from "./open-catalogs";
import { clearSkillsCache } from "./registry";

function runCommand(command: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${command} exited ${code}`));
    });
  });
}

async function ensureCheckout(repo: string, rootDir: string, marker: string): Promise<string> {
  try {
    await access(join(rootDir, marker));
    return rootDir;
  } catch {
    await runCommand("git", ["clone", "--depth", "1", repo, rootDir]);
    return rootDir;
  }
}

export async function importOpenCatalogs(
  catalogIds?: OpenCatalogId[],
): Promise<{ imported: number; catalogs: Array<{ id: string; imported: number; skipped: number }> }> {
  const repositories = getPlatformRepositories();
  if (!repositories) throw new Error("平台数据库尚未配置。");
  const selected = catalogIds?.length
    ? OPEN_CATALOGS.filter((catalog) => catalogIds.includes(catalog.id))
    : [...OPEN_CATALOGS];
  if (!selected.length) return { imported: 0, catalogs: [] };

  const existing = new Set(await repositories.skills.listIds());
  const catalogs: Array<{ id: string; imported: number; skipped: number }> = [];
  let imported = 0;

  for (const catalog of selected) {
    const root = await ensureCheckout(catalog.repo, catalog.defaultDir, catalog.marker);
    const packages = await catalog.read(root);
    const rows = [];
    let skipped = 0;
    for (const item of packages) {
      if (catalog.skipExistingIds && existing.has(item.skill.id)) {
        skipped += 1;
        continue;
      }
      rows.push(skillToInsert(item.skill, { origin: catalog.id, originPath: item.originPath }));
      existing.add(item.skill.id);
    }
    const written = await repositories.skills.upsertMany(rows);
    imported += written;
    catalogs.push({ id: catalog.id, imported: written, skipped });
  }

  clearSkillsCache();
  return { imported, catalogs };
}
