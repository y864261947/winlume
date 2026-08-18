import { seedBundledSkills } from "../src/lib/agent/skills/registry.ts";
import { importOpenCatalogs } from "../src/lib/agent/skills/import-catalogs.ts";
import { importMasterSkills } from "../src/lib/agent/skills/import-master.ts";

const bundled = await seedBundledSkills();
console.log(`synced bundled skills: ${bundled}`);
const imported = await importMasterSkills(process.env.REIZO_MASTER_SKILL_DIR || "/tmp/master-skill");
console.log(`imported master-skill: ${imported.imported} from ${imported.rootDir}`);
const open = await importOpenCatalogs();
console.log(`imported open catalogs: ${open.imported}`, open.catalogs);
