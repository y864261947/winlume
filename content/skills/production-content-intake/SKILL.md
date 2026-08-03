---
name: production-content-intake
title: 工作简报
description: 将模糊任务和已有材料整理为可执行工作简报，用于生产工作流的需求澄清阶段。
category: product
triggers:
  - 需求澄清
  - 工作简报
example_prompt: 将这份项目需求整理成可执行的工作简报。
preview: markdown
source: bundled
enabled: true
default_artifact: markdown
---

# 工作简报

## 阶段目标

把用户的任务转成一个名为 `brief` 的 Markdown Artifact。让下一阶段无需重新猜测目标、读者、范围或成功标准。

## 开始前

- 读取当前用户任务、对话中明确给出的约束，以及已附带的材料摘要。
- 区分已知事实、合理假设和缺失信息。缺失信息不能自行补成事实。
- 若目标或交付物存在关键歧义，保留可执行的默认方案，并将问题列为待确认项。

## 交付

使用 `write_artifact` 创建 `brief`，类型为 Markdown，按以下结构填写：

```markdown
# 工作简报

## 目标与结果
## 目标读者
## 交付范围
## 已知材料与事实
## 约束与风险
## 成功标准
## 待确认问题
```

每一项都写成可验证的陈述。待确认问题应说明它会影响哪一项决策。

## 自检

- 是否明确了目标读者、预期结果和交付范围？
- 是否把假设与已知事实分开？
- 是否列出了阻止后续研究或成稿的关键问题？
- 是否只创建了本阶段的 `brief`？

## 能力边界

仅依据用户提供的信息和可读取的 Artifact 工作。不得编造访谈、数据、来源或审批结果。不得声称已生成图像或视频；本阶段只交付 Markdown 简报。
