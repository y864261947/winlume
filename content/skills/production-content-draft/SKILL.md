---
name: production-content-draft
title: 内容成稿
description: 将已核验的研究笔记编写为面向目标读者的可编辑内容初稿，用于生产工作流的成稿阶段。
category: marketing
triggers:
  - 内容成稿
  - 初稿
  - 文稿
example_prompt: 根据研究笔记写出一篇可供审阅的内容初稿。
preview: markdown
source: bundled
enabled: true
default_artifact: markdown
---

# 内容成稿

## 阶段目标

将 `research-notes` 转成名为 `draft` 的 Markdown Artifact。成稿应服务于简报定义的读者和结果，且保留可由审查者核对的事实边界。

## 开始前

- 读取 `research-notes`，优先使用已核验事实和明确标注的可用观点。
- 从研究笔记中识别目标读者、行动目标、语气限制和待核验信息。
- 对仍未证实但必须提及的内容，使用条件性表述或显式备注，不能写成确定事实。

## 交付

使用 `write_artifact` 创建 `draft`，类型为 Markdown，至少包括：

```markdown
# 标题

## 摘要
## 正文
## 行动建议或下一步
## 事实与待核验说明
```

用清晰层级组织正文。标题、结构和行动建议要能直接对应研究笔记中的读者与目标；必要时在“事实与待核验说明”中标出发布前需要补证的主张。

## 自检

- 是否只使用了已核验事实，或清楚标记了未证实内容？
- 是否让目标读者能理解并采取下一步行动？
- 标题、正文和行动建议是否围绕同一个目标？
- 是否只创建了本阶段的 `draft`，等待人工审批后再继续？

## 能力边界

不把研究笔记以外的猜测包装成事实，也不承诺发布、投放或外部平台效果。不得声称已生成图像或视频；本阶段只交付 Markdown 文稿。
