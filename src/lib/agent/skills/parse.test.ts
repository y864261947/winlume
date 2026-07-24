import { describe, it, expect } from "vitest";
import {
  parseSkillMarkdown,
  parseSimpleYaml,
  splitFrontmatter,
  slugify,
  toSkillMeta,
} from "./parse";

const SAMPLE = `---
name: marketing-xiaohongshu-specialist
title: 小红书专家
description: 小红书种草与生活方式内容
category: marketing
triggers:
  - 小红书
  - 种草
example_prompt: 为新品手冲咖啡写三篇小红书种草笔记
preview: markdown
source: bundled
enabled: true
---

# 小红书专家

你是小红书内容专家。
`;

describe("splitFrontmatter", () => {
  it("splits YAML and body", () => {
    const { raw, body } = splitFrontmatter(SAMPLE);
    expect(raw.name).toBe("marketing-xiaohongshu-specialist");
    expect(raw.category).toBe("marketing");
    expect(body.trim().startsWith("# 小红书专家")).toBe(true);
  });

  it("returns empty frontmatter when missing", () => {
    const { raw, body } = splitFrontmatter("# just body\n");
    expect(raw).toEqual({});
    expect(body).toContain("just body");
  });

  it("handles CRLF", () => {
    const md = "---\r\nname: foo\r\n---\r\n\r\nbody\r\n";
    const { raw, body } = splitFrontmatter(md);
    expect(raw.name).toBe("foo");
    expect(body.trim()).toBe("body");
  });
});

describe("parseSimpleYaml", () => {
  it("parses scalars, lists, and booleans", () => {
    const raw = parseSimpleYaml(`
name: demo-skill
enabled: true
count: 3
tags:
  - a
  - b
inline: [x, y]
empty: []
`);
    expect(raw.name).toBe("demo-skill");
    expect(raw.enabled).toBe(true);
    expect(raw.count).toBe(3);
    expect(raw.tags).toEqual(["a", "b"]);
    expect(raw.inline).toEqual(["x", "y"]);
    expect(raw.empty).toEqual([]);
  });

  it("parses quoted strings", () => {
    const raw = parseSimpleYaml(`description: "hello: world"`);
    expect(raw.description).toBe("hello: world");
  });
});

describe("parseSkillMarkdown", () => {
  it("maps OD-style frontmatter to Skill", () => {
    const skill = parseSkillMarkdown(SAMPLE);
    expect(skill.id).toBe("marketing-xiaohongshu-specialist");
    expect(skill.name).toBe("小红书专家");
    expect(skill.description).toContain("小红书");
    expect(skill.category).toBe("marketing");
    expect(skill.triggers).toEqual(["小红书", "种草"]);
    expect(skill.examplePrompt).toContain("手冲咖啡");
    expect(skill.preview).toBe("markdown");
    expect(skill.source).toBe("bundled");
    expect(skill.enabled).toBe(true);
    expect(skill.systemPrompt).toContain("你是小红书内容专家");
  });

  it("uses name as id when name is a slug", () => {
    const skill = parseSkillMarkdown(`---
name: product-manager
description: PM
category: product
---

body`);
    expect(skill.id).toBe("product-manager");
    expect(skill.name).toBe("product-manager");
  });

  it("uses fallbackId when name is not a slug", () => {
    const skill = parseSkillMarkdown(
      `---
name: 产品经理
description: PM
category: product
---

body`,
      { fallbackId: "product-manager" },
    );
    expect(skill.id).toBe("product-manager");
    expect(skill.name).toBe("产品经理");
  });

  it("prefers explicit id field", () => {
    const skill = parseSkillMarkdown(`---
id: custom-id
name: Display Name
description: d
category: general
---

x`);
    expect(skill.id).toBe("custom-id");
    expect(skill.name).toBe("Display Name");
  });

  it("defaults category, source, enabled", () => {
    const skill = parseSkillMarkdown(`---
name: bare-skill
description: only required-ish fields
---

prompt body`);
    expect(skill.category).toBe("general");
    expect(skill.source).toBe("bundled");
    expect(skill.enabled).toBe(true);
    expect(skill.systemPrompt).toBe("prompt body");
  });

  it("toSkillMeta omits systemPrompt", () => {
    const skill = parseSkillMarkdown(SAMPLE);
    const meta = toSkillMeta(skill);
    expect(meta.id).toBe(skill.id);
    expect(meta.name).toBe(skill.name);
    expect("systemPrompt" in meta).toBe(false);
  });
});

describe("slugify", () => {
  it("slugifies ascii text", () => {
    expect(slugify("Hello World!")).toBe("hello-world");
  });
});
