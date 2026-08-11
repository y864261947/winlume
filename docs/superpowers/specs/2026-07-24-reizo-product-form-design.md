# Reizo Studio — Product Form Design

**Date:** 2026-07-24  
**Status:** Implemented  
**Supplements:** [2026-07-24-reizo-studio-design.md](./2026-07-24-reizo-studio-design.md)  
**Scope:** Product morphology, Skill discovery (`/`), content strategy, Composer behavior — not implementation tasks.

---

## 1. Goal

Define how Reizo presents itself as a product so that:

1. Users understand it as an **Artifact-first Agent Studio**, not a bare multi-model chat shell.
2. The content moat — **agency-agents-zh scenario skills** — is discoverable without becoming a junk drawer.
3. Composer + `/` match competitor habits (capability palette) while staying aligned with free-agent + gateway architecture.

**Primary promise (refined)**

> Open the workbench, pick a professional scene skill (or just talk), optionally pin it for the session, and get real outputs you can preview and keep — models via your gateway, skills from a deep built-in library.

---

## 2. Product form (locked)

### 2.1 Choose form B — Artifact-first Studio

| Option | Description | Decision |
|--------|-------------|----------|
| A. Chat + mount skills | Thin multi-model chat | Rejected as primary |
| **B. Artifact-first Studio** | Conversation serves previewable works | **Primary** |
| C. Super-agent task queue | Manus-like submit & wait | Deferred (not MVP core) |

**Implications**

- Session UI treats **artifacts as first-class** (list + preview), not only chat bubbles.
- Skills bias toward **structured deliverables** (MD report, HTML preview, image prompt pack, etc.).
- Empty state and `/` optimize for **starting a piece of work**, not idle Q&A.

### 2.2 Competitive position

| Competitor type | Their strength | Reizo wedge |
|-----------------|----------------|---------------|
| Gateway / bare chat | Models & price | Weak scene depth |
| Manus / Genspark / MiniMax Agent | Autonomous long tasks | Opaque skills; hard to self-host scene packs |
| Open Design | Design loop, templates, local-first | Desktop-heavy; design-template taxonomy |
| Lovable / Bolt | Ship code fast | Narrow vertical |

**Moat statement**

> Full (syncable) **agency-agents-zh** professional roles + **Web** Studio + **gateway multi-model** + artifact preview loop.  
> Content depth is the differentiator; model access is hygiene.

---

## 3. Skill content strategy (locked)

### 3.1 Source of truth

