import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { getPlatformRepositories } from "@/lib/platform/repositories";
import { skillToInsert } from "@/lib/platform/repositories/skills";
import { MASTER_SKILL_REPO, readMasterSkillPackages } from "./master-skill";
import { clearSkillsCache } from "./registry";

export function masterSkillRootDir(): string {
  return process.env.REIZO_MASTER_SKILL_DIR?.trim() || join("/tmp", "master-skill");
}

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

export async function ensureMasterSkillCheckout(rootDir = masterSkillRootDir()): Promise<string> {
  try {
    await access(join(rootDir, "prototypes"));
    return rootDir;
  } catch {
    await runCommand("git", ["clone", "--depth", "1", MASTER_SKILL_REPO, rootDir]);
    return rootDir;
  }
}

export async function importMasterSkills(rootDir?: string): Promise<{ imported: number; rootDir: string }> {
  const repositories = getPlatformRepositories();
  if (!repositories) throw new Error("平台数据库尚未配置。");
  const resolved = await ensureMasterSkillCheckout(rootDir ?? masterSkillRootDir());
  const packages = await readMasterSkillPackages(resolved);
  const written = await repositories.skills.upsertMany(
    packages.map(({ skill, originPath }) =>
      skillToInsert(skill, { origin: "master-skill", originPath }),
    ),
  );
  clearSkillsCache();
  return { imported: written, rootDir: resolved };
}
