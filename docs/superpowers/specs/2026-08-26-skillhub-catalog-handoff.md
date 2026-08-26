# SkillHub Catalog Import — Handoff

**Date:** 2026-08-26
**Status:** Backend done and verified live in production. Frontend card redesign written but unverified (dev server was hung at handoff time).

## What changed

1. **Production `studio_skills` table** (Postgres, `winlume` DB on 15.204.123.217):
   - Imported 115 skills from SkillHub (skillhub.cn), tagged `origin = 'skillhub'`, spread across the existing 8-category workbench (`content-marketing` 15, `visual-media` 15, `ecommerce-sales` 10, `legal-finance` 15, `product-rd` 15, `office-admin` 15, `data-research` 15, `development` 15).
   - All pre-existing skills (2062 rows: the original 273 bundled + `agency-agents-zh` + `awesome-claude-skills` + `agentic-awesome-skills` + master-skill imports) were bulk-disabled: `enabled = false`. **Nothing was deleted** — this is reversible with one UPDATE (see Rollback below).
   - Verified live via `curl http://127.0.0.1:3001/api/skills` on the prod host: `catalogs` now sum to 115, matching the per-category import counts above.

2. **Source code** (in the WSL checkout — see "Which checkout" below):
   - New: `src/lib/agent/skills/skillhub-catalog.ts` — `importSkillHub()`, a SkillHub-API-based catalog importer following the same shape as `import-catalogs.ts`'s `importOpenCatalogs()`, but SkillHub isn't a git repo so it can't reuse the git-clone importer — it calls SkillHub's public JSON API directly. **This function needs network access to `api.skillhub.cn`, which the WSL/prod environment does NOT have** (see Gotchas) — it works correctly when run from an environment with internet access, but the actual production import in this session was done via a two-phase workaround (see below), not by running this function directly against prod.
   - New: `scripts/import-skillhub.mjs`, `scripts/write-skillhub-batch.mjs`, `scripts/debug-skill-insert.mjs` (debug script, safe to delete) — companions to the above.
   - Changed: `src/lib/studio/tool-categories.ts` — added an `accent` field (Tailwind bg/text classes) to each of the 8 `StudioToolCategory` entries, for the card icon-avatar color.
   - Changed: `src/components/studio/SkillWaterfall.tsx` — skill cards now show a colored icon avatar (via `skillDepartmentToToolCategory(skill.category)` → `getStudioToolCategory()` → `.icon` + `.accent`) and a small category-name tag, matching the WorkBuddy-style card look the user asked for. **Not yet visually verified** — see Blocker below.

## Which checkout is real

This repo exists in (at least) two places on the user's machine, and they are **not in sync**:

- `E:\CodeCode\winlume` (Windows) — an older/stale checkout. Does **not** have `/studio/tools`, `tool-categories.ts`, or the `studio_skills` DB table/migration. Early work in this session (a 45-skill markdown-file import into `content/skills/`, edits to `departments.ts`) happened here **by mistake** before this was discovered, and is inert — nothing reads it, it was never deployed. Safe to ignore/delete those changes.
- `\\wsl.localhost\Ubuntu-24.04\home\user\projects\winlume` — **the real one.** This is what production (15.204.123.217) is built from. All the actual changes described above are here. Same git remote (`github.com/y864261947/winlume`, branch `master`), just ahead of the Windows checkout with uncommitted local work (`git status` showed several modified/untracked files unrelated to this task — do not assume a clean tree).

**If picking this up in a new session: work in the WSL path, not `E:\CodeCode\winlume`.**

## Architecture notes (non-obvious, cost real time to discover)

- Skills are **not** purely filesystem-based despite `src/lib/agent/skills/registry.ts` still existing and doing a `content/skills/*/SKILL.md` scan. There's a parallel, newer **database-backed** path: `drizzle/0008_studio_skills.sql` defines a `studio_skills` table, and `src/lib/platform/repositories/skills.ts` (`SkillRepository`) is the real read/write path the live `/api/skills` route uses in this checkout. `content/skills/` (273 files) is effectively vestigial/seed data now — the 2062+115 live skills are all DB rows.
- The "8-category workbench" (内容与营销 / 视觉与媒体 / etc.) is **not** a separate dataset — it's a display rollup. `src/lib/studio/tool-categories.ts`'s `DEPARTMENT_TO_CATEGORY` map folds the older 19-department vocabulary (`marketing`, `design`, `engineering`, ... — still `departments.ts`, unchanged) into these 8 ids. Any skill's `category` column should be one of the 19 department ids; `skillDepartmentToToolCategory()` does the rollup for display. Unknown department ids fall back to `product-rd`.
- `/studio/tools` → redirects to `/studio/tools/c/[categoryId]`, which renders a small hand-authored "工具" grid (deterministic tools, e.g. background removal — see `docs/superpowers/specs/2026-08-14-studio-tool-catalog-design.md`) above the live `SkillWaterfall` (the skill cards, infinite-scroll, filtered by `?catalog=`).
- **Skills never execute bundled code.** The Studio runtime (`runAgentTurn`) injects a Skill's `systemPrompt` as plain text into the model's context — it has no mechanism to run a skill's packaged scripts/hooks. This is why the SkillHub importer explicitly **skips script-heavy skills** (`scriptFiles.length >= 5 || ratio > 0.3` in `skillhub-catalog.ts`): a skill whose real capability lives in a Python/JS file (chart rendering, scraping) would be dead weight or worse, invite the model to hallucinate output it can't actually produce. There's a separate, feature-flagged `CodexExecutor` (`src/lib/agent/executor/codex.ts`, gated by `REIZO_CODEX_ENABLED`, off by default) that does have real sandboxed code execution, but it's wired to a different feature entirely, not the Skill catalog.

