import { importSkillHub } from "../src/lib/agent/skills/skillhub-catalog.ts";

const perDepartment = Number(process.env.SKILLHUB_PER_DEPARTMENT || 15);
const result = await importSkillHub(perDepartment);
console.log(`imported skillhub skills: ${result.imported}`);
console.log(`skipped: ${result.skipped.length}`);
for (const s of result.skipped) console.log(`  - ${s.slug}: ${s.reason}`);
