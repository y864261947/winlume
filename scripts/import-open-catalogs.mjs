import { importOpenCatalogs } from "../src/lib/agent/skills/import-catalogs.ts";

const result = await importOpenCatalogs();
console.log(`imported open catalogs: ${result.imported}`);
for (const catalog of result.catalogs) {
  console.log(`  ${catalog.id}: +${catalog.imported} skipped=${catalog.skipped}`);
}
