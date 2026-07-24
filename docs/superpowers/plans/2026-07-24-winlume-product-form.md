# WinLume Product Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the product-form decisions on top of the existing Studio: full agency-agents-zh skill registry, department-based discovery + search, featured empty-state chips, hierarchical `/` palette, and flexible skill attach (per-turn + session pin).

**Architecture:** Keep free-agent runtime and host ports. Expand skill import + registry metadata (`department` = upstream folder, `featured`, optional `defaultArtifact`). Persist `pinnedSkillIds` on `Session`. Inject **pinned ∪ turn** skills each turn (turn wins on id conflict). Composer and skills UI browse by department; empty state uses curated featured chips only. MCP is out of scope (ToolBackend stays builtin-only).

**Tech Stack:** Existing Next.js 16 App Router, React 19, TypeScript, Vitest, `content/skills/**`, `scripts/import-agency-agents.mjs`, gateway chat SSE.

**Specs:**
- `docs/superpowers/specs/2026-07-24-winlume-product-form-design.md` (primary)
- `docs/superpowers/specs/2026-07-24-winlume-studio-design.md` (base Studio)

## Global Constraints

- **Web first** — no Electron / MCP client UI in this plan.
- **Content full import** — registry targets full agency-agents-zh; featured is curated, not “only 24 skills exist”.
- **Primary browse L1** — upstream **departments** (`marketing`, `design`, …), not five forced tracks.
- **Featured scenes** — empty-state chips only (8–12).
- **Skill usage** — default **per-turn**; optional **pin to session**; merge pinned ∪ turn (dedupe, turn order after pin).
- **Actions** in `/` may include only: clear turn skills; “extract artifact” / export stay later if not already present.
- **Chinese UI** for chrome.
- **Do not** hand-edit bulk skill bodies; change import script + optional ENRICHMENT/FEATURED maps.
- **Tests** with Vitest for pure logic; manual smoke for Composer `/`.
- **Frequent commits** per task; no secrets.
- **Next.js:** check `node_modules/next/dist/docs/` before unfamiliar App Router APIs.
- **MCP:** explicitly deferred — no marketplace, no MCP config screens.

## File map

| Path | Responsibility |
|------|----------------|
| `src/lib/agent/types.ts` | `Session.pinnedSkillIds`, SkillMeta `featured`, `defaultArtifact`, keep `category` as department id |
| `src/lib/agent/skills/parse.ts` | Parse `featured`, `defaultArtifact` from frontmatter |
| `src/lib/agent/skills/registry.ts` | `listSkillsFiltered({ featured?, department? })`, `listDepartments()` |
| `src/lib/agent/skills/departments.ts` | Department id → zh label + display order |
| `src/lib/agent/skills/inject.ts` | `mergeSkillIds(pinned, turn)` + inject merged set |
| `src/lib/agent/skills/inject.merge.test.ts` | Merge rules |
| `src/lib/agent/runtime.ts` | Load session pins, merge with turn `skillIds` |
| `src/lib/host/ports.ts` | `updateSession` allows `pinnedSkillIds` |
| `src/lib/host/web/file-store.ts` | Persist `pinnedSkillIds` on session JSON |
| `src/app/api/sessions/[id]/route.ts` | PATCH `pinnedSkillIds` |
| `src/app/api/skills/route.ts` | `featured`, `department` query; return `departments` labels |
| `scripts/import-agency-agents.mjs` | `IMPORT_ALL=1` full import; write `category`=folder; `featured` from map |
| `content/skills/**` | Regenerated full (or near-full) library |
| `src/components/studio/Composer.tsx` | Hierarchical `/` palette; pin UI hooks |
| `src/components/studio/SkillSlashMenu.tsx` | Extracted menu: search / featured / departments / skills |
| `src/components/studio/SkillChips.tsx` | Turn chips + pin/unpin affordance |
| `src/app/studio/page.tsx` | Featured chips from API `featured=1` |
| `src/app/studio/skills/page.tsx` | Department-first browse + search |
| `src/app/studio/c/[sessionId]/page.tsx` | Load/save pins; pass to Composer + send |
| `src/lib/studio/api.ts` | Types for session pin + skills query helpers |
| `docs/DEPLOY.md` or `content/skills/README.md` | Document `IMPORT_ALL` + re-import |

