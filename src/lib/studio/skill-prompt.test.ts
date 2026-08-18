import { describe, expect, it } from "vitest";
import { isGenericSkillPrompt, usableComposerPrompt } from "./skill-prompt";

describe("skill composer prompts", () => {
  it("rejects the canned professional-perspective filler", () => {
    expect(
      isGenericSkillPrompt(
        "请以「内容创作者经济(Substack / Beehiiv / 公众号)」的专业视角帮我完成这项任务。",
      ),
    ).toBe(true);
    expect(usableComposerPrompt("请以「SEO 专家」的专业视角帮我完成任务。")).toBeUndefined();
  });

  it("rejects the canned role-help-me-finish filler", () => {
    expect(
      isGenericSkillPrompt("请以「中国市场本地化策略师」的角色，帮助我完成：…"),
    ).toBe(true);
    expect(
      usableComposerPrompt('"请以「FP&A 分析师」的角色，帮助我完成：…"'),
    ).toBeUndefined();
  });

  it("keeps a real task example", () => {
    const prompt = "为咖啡店开业写一套多渠道宣传内容。";
    expect(isGenericSkillPrompt(prompt)).toBe(false);
    expect(usableComposerPrompt(prompt)).toBe(prompt);
  });

  it("keeps a role wrapper that still names a concrete task", () => {
    const prompt = "请以「SEO 专家」的专业视角帮我完成：为咖啡店写三篇小红书种草笔记";
    expect(isGenericSkillPrompt(prompt)).toBe(false);
    expect(usableComposerPrompt(prompt)).toBe(prompt);
  });
});
