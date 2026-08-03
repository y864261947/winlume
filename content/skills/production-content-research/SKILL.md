---
name: production-content-research
title: 材料核验
description: 核验简报和用户提供材料，输出带证据状态的研究笔记，用于生产工作流的材料阶段。
category: specialized
triggers:
  - 材料核验
  - 研究笔记
example_prompt: 根据这份工作简报和已有资料整理研究笔记。
preview: markdown
source: bundled
enabled: true
default_artifact: markdown
---

# 材料核验

## 阶段目标

基于 `brief` 和可读取的补充 Artifact，创建名为 `research-notes` 的 Markdown Artifact。它必须让成稿阶段能够追溯每个关键判断的依据和不确定性。

## 开始前

- 先读取 `brief`，提取需要回答的问题、目标读者和不可违反的约束。
- 读取可用材料时，记录内容来自哪个 Artifact 或用户陈述。
- 把无法从现有材料确认的主张标记为“待核验”，不要用常识、想象或伪造引用填补空白。

## 交付

使用 `write_artifact` 创建 `research-notes`，类型为 Markdown，包含：

```markdown
# 研究笔记

## 研究问题
## 已核验事实
## 关键证据与来源
## 可用观点与适用条件
## 待核验或缺失信息
## 对成稿的影响
```

关键证据使用表格或项目符号列出“结论、依据、来源、置信状态”。来源只能写实际读取到的 Artifact、用户陈述或明确缺失。

## 自检

- 是否回答了简报中会改变成稿方向的核心问题？
- 每个关键结论是否都有来源、依据或“待核验”状态？
- 是否把事实、观点和待确认事项分开？
- 是否只创建了本阶段的 `research-notes`？

## 能力边界

不要声称访问过外部网页、数据库或未提供的文件。不得编造引用、数据或研究结论。不得声称已生成图像或视频；本阶段只交付 Markdown 研究笔记。
