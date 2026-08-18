import { translateImportedSkillLabels } from "../src/lib/agent/skills/translate-zh.ts";

let rounds = 0;
let total = 0;
while (rounds < 80) {
  const result = await translateImportedSkillLabels({ limit: 30 });
  total += result.translated;
  console.log(
    `round ${rounds + 1}: translated=${result.translated} skipped=${result.skipped} failed=${result.failed} total=${total}`,
  );
  if (result.translated === 0) break;
  rounds += 1;
}
console.log(`done, translated ${total}`);