## Gotchas hit this session (save the next person the time)

1. **SkillHub API has no network path from the WSL/production side.** `api.skillhub.cn` times out from both the WSL dev machine and (presumably) the prod host — but is reachable from wherever this session's own tool sandbox runs. The working pattern: fetch via a script run in a network-connected environment → write results to JSON → transfer the JSON to wherever the DB is reachable → a separate, network-free script does the DB write. See `scripts/import-skillhub.mjs` (network+DB combined, for future use where reachable) vs the two-phase split used this session.
2. **The `pg`/postgres tunnel (`127.0.0.1:15433 → prod`) can silently die.** When it does, `DATABASE_URL`-dependent code doesn't fail fast — connections hang (`ECONNREFUSED` only shows up on a *fresh* connection attempt; existing pooled connections just hang forever with no query timeout configured). This is almost certainly why the :9633 dev server became unresponsive at the end of this session (20s+ hangs on every request, TCP connects fine). **If the dev server hangs like this again, check the tunnel first, then restart the dev server** (a stale connection pool won't self-heal even after the tunnel comes back).
3. Given the tunnel's unreliability, the production DB write in this session was done by **SSHing directly into 15.204.123.217** (`.agents/skills/connect-15-204-123-217/SKILL.md` has credentials/procedure) and running a **standalone** (no TS, no path aliases, just `pg` + raw SQL) writer script copied to `/opt/reizo/` — because `/opt/reizo` is a compiled Next.js standalone build with no `/src` directory, so the real TS repository code can't run there directly. See `write-skillhub-prod.mjs` pattern (not committed — it was a throwaway `/tmp` script, deleted after use). If more prod-side writes are needed, recreate this pattern rather than fighting the tunnel.
4. **Frontmatter YAML string values must never contain a bare `\r`.** (Only relevant to the abandoned `E:\CodeCode\winlume` filesystem-import path — not applicable to the DB path used in production, since Postgres text columns don't care about line endings. Noting it in case anyone resurrects a markdown-file-based importer: `src/lib/agent/skills/parse.ts`'s frontmatter regex is `/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/` with no multiline flag — JS's `$` won't match past an embedded `\r`, so the whole line silently fails to parse and the field is dropped with no error.)
5. **SkillHub has spam/near-duplicate vendors.** One publisher (a 招投标/government-bid-data vendor, "sbkj" family) placed near-identical skills at the top of several unrelated SkillHub categories. The importer caps picks per `ownerName`/namespace (max 2 per department in the shipped version) to keep the batch topically diverse — don't remove this cap without checking results.

## Rollback

To fully revert the "hide old skills" step:
```sql
UPDATE studio_skills SET enabled = true, updated_at = now() WHERE origin IS DISTINCT FROM 'skillhub';
```
To remove the SkillHub import entirely:
```sql
DELETE FROM studio_skills WHERE origin = 'skillhub';
```

## Open items / next steps

1. **Verify the SkillWaterfall card redesign visually.** The dev server (:9633, WSL) was hung (see Gotcha #2) when this handoff was written — restart it (check the Postgres tunnel first) and load `http://localhost:9633/studio/tools/c/legal-finance` (or any category) to confirm the colored icon avatars and category tags render correctly.
2. **Decide on scaling the SkillHub import.** Current batch is a pilot: 15 per department (10 for `sales`, since `business-ops` on SkillHub is thin after the owner-diversity cap and script filter). If more are wanted, rerun the fetch phase with `SKILLHUB_PER_DEPARTMENT` set higher — but check for near-duplicate/low-quality results manually before writing to prod, same as this batch.
3. **`skills-lock.json`** (seen in the WSL checkout root, not investigated) may track catalog-import state for the existing `sync-skills.mjs` pipeline — worth checking whether it should also track the SkillHub batch, for idempotency/incremental re-sync.
4. The `[toolId]` fixed-form tool pages (`/studio/tools/[toolId]`) and their backend (per the Aug 14 design doc) are a separate, mostly-unbuilt track — not touched this session.