| Item | Choice |
|------|--------|
| Primary corpus | [agency-agents-zh](https://github.com/jnMetaCode/agency-agents-zh) (~268 agents, ~20 departments) |
| Import policy | **Full library** (or automated near-full sync), not a permanent 24-skill cap |
| Current repo state | ~24 curated under `content/skills` via `scripts/import-agency-agents.mjs` — **expand to full** |
| License | MIT — redistributable; prefer sync script / documented path over one-off copy |
| Hand edits | Do not hand-edit bulk role bodies; re-import; optional enrichment map (triggers, example_prompt, featured flags) |

### 3.2 Content vs surface

| Layer | Policy |
|-------|--------|
| **Storage / registry** | Full agency set available to search and API |
| **Primary browse tree** | Upstream **department** taxonomy (see §4) |
| **Empty-state / marketing chips** | Small **featured scene** set (user-job oriented) |
| **Quality** | All importable; **featured / recommended** is curated — not every skill equal on home |

### 3.3 Metadata (product requirements)

Each skill in registry should expose at least:

| Field | Role |
|-------|------|
| `id` | Stable, e.g. `marketing-xiaohongshu-specialist` |
| `name`, `description`, `emoji` | From source frontmatter |
| `department` | Upstream folder: `marketing`, `design`, `engineering`, … |
| `systemPrompt` / body | Role instructions |
| `triggers[]`, `examplePrompt` | Optional enrichment for `/` and empty state |
| `featured` | Boolean — empty-state / chip rail |
| `defaultArtifact` | Optional: `markdown` \| `html` \| `image-prompt` \| `none` (label for later filters; default `markdown`) |
| `source` | `bundled` \| `imported` \| `user` |

---

## 4. Discovery architecture (locked)

### 4.1 Principle

> **Navigate like agency (departments). Enter like a user job (featured scenes). Act separately (actions). Tag output types later (OD-inspired), do not replace the department tree.**

### 4.2 Why not “5 tracks only” as L1

Earlier discussion proposed five user tracks: 内容运营 / 设计视觉 / 研究分析 / 研发产品 / 商务策略.

**Rejected as sole L1** because:

- Full import maps cleanly to **~20 departments**, not five forced buckets.
- “研究分析” is not a first-class department in the source (product / finance / specialized scatter).
- Uneven sizes (e.g. marketing 42 vs design 9) make artificial parents awkward.
- Open Design’s **mode** (prototype / deck / image / video) fits design templates, not 268 prose roles.

**Retained:** five-ish **featured scene chips** for empty state only (see §4.5).

### 4.3 Primary L1 — agency departments

Use upstream departments as the main browse tree (labels localized for UI):

| department id | UI label (zh) | Approx count |
|---------------|---------------|--------------|
| `marketing` | 营销 | ~42 |
| `design` | 设计 | ~9 |
| `engineering` | 工程 | ~42 |
| `product` | 产品 | ~5 |
| `sales` | 销售 | ~9 |
| `finance` | 金融 | ~9 |
| `paid-media` | 付费媒体 | ~7 |
| `project-management` | 项目管理 | ~7 |
| `testing` | 测试 | ~9 |
| `support` | 支持 | ~7 |
| `security` | 安全 | ~10 |
| `hr` | 人力 | ~2 |
| `legal` | 法务 | ~2 |
| `supply-chain` | 供应链 | ~5 |
| `academic` | 学术 | ~6 |
| `game-development` | 游戏 | ~20 |
| `gis` | GIS | ~13 |
| `spatial-computing` | 空间计算 | ~6 |
| `specialized` | 专项 | ~58 |
| … | (any new upstream folder) | … |

**UI order:** pin high-traffic first (营销、设计、工程、产品、销售、…), then alphabetical / “更多”.

### 4.4 L0 — global search

- Always available at top of `/` palette and skills page.
- Match: name, description, id, department, triggers.
- Skilled users never need to drill departments.

### 4.5 Featured scenes (not full-tree L1)

Empty state / optional chip rail — **curated**, user-job language, each maps to **one or more skill ids** + optional prefilled prompt:

| Scene chip (example) | Default skill(s) | Notes |
|----------------------|------------------|-------|
| 小红书种草 | `marketing-xiaohongshu-specialist` | Content |
| 短视频 / 抖音 | `marketing-douyin-strategist` | Content |
| 落地页 / UI | `design-ui-designer` | Design |
| 生图提示词 | `design-image-prompt-engineer` | Design (separate from 小红书) |
| 竞品 / 趋势 | `product-trend-researcher` | Research-ish |
| PRD / 产品 | `product-manager` | Product |
| 技术方案 / 前端 | `engineering-frontend-developer` or architect | Eng |
| 商务方案 | `sales-proposal-strategist` | Biz |

Exact chip list is operational content; keep **8–12** on empty state.

### 4.6 Actions track (not roles)

Separate from department skills:

| Action | Behavior |
|--------|----------|
| 新建空白作品 | Create empty artifact in session |
| 从回复提取为作品 | Promote last assistant structured block → artifact |
| 导出 | Later: download / share |
| 清空本轮技能 | Clear turn-level skill chips |

Actions must not be mixed into department lists as fake agents.

### 4.7 Output-type tags (phase 2, OD-inspired)

Optional facet for filters later: `markdown` | `html` | `image-prompt` | ….  
**Do not** use OD mode tree as primary navigation for the agency corpus.

### 4.8 `/` palette structure

```text
Type /
┌─────────────────────────────────────────────┐
│ Search skills, departments, actions…          │
├─────────────────────────────────────────────┤
│ ⭐ 最近 / 已钉住                               │
│ ⭐ 精选 (featured)                            │
├─────────────────────────────────────────────┤
│ 📁 部门 → (drill) → skill list                │
├─────────────────────────────────────────────┤
│ 🛠 动作                                        │
└─────────────────────────────────────────────┘
```

- Selecting a **skill** → attach to **current turn** (see §5).
- Selecting an **action** → run UI/tool, not inject role body.
- Keyboard: arrow / enter / esc; type to filter without leaving search.

---

## 5. Skill usage model (locked) — flexible hybrid

| Mode | Behavior | UX |
|------|----------|-----|
| **Default: per-turn** | `skillIds` on this user message only | Chips above composer: “本轮” |
| **Optional: pin to session** | Session stores `pinnedSkillIds`; every subsequent turn inherits unless overridden | Pin icon on chip; sidebar/session meta |
| **Stack** | Pinned ∪ turn-extra; same id once; **turn wins** on conflict | Show both groups clearly |

Composer sketch:

```text
[钉住: 小红书专家 ×] [本轮: 图像提示词 ×]     model ▾
┌──────────────────────────────────────────────┐
│ /  or message…                                 │
└──────────────────────────────────────────────┘
  attach   skills   send
```

**Runtime rule (extends studio design)**

```text
system = base studio policy
       + pinned skill bodies (session)
       + this-turn skill bodies
       + history + user message
```

---

## 6. Composer capabilities (direction)

| Surface | Contents |
|---------|----------|
| Always visible | Textarea, send, model picker, attach (when ready) |
| `/` | Department tree + search + actions + recent/featured |
| Chips | Per-turn skills; pin control; clear |
| Empty state | Featured scene chips + short promise copy |
| Not in MVP `/` | Full Super-Agent job templates, billing menus, settings |

Slash is an **intent compressor**, not a kitchen-sink command menu.

---

## 7. Relation to Open Design

| Borrow | Do not copy as primary IA |
|--------|---------------------------|
| Artifact + preview first-class | mode = prototype/deck/image as sole L1 |
| Skill protocol spirit (SKILL.md) | Plugin marketplace complexity in MVP |
| Scenario as **tag/featured** language | Replacing agency departments |

Reizo Web = free-agent Studio + **role content depth**; OD = design-template + local agent engine depth.

---

## 8. Non-goals (this form)

- Manus-style async multi-hour cloud VM as core UX
- Replacing free agent with fixed multi-step orchestration graphs
- Showing all 268 skills as equal chips on first paint
- Building a separate “研究部” taxonomy that does not exist upstream
- Desktop / OS automation (still Phase Desktop in studio design)

---

## 9. Success criteria (product)

1. New user can find **小红书** and **生图提示词** under different departments without confusion.
2. Power user can `/` search any of ~268 skills in one step.
3. User can pin one skill for a long co-creation session and still add a one-off skill for a single turn.
4. Marketing claim “200+ 专业场景” is true in registry, while empty state stays calm (≤12 chips).
5. Artifacts remain the default “success” of a session, not only chat length.

---

## 10. Implementation notes (for later planning only)

- Extend `scripts/import-agency-agents.mjs`: drop allowlist-only mode or add `IMPORT_ALL=1`; preserve enrichment + `featured` map.
- Skills API: filter by `department`, `q`, `featured`.
- Session model: add `pinnedSkillIds?: string[]`.
- Composer: `/` palette component; no need for all actions day one.

Detailed tasks belong in an implementation plan after this spec is accepted.

---

## 11. Decision log

| Decision | Choice |
|----------|--------|
| Product form | B — Artifact-first Studio |
| Content | Full agency-agents-zh sync |
| Skill attach | Per-turn default + optional session pin |
| Full-tree L1 | Upstream **departments** |
| User-job 5 tracks | **Featured chips only**, not sole L1 |
| Actions | Separate from roles |
| OD modes | Future tags, not primary nav |
| Super-agent queue | Out of MVP core |

---

## 12. Open for ops (not blocking form)

- Exact featured chip list and icons
- Department display order and which go under “更多”
- Whether `specialized` is collapsed by default
- Blacklist of skills never imported (if any legal/compliance preference later)