**Out of this plan:** MCP client/server, Super-Agent job queue, desktop tools, new artifact extract action (unless trivial reuse of existing `write_artifact` UX).

---

### Task 1: Types + parse metadata (`featured`, `defaultArtifact`, `pinnedSkillIds`)

**Files:**
- Modify: `src/lib/agent/types.ts`
- Modify: `src/lib/agent/skills/parse.ts`
- Modify: `src/lib/agent/skills/parse.test.ts` (extend)
- Test: `src/lib/agent/skills/parse.test.ts`

**Interfaces:**
- Produces:
  - `Session.pinnedSkillIds?: string[]`
  - `SkillMeta.featured?: boolean`
  - `SkillMeta.defaultArtifact?: "markdown" | "html" | "image-prompt" | "none"`
  - `category` remains **department id** (e.g. `marketing`)

- [ ] **Step 1: Write failing parse tests for new frontmatter fields**

```ts
// append to parse.test.ts
it("parses featured and defaultArtifact", () => {
  const md = `---
name: 测试
description: d
category: marketing
featured: true
defaultArtifact: html
source: bundled
---
body
`;
  const skill = parseSkillMarkdown(md, { fallbackId: "test-skill" });
  expect(skill.featured).toBe(true);
  expect(skill.defaultArtifact).toBe("html");
  expect(skill.category).toBe("marketing");
});
```

- [ ] **Step 2: Run test — expect FAIL (fields missing on type/parser)**

```bash
npm test -- src/lib/agent/skills/parse.test.ts
```

- [ ] **Step 3: Extend types**

```ts
// Session
export interface Session {
  id: string;
  userId: string;
  title: string;
  model: string;
  /** Skills applied to every turn unless overridden; UI may pin/unpin */
  pinnedSkillIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export type DefaultArtifactKind = "markdown" | "html" | "image-prompt" | "none";

export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  /** Upstream department folder id (marketing, design, …) */
  category: string;
  triggers?: string[];
  examplePrompt?: string;
  preview?: "markdown" | "html" | "none";
  source: "bundled" | "imported" | "user";
  enabled: boolean;
  featured?: boolean;
  defaultArtifact?: DefaultArtifactKind;
}
```

- [ ] **Step 4: Parse `featured` (bool) and `defaultArtifact` (enum string) in `parseSkillMarkdown` / `toSkillMeta`**

- [ ] **Step 5: Re-run tests — PASS**

```bash
npm test -- src/lib/agent/skills/parse.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/types.ts src/lib/agent/skills/parse.ts src/lib/agent/skills/parse.test.ts
git commit -m "feat(skills): featured, defaultArtifact, session pinnedSkillIds types"
```

---

### Task 2: Department labels + registry filters

**Files:**
- Create: `src/lib/agent/skills/departments.ts`
- Create: `src/lib/agent/skills/departments.test.ts`
- Modify: `src/lib/agent/skills/registry.ts`
- Modify: `src/app/api/skills/route.ts`

**Interfaces:**
- Produces:
  - `DEPARTMENT_ORDER: string[]`
  - `departmentLabel(id: string): string`
  - `listDepartments(): Promise<{ id: string; label: string; count: number }[]>`
  - `listSkillsFiltered({ q?, category?, featured? })`

- [ ] **Step 1: Add department map (zh labels + pin order)**

```ts
// src/lib/agent/skills/departments.ts
/** Display order for primary browse; unknown ids sort after, by label. */
export const DEPARTMENT_ORDER = [
  "marketing",
  "design",
  "engineering",
  "product",
  "sales",
  "finance",
  "paid-media",
  "project-management",
  "testing",
  "support",
  "security",
  "hr",
  "legal",
  "supply-chain",
  "academic",
  "game-development",
  "gis",
  "spatial-computing",
  "specialized",
] as const;

const LABELS: Record<string, string> = {
  marketing: "营销",
  design: "设计",
  engineering: "工程",
  product: "产品",
  sales: "销售",
  finance: "金融",
  "paid-media": "付费媒体",
  "project-management": "项目管理",
  testing: "测试",
  support: "支持",
  security: "安全",
  hr: "人力",
  legal: "法务",
  "supply-chain": "供应链",
  academic: "学术",
  "game-development": "游戏",
  gis: "GIS",
  "spatial-computing": "空间计算",
  specialized: "专项",
};

export function departmentLabel(id: string): string {
  return LABELS[id] ?? id;
}

export function sortDepartmentIds(ids: string[]): string[] {
  const rank = new Map(DEPARTMENT_ORDER.map((d, i) => [d, i]));
  return [...ids].sort((a, b) => {
    const ra = rank.get(a as (typeof DEPARTMENT_ORDER)[number]) ?? 1000;
    const rb = rank.get(b as (typeof DEPARTMENT_ORDER)[number]) ?? 1000;
    if (ra !== rb) return ra - rb;
    return departmentLabel(a).localeCompare(departmentLabel(b), "zh");
  });
}
```

