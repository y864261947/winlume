/**
 * Import curated agents from agency-agents-zh into content/skills/{id}/SKILL.md
 *
 * Env:
 *   AGENCY_AGENTS_DIR — source root (default: E:/CodeCode/agency-agents-zh or ../agency-agents-zh)
 *   SKILLS_OUT_DIR    — output root (default: <repo>/content/skills)
 *
 * Usage:
 *   node scripts/import-agency-agents.mjs
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const DEFAULT_CANDIDATES = [
  process.env.AGENCY_AGENTS_DIR,
  "E:/CodeCode/agency-agents-zh",
  resolve(REPO_ROOT, "../agency-agents-zh"),
].filter(Boolean);

function resolveSourceDir() {
  for (const c of DEFAULT_CANDIDATES) {
    if (c && existsSync(c)) return resolve(c);
  }
  throw new Error(
    `agency-agents source not found. Set AGENCY_AGENTS_DIR. Tried:\n${DEFAULT_CANDIDATES.join("\n")}`,
  );
}

const SOURCE_DIR = resolveSourceDir();
const OUT_DIR = resolve(process.env.SKILLS_OUT_DIR || join(REPO_ROOT, "content", "skills"));

/** Curated allowlist (~24) — marketing / design / product / eng / sales / support / finance / pm / testing */
const CURATED = [
  "marketing/marketing-xiaohongshu-specialist.md",
  "marketing/marketing-content-creator.md",
  "marketing/marketing-wechat-official-account.md",
  "marketing/marketing-douyin-strategist.md",
  "marketing/marketing-seo-specialist.md",
  "marketing/marketing-growth-hacker.md",
  "marketing/marketing-social-media-strategist.md",
  "design/design-brand-guardian.md",
  "design/design-ui-designer.md",
  "design/design-image-prompt-engineer.md",
  "design/design-visual-storyteller.md",
  "design/design-ux-researcher.md",
  "product/product-manager.md",
  "product/product-trend-researcher.md",
  "product/product-feedback-synthesizer.md",
  "engineering/engineering-prompt-engineer.md",
  "engineering/engineering-technical-writer.md",
  "engineering/engineering-frontend-developer.md",
  "sales/sales-proposal-strategist.md",
  "sales/sales-outbound-strategist.md",
  "support/support-executive-summary-generator.md",
  "finance/finance-financial-analyst.md",
  "project-management/project-management-meeting-notes-specialist.md",
  "testing/testing-reality-checker.md",
];

