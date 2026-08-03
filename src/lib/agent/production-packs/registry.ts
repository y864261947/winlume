import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { listSkills } from "@/lib/agent/skills/registry";
import {
  parseProductionPack,
  toProductionPackMeta,
  validatePackSkills,
  type ProductionPack,
} from "./contracts";

export type ProductionPackRegistry = {
  list(): Promise<ProductionPack[]>;
  get(id: string): Promise<ProductionPack | null>;
  listForScene(sceneId: string): Promise<ProductionPack[]>;
};

export type CreateProductionPackRegistryOptions = {
  rootDir: string;
  listSkillIds: () => Promise<ReadonlySet<string>>;
};

export function productionPacksRootDir(): string {
  // Keep the runtime lookup constrained to the bundle's declared content tree.
  return join(
    /* turbopackIgnore: true */ process.cwd(),
    "content",
    "production-packs",
  );
}

/**
 * Load declarative production Packs only after their referenced Skills pass
 * the normal Skill registry validation. A malformed package is unavailable,
 * rather than becoming a partially configured workflow.
 */
export function createProductionPackRegistry(
  options: CreateProductionPackRegistryOptions,
): ProductionPackRegistry {
  async function list(): Promise<ProductionPack[]> {
    let entries: string[];
    try {
      entries = await readdir(options.rootDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }

    const availableSkillIds = await options.listSkillIds();
    const packs: ProductionPack[] = [];

    for (const name of entries.sort((a, b) => a.localeCompare(b, "en"))) {
      if (name.startsWith(".")) continue;

      const dir = join(options.rootDir, name);
      try {
        if (!(await stat(dir)).isDirectory()) continue;

        const pack = parseProductionPack(
          await readFile(join(dir, "pack.json"), "utf8"),
          name,
        );
        validatePackSkills(pack, availableSkillIds);
        packs.push(pack);
      } catch {
        console.warn("[production-packs] invalid package skipped:", dir);
      }
    }

    return packs;
  }

  return {
    list,
    async get(id) {
      if (!id || id.includes("/") || id.includes("\\")) return null;
      return (await list()).find((pack) => pack.id === id) ?? null;
    },
    async listForScene(sceneId) {
      if (!sceneId) return [];
      return (await list()).filter((pack) => pack.sceneIds.includes(sceneId));
    },
  };
}

const productionPackRegistry = createProductionPackRegistry({
  rootDir: productionPacksRootDir(),
  listSkillIds: async () => new Set((await listSkills()).map((skill) => skill.id)),
});

export async function listProductionPacks(): Promise<ProductionPack[]> {
  return productionPackRegistry.list();
}

export async function getProductionPack(
  id: string,
): Promise<ProductionPack | null> {
  return productionPackRegistry.get(id);
}

export async function listProductionPacksForScene(
  sceneId: string,
): Promise<ProductionPack[]> {
  return productionPackRegistry.listForScene(sceneId);
}

export { toProductionPackMeta };