- [ ] **Step 2: Test sort order puts marketing before specialized**

```ts
import { sortDepartmentIds, departmentLabel } from "./departments";

it("orders known departments first", () => {
  expect(sortDepartmentIds(["specialized", "marketing", "design"])).toEqual([
    "marketing",
    "design",
    "specialized",
  ]);
  expect(departmentLabel("marketing")).toBe("营销");
});
```

- [ ] **Step 3: Extend `listSkillsFiltered`**

```ts
export async function listSkillsFiltered(opts: {
  q?: string;
  category?: string;
  featured?: boolean;
}): Promise<SkillMeta[]> {
  let skills = await listSkillMetas();
  // category filter unchanged
  if (opts.featured === true) {
    skills = skills.filter((s) => s.featured === true);
  }
  // q filter unchanged
  return skills;
}

export async function listDepartments(): Promise<
  { id: string; label: string; count: number }[]
> {
  const skills = await listSkillMetas();
  const counts = new Map<string, number>();
  for (const s of skills) {
    counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  }
  return sortDepartmentIds([...counts.keys()]).map((id) => ({
    id,
    label: departmentLabel(id),
    count: counts.get(id) ?? 0,
  }));
}
```

- [ ] **Step 4: API `GET /api/skills`**

Query params:
- `q`, `category` (existing)
- `featured=1` → only featured
- Response add: `departments: { id, label, count }[]` from `listDepartments()` (always full counts, not filtered)

```ts
const featured =
  searchParams.get("featured") === "1" ||
  searchParams.get("featured") === "true";
const skills = await listSkillsFiltered({
  q: searchParams.get("q") ?? undefined,
  category: searchParams.get("category") ?? undefined,
  featured: featured || undefined,
});
const departments = await listDepartments();
return NextResponse.json({ skills, categories: ..., departments, total: skills.length });
```

- [ ] **Step 5: Run unit tests**

```bash
npm test -- src/lib/agent/skills/departments.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/skills/departments.ts src/lib/agent/skills/departments.test.ts src/lib/agent/skills/registry.ts src/app/api/skills/route.ts
git commit -m "feat(skills): department labels and featured filter API"
```

---

### Task 3: Full import from agency-agents-zh

**Files:**
- Modify: `scripts/import-agency-agents.mjs`
- Modify: `content/skills/README.md`
- Regenerate: `content/skills/**` (git will show large add)

**Interfaces:**
- Env: `IMPORT_ALL=1` imports every `*/*.md` under source departments (skip `examples`, `strategy`, `integrations`, `scripts`, `assets`, root docs).
- Default without `IMPORT_ALL` may keep curated list for local dev speed — **CI/production path uses full**.
- Writes frontmatter: `category: <folder>`, `source: bundled`, `featured: true|false` from `FEATURED` set.

- [ ] **Step 1: Replace curated-only path with dual mode**

```js
// scripts/import-agency-agents.mjs (core logic sketch)

const SKIP_DIRS = new Set([
  "examples", "strategy", "integrations", "scripts", "assets",
  ".github", "node_modules",
]);

const FEATURED = new Set([
  "marketing-xiaohongshu-specialist",
  "marketing-douyin-strategist",
  "marketing-wechat-official-account",
  "marketing-content-creator",
  "design-ui-designer",
  "design-image-prompt-engineer",
  "design-brand-guardian",
  "product-trend-researcher",
  "product-manager",
  "engineering-frontend-developer",
  "engineering-technical-writer",
  "sales-proposal-strategist",
]);

function listAgentFiles(root) {
  if (process.env.IMPORT_ALL === "1" || process.env.IMPORT_ALL === "true") {
    // walk top-level dirs except SKIP_DIRS; each *.md file becomes one skill
    // nested game-development/unity/*.md → id = basename without .md
    // category = top-level department folder name
  }
  return CURATED.map(...); // existing paths
}

// when writing SKILL.md frontmatter:
// featured: FEATURED.has(id)
// category: departmentFolder
// keep ENRICHMENT for triggers/example_prompt when id matches
```