/** Optional hand-tuned example prompts / triggers per skill id */
const ENRICHMENT = {
  "marketing-xiaohongshu-specialist": {
    triggers: ["小红书", "种草", "笔记"],
    example_prompt: "为新品手冲咖啡写三篇小红书种草笔记，含标题、正文和标签建议。",
  },
  "marketing-content-creator": {
    triggers: ["文案", "内容创作", "宣传"],
    example_prompt: "为咖啡店开业写一套多渠道宣传内容（朋友圈、海报文案、短视频脚本大纲）。",
  },
  "marketing-wechat-official-account": {
    triggers: ["公众号", "微信", "推文"],
    example_prompt: "写一篇关于「远程办公效率」的公众号长文提纲与开篇 800 字。",
  },
  "marketing-douyin-strategist": {
    triggers: ["抖音", "短视频", "爆款"],
    example_prompt: "策划 5 条抖音短视频选题，目标是本地烘焙店涨粉。",
  },
  "marketing-seo-specialist": {
    triggers: ["SEO", "搜索优化", "关键词"],
    example_prompt: "为「企业知识库」产品列 20 个中文长尾关键词并给出落地页大纲。",
  },
  "marketing-growth-hacker": {
    triggers: ["增长", "获客", "AARRR"],
    example_prompt: "为 B2B SaaS 试用转化设计 3 个低成本增长实验。",
  },
  "marketing-social-media-strategist": {
    triggers: ["社媒", "社交媒体", "排期"],
    example_prompt: "制定两周社媒内容日历，覆盖小红书、抖音与公众号。",
  },
  "design-brand-guardian": {
    triggers: ["品牌", "视觉规范", "调性"],
    example_prompt: "根据现有 logo 与主色，整理一页品牌使用规范要点（可执行清单）。",
  },
  "design-ui-designer": {
    triggers: ["UI", "界面", "组件"],
    example_prompt: "为 AI 对话工作台设计消息列表与输入区的 UI 规格（布局、状态、间距）。",
  },
  "design-image-prompt-engineer": {
    triggers: ["绘图提示词", "图像生成", "Midjourney"],
    example_prompt: "写 3 组中英双语产品场景图 prompt，风格为极简电商主图。",
  },
  "design-visual-storyteller": {
    triggers: ["视觉叙事", "故事板", "海报"],
    example_prompt: "为「新品发布」做 4 格视觉故事板描述与每格文案。",
  },
  "design-ux-researcher": {
    triggers: ["用户研究", "访谈", "可用性"],
    example_prompt: "设计一份 8 题可用性访谈提纲，验证「Skills 选择」流程。",
  },
  "product-manager": {
    triggers: ["产品", "PRD", "路线图"],
    example_prompt: "为一键导入 Skills 功能写一页 PRD：背景、目标、范围、验收标准。",
  },
  "product-trend-researcher": {
    triggers: ["趋势", "竞品", "调研"],
    example_prompt: "调研国内 AI 工作台竞品在「技能/插件」上的差异，输出对比表。",
  },
  "product-feedback-synthesizer": {
    triggers: ["反馈", "洞察", "用户声音"],
    example_prompt: "把以下 10 条用户反馈聚类成 3 个主题，并给出优先级建议：…",
  },
  "engineering-prompt-engineer": {
    triggers: ["Prompt", "提示词", "LLM"],
    example_prompt: "把「写周报」需求改写成可复用的系统提示词，含输入输出格式约束。",
  },
  "engineering-technical-writer": {
    triggers: ["技术文档", "README", "说明"],
    example_prompt: "为 skills 导入脚本写一段面向开发者的 README 使用说明。",
  },
  "engineering-frontend-developer": {
    triggers: ["前端", "React", "组件"],
    example_prompt: "用 React + Tailwind 描述一个 Skills 卡片网格组件的实现要点。",
  },
  "sales-proposal-strategist": {
    triggers: ["方案", "投标", "商务"],
    example_prompt: "为中型企业写一份 AI 助手试点项目的商务方案大纲。",
  },
  "sales-outbound-strategist": {
    triggers: ["外拓", "冷启动", "销售"],
    example_prompt: "写 3 封面向 HR SaaS 决策人的冷启动开发信。",
  },
  "support-executive-summary-generator": {
    triggers: ["纪要", "摘要", "高管"],
    example_prompt: "把下面会议记录压缩成一页高管摘要（结论、决策、待办）。",
  },
  "finance-financial-analyst": {
    triggers: ["财务", "分析", "指标"],
    example_prompt: "根据给出的月度收入与成本数据，写一份简要财务健康分析。",
  },
  "project-management-meeting-notes-specialist": {
    triggers: ["会议纪要", "待办", "对齐"],
    example_prompt: "把口语化会议录音转写整理成结构化会议纪要。",
  },
  "testing-reality-checker": {
    triggers: ["验收", "测试", "核对"],
    example_prompt: "针对「Skills 列表页」列一份可执行的验收检查清单。",
  },
};

const CATEGORY_LABEL = {
  marketing: "marketing",
  design: "design",
  product: "product",
  engineering: "engineering",
  sales: "sales",
  support: "support",
  finance: "finance",
  "project-management": "project-management",
  testing: "testing",
};

function splitFrontmatter(markdown) {
  const text = markdown.replace(/^\uFEFF/, "");
  if (!text.startsWith("---")) return { raw: {}, body: text };
  const rest = text.slice(3).replace(/^\r?\n/, "");
  const closeMatch = rest.match(/\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!closeMatch || closeMatch.index === undefined) return { raw: {}, body: text };
  const yamlBlock = rest.slice(0, closeMatch.index);
  const body = rest.slice(closeMatch.index + closeMatch[0].length);
  return { raw: parseSimpleYaml(yamlBlock), body };
}

function parseSimpleYaml(yaml) {
  const out = {};
  const lines = yaml.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    i += 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let valuePart = kv[2].trim();
    if (valuePart === "" || valuePart === "[]") {
      const items = [];
      let saw = false;
      while (i < lines.length) {
        const m = lines[i].match(/^\s+-\s+(.*)$/);
        if (m) {
          saw = true;
          items.push(unquote(m[1].trim()));
          i += 1;
          continue;
        }
        if (lines[i].trim() === "") {
          i += 1;
          continue;
        }
        break;
      }
      out[key] = saw ? items : valuePart === "[]" ? [] : null;
      continue;
    }
    if (
      (valuePart.startsWith('"') && valuePart.endsWith('"')) ||
      (valuePart.startsWith("'") && valuePart.endsWith("'"))
    ) {
      valuePart = valuePart.slice(1, -1);
    }
    out[key] = valuePart;
  }
  return out;
}

