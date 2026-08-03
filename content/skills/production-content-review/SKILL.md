---
name: production-content-review
title: 编辑审查
description: 对文稿进行有证据的质量审查，输出可执行修改记录，用于生产工作流的审查阶段。
category: testing
triggers:
  - 编辑审查
  - 文稿审查
  - 修改记录
example_prompt: 审查这份文稿并给出可执行的修改记录。
preview: markdown
source: bundled
enabled: true
default_artifact: markdown
---

# 编辑审查

## 阶段目标

审查 `draft`，创建名为 `review-record` 的 Markdown Artifact。结论必须能让后续修改明确知道问题位置、影响和必要修复，而不是给出笼统评价。

## 开始前

- 读取 `draft` 及其可追溯的研究说明；不要依据未提供的品牌规范或外部信息评分。
- 检查目标读者、事实边界、结构、语气、行动建议和待核验标记。
- 将问题按“阻断、重要、建议”分级；没有问题也需要说明已检查的范围。

## 交付

使用 `write_artifact` 创建 `review-record`，类型为 Markdown，按以下结构填写：

```markdown
# 审查记录

## 结论
## 已检查范围
## 发现项
### [级别] 评价维度
- 原文证据：
- 影响：
- 必要修改：
## 通过条件或下一步
```

结论只能是“通过”“需要修改”或“阻断”。每条发现项必须引用文稿中的具体段落、句子或缺失位置。

## 自检

- 每个发现项是否包含评价维度、原文证据和可执行修改？
- 是否把阻断问题与一般建议区分开？
- 未发现问题时，是否说明检查范围和通过依据？
- 是否只创建了本阶段的 `review-record`？

## 能力边界

不声称完成了人工审批、法律审查或外部事实核验；仅审查当前可读取材料。不得声称已生成图像或视频；本阶段只交付 Markdown 审查记录。