- [ ] **Step 2: Dry-run count**

```bash
$env:IMPORT_ALL="1"; node scripts/import-agency-agents.mjs
# expect log: imported N skills (N should be ~200+, not 24)
```

- [ ] **Step 3: Update README**

```md
# Bundled skills

Full import:

```bash
# PowerShell
$env:IMPORT_ALL="1"; node scripts/import-agency-agents.mjs
```

Requires `agency-agents-zh` at `E:/CodeCode/agency-agents-zh` or `AGENCY_AGENTS_DIR`.

Featured ids are controlled by `FEATURED` in the import script.
```

- [ ] **Step 4: Smoke registry load**

```bash
node -e "const {listSkillMetas}=require('./.next/...');" 
# better: small vitest or:
npx tsx -e "import { listSkillMetas } from './src/lib/agent/skills/registry.ts'; console.log((await listSkillMetas()).length)"
```

Or start app and `GET /api/skills` → `total` >> 24.

- [ ] **Step 5: Commit skills content + script** (large commit OK)

```bash
git add scripts/import-agency-agents.mjs content/skills
git commit -m "feat(skills): full agency-agents-zh import with featured flags"
```

**Note:** If git size is a concern, commit script first and document that deploy/CI runs import; still preferred to commit generated `content/skills` for reproducible deploys without cloning agency repo on the server.

---

### Task 4: Merge skill ids + runtime inject pins

**Files:**
- Modify: `src/lib/agent/skills/inject.ts`
- Create: `src/lib/agent/skills/inject.merge.test.ts`
- Modify: `src/lib/agent/runtime.ts`
- Modify: `src/lib/agent/runtime.messages.test.ts` if needed

**Interfaces:**
- Produces: `mergeSkillIds(pinned?: string[], turn?: string[]): string[]`
- Runtime: `effectiveSkillIds = mergeSkillIds(session.pinnedSkillIds, opts.skillIds)`

- [ ] **Step 1: Failing tests for merge**

```ts
import { mergeSkillIds } from "./inject";

it("pins first then turn extras; turn re-order keeps single id", () => {
  expect(mergeSkillIds(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
  expect(mergeSkillIds(undefined, ["x"])).toEqual(["x"]);
  expect(mergeSkillIds(["x"], undefined)).toEqual(["x"]);
  expect(mergeSkillIds([], [])).toEqual([]);
});
```

- [ ] **Step 2: Implement**

```ts
/** pinned then turn; de-dupe; first occurrence wins (pinned preferred). */
export function mergeSkillIds(
  pinned?: string[],
  turn?: string[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...(pinned ?? []), ...(turn ?? [])]) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
```

- [ ] **Step 3: In `runAgentTurn`, after loading session**

```ts
const effectiveSkillIds = mergeSkillIds(
  session.pinnedSkillIds,
  opts.skillIds,
);
// persist user message with skillIds: effectiveSkillIds (or store turn-only on message + still inject merge — prefer store turn-only on Message.skillIds for audit, inject merge for prompt)
const skills = await resolveSkills(effectiveSkillIds);
```

**Message persistence rule:** store **turn-selected** ids on `Message.skillIds` (what user picked this send). Inject **merged** set into system prompt. Document in inject header:

```ts
const SECTION_HEADER = "## Active skills (session pin + this turn)";
```

- [ ] **Step 4: Tests pass**

```bash
npm test -- src/lib/agent/skills/inject.merge.test.ts
npm test -- src/lib/agent/runtime.messages.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/skills/inject.ts src/lib/agent/skills/inject.merge.test.ts src/lib/agent/runtime.ts
git commit -m "feat(agent): merge pinned and turn skills into system prompt"
```

---

### Task 5: Persist `pinnedSkillIds` (store + API)

**Files:**
- Modify: `src/lib/host/ports.ts`
- Modify: `src/lib/host/web/file-store.ts`
- Create or modify: `src/lib/host/web/file-store.test.ts` (if exists; else add focused test)
- Modify: `src/app/api/sessions/[id]/route.ts`
- Modify: `src/lib/studio/api.ts` (client helpers)