function unquote(v) {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

function yamlEscape(value) {
  if (value === null || value === undefined) return '""';
  const s = String(value);
  if (s === "") return '""';
  if (/[:#\n\r\[\]{},&*?|>!%@`']/.test(s) || s !== s.trim() || /^(true|false|null|yes|no)$/i.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}

function buildSkillMarkdown({ id, title, description, category, triggers, examplePrompt, body }) {
  const lines = [
    "---",
    `name: ${id}`,
    `title: ${yamlEscape(title)}`,
    `description: ${yamlEscape(description)}`,
    `category: ${category}`,
    "triggers:",
    ...triggers.map((t) => `  - ${yamlEscape(t)}`),
    `example_prompt: ${yamlEscape(examplePrompt)}`,
    "preview: markdown",
    "source: bundled",
    "enabled: true",
    "---",
    "",
    body.trim(),
    "",
  ];
  return lines.join("\n");
}

function defaultTriggers(category, title) {
  const base = [title].filter(Boolean);
  const byCat = {
    marketing: ["营销", "内容"],
    design: ["设计", "视觉"],
    product: ["产品"],
    engineering: ["工程", "开发"],
    sales: ["销售"],
    support: ["支持", "摘要"],
    finance: ["财务"],
    "project-management": ["项目", "会议"],
    testing: ["测试", "验收"],
  };
  return [...new Set([...(byCat[category] || []), ...base])].slice(0, 5);
}

function importOne(relPath) {
  const srcPath = join(SOURCE_DIR, relPath);
  if (!existsSync(srcPath)) {
    return { ok: false, relPath, error: `missing source: ${srcPath}` };
  }

  const categoryDir = relPath.split("/")[0];
  const category = CATEGORY_LABEL[categoryDir] || categoryDir;
  const id = basename(relPath, ".md");
  const rawText = readFileSync(srcPath, "utf8");
  const { raw, body } = splitFrontmatter(rawText);

  const title = String(raw.name || id).trim();
  const description = String(raw.description || title).trim();
  const enrich = ENRICHMENT[id] || {};
  const triggers = enrich.triggers || defaultTriggers(category, title);
  const examplePrompt =
    enrich.example_prompt || `请以「${title}」的角色，帮助我完成：…`;

  // Body = original markdown without old frontmatter identity noise
  const cleanedBody = body.trim() || `# ${title}\n\n${description}`;

  const outMd = buildSkillMarkdown({
    id,
    title,
    description,
    category,
    triggers,
    examplePrompt,
    body: cleanedBody,
  });

  const destDir = join(OUT_DIR, id);
  mkdirSync(destDir, { recursive: true });
  const destFile = join(destDir, "SKILL.md");
  writeFileSync(destFile, outMd, "utf8");

  return { ok: true, id, destFile, category, title };
}

function main() {
  console.log(`Source: ${SOURCE_DIR}`);
  console.log(`Output: ${OUT_DIR}`);
  mkdirSync(OUT_DIR, { recursive: true });

  const results = [];
  for (const rel of CURATED) {
    const r = importOne(rel);
    results.push(r);
    if (r.ok) {
      console.log(`✓ ${r.id}  (${r.category}) ← ${rel}`);
    } else {
      console.error(`✗ ${rel}: ${r.error}`);
    }
  }

  const ok = results.filter((r) => r.ok);
  const fail = results.filter((r) => !r.ok);
  console.log(`\nImported ${ok.length}/${CURATED.length} skills`);
  if (fail.length) {
    console.error(`Failed: ${fail.length}`);
    process.exitCode = 1;
  }

  // Write a tiny index for humans
  const indexPath = join(OUT_DIR, "README.md");
  const index = [
    "# Bundled skills",
    "",
    "Generated by `scripts/import-agency-agents.mjs` from agency-agents-zh.",
    "Do not hand-edit bulk content; re-run the import script.",
    "",
    `| id | category | title |`,
    `|----|----------|-------|`,
    ...ok.map((r) => `| \`${r.id}\` | ${r.category} | ${r.title} |`),
    "",
  ].join("\n");
  writeFileSync(indexPath, index, "utf8");
}

main();