**Interfaces:**
- `updateSession(..., patch: Partial<Pick<Session, "title" | "model" | "pinnedSkillIds">>)`
- PATCH body: `{ pinnedSkillIds?: string[] }` — replace entire pin list (max 8 ids, validate non-empty strings)

- [ ] **Step 1: Extend port + file-store patch merge**

```ts
// ports.ts
updateSession(
  userId: string,
  sessionId: string,
  patch: Partial<Pick<Session, "title" | "model" | "pinnedSkillIds">>,
): Promise<Session>;
```

In file-store `updateSession`, assign `pinnedSkillIds` when `patch.pinnedSkillIds !== undefined` (allow `[]` to clear).

- [ ] **Step 2: PATCH route**

```ts
let body: { title?: string; model?: string; pinnedSkillIds?: string[] } = {};
// ...
if (Array.isArray(body.pinnedSkillIds)) {
  const ids = body.pinnedSkillIds
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
  patch.pinnedSkillIds = ids;
}
```

- [ ] **Step 3: Client helper**

```ts
// studio/api.ts
export async function patchSession(
  id: string,
  patch: { title?: string; model?: string; pinnedSkillIds?: string[] },
): Promise<Session> { /* existing fetch PATCH pattern */ }
```

- [ ] **Step 4: Manual or unit test** — create session file, update pins, re-read.

- [ ] **Step 5: Commit**

```bash
git add src/lib/host/ports.ts src/lib/host/web/file-store.ts src/app/api/sessions/[id]/route.ts src/lib/studio/api.ts
git commit -m "feat(sessions): persist pinnedSkillIds"
```

---

### Task 6: SkillChips + hierarchical SkillSlashMenu

**Files:**
- Create: `src/components/studio/SkillChips.tsx`
- Create: `src/components/studio/SkillSlashMenu.tsx`
- Modify: `src/components/studio/Composer.tsx`

**Interfaces:**
- `SkillChipsProps`: `{ turnIds, pinnedIds, skillsById, onRemoveTurn, onTogglePin, onClearTurn }`
- `SkillSlashMenuProps`: `{ open, query, skills, departments, onPickSkill, onClearTurnSkills, highlightIndex, ... }`
- Composer props add:
  - `pinnedSkillIds?: string[]`
  - `onPinnedSkillIdsChange?: (ids: string[]) => void`

**UX behavior:**
1. `/` opens menu; typing filters global search across all skills.
2. When query empty: sections **精选** (featured), **部门** list; click department → skill list for that category; back control.
3. When query non-empty: flat filtered list (no drill).
4. Enter selects skill → add to **turn** ids; strip `/query` from textarea (existing behavior).
5. Chip row: turn chips removable; pin button toggles id in `pinnedSkillIds` (calls parent).
6. Action: 「清空本轮技能」 in menu footer.

- [ ] **Step 1: Implement `SkillSlashMenu` state machine**

```ts
type MenuView =
  | { kind: "root" }
  | { kind: "department"; departmentId: string };

// root rows: featured skills (max 12) + department entries + action clear
// department view: skills where category === departmentId
```

Use data already loaded: Composer currently fetches `/api/skills` once — change to use response `departments` + full `skills` (after full import, payload is larger; acceptable for MVP; if >500KB later add paginated fetch).

- [ ] **Step 2: Wire chips above textarea**

Show:
- 钉住: from `pinnedSkillIds`
- 本轮: from turn `skillIds`

- [ ] **Step 3: Keyboard** — keep arrow/enter/esc; when in department view, Esc goes to root then closes.

- [ ] **Step 4: Manual smoke**

- Open `/studio`, type `/`, see 营销/设计…
- Search `小红书`, pick skill, see 本轮 chip
- Pin skill, refresh session page later (Task 7) — for now parent may no-op pin until session page wired

- [ ] **Step 5: Commit**

```bash
git add src/components/studio/SkillChips.tsx src/components/studio/SkillSlashMenu.tsx src/components/studio/Composer.tsx
git commit -m "feat(studio): hierarchical slash menu and skill chips"
```

---

### Task 7: Session page + empty state featured chips

**Files:**
- Modify: `src/app/studio/c/[sessionId]/page.tsx` (or whatever component owns send)
- Modify: `src/app/studio/page.tsx`
- Modify: `src/app/studio/skills/page.tsx`
- Modify: `src/app/studio/inspire/page.tsx` only if it should prefer featured

**Session page:**
- Load `session.pinnedSkillIds`
- Pass to Composer
- On pin change → `PATCH` session
- On send → pass **turn** `skillIds` only in chat body (runtime merges pins)

**Empty state (`studio/page.tsx`):**
- Replace hard-coded SCENE cards partially or fully with `GET /api/skills?featured=1`
- Keep 6–12 cards: title from skill name, description, CTA sets `skill` + `examplePrompt`
- Fallback to current hard-coded list if API empty

**Skills page:**
- Left or top: department tabs/list from `departments`
- Filter by selected department + search `q`
- Show counts; label with `departmentLabel`

- [ ] **Step 1: Session pin wiring**

```tsx
const [pinnedSkillIds, setPinnedSkillIds] = useState<string[]>([]);
// when session loads:
setPinnedSkillIds(session.pinnedSkillIds ?? []);

const onPinnedSkillIdsChange = async (ids: string[]) => {
  setPinnedSkillIds(ids);
  await patchSession(sessionId, { pinnedSkillIds: ids });
};
```

- [ ] **Step 2: Featured empty state**

```tsx
useEffect(() => {
  fetch("/api/skills?featured=1", { credentials: "same-origin" })
    .then((r) => r.json())
    .then((d) => setFeatured(d.skills ?? []));
}, []);
```

- [ ] **Step 3: Skills browser departments UI**

Use `departments` from API; default department `all` or first with count.

- [ ] **Step 4: Manual E2E smoke**

1. Full skills count on `/studio/skills` > 100  
2. `/` menu departments work  
3. Pin skill in session → send message → (optional) check logs/prompt path via unit tests already  
4. Reload session → pin remains  

- [ ] **Step 5: Commit**

```bash
git add src/app/studio/page.tsx src/app/studio/skills/page.tsx src/app/studio/c/
git commit -m "feat(studio): featured empty state, department skills page, session pins"
```

---

### Task 8: Docs + deploy notes + verification

**Files:**
- Modify: `content/skills/README.md` (if not done)
- Modify: `docs/DEPLOY.md` — optional step to re-import skills before build
- Modify: `docs/superpowers/specs/2026-07-24-winlume-product-form-design.md` — set Status to Implemented when done

- [ ] **Step 1: Document**

```md
## Skills corpus

Production image should include full `content/skills` (run
`IMPORT_ALL=1 node scripts/import-agency-agents.mjs` before build if regenerating).

MCP is not enabled; tools are server builtin only.
```

- [ ] **Step 2: Run full test suite**

```bash
npm test
npm run build
```

- [ ] **Step 3: Checklist vs spec**

| Spec item | Task |
|-----------|------|
| Full agency content | Task 3 |
| Department L1 | Task 2, 6, 7 |
| Featured chips | Task 3 FEATURED + Task 7 |
| Per-turn + pin | Task 4–7 |
| `/` search + hierarchy | Task 6 |
| Actions separate (clear turn) | Task 6 |
| MCP out | Task 8 docs |

- [ ] **Step 4: Commit**

```bash
git add docs/ content/skills/README.md
git commit -m "docs: product-form skills import and non-goals for MCP"
```

---

## Spec coverage (self-check)

| Requirement | Plan task |
|-------------|-----------|
| Form B Artifact-first (already built) | No rewrite; chips still lead to chat+artifacts |
| Full skill sync | Task 3 |
| Department primary browse | Task 2, 6, 7 |
| Featured not sole L1 | Task 3 FEATURED + Task 7 empty state |
| Flexible pin + turn | Task 4, 5, 6, 7 |
| `/` palette | Task 6 |
| Actions ≠ roles | Task 6 clear-turn only |
| MCP deferred | Global constraints + Task 8 |
| defaultArtifact metadata | Task 1 (parse/store; filter UI optional later) |

## Explicitly deferred (do not implement in this plan)

- MCP client / server / marketplace  
- Super-Agent async jobs  
- OD design-template modes as nav  
- Paginated skills API for huge payloads  
- User-uploaded skills  
- Desktop ToolBackend  

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-24-winlume-product-form.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
