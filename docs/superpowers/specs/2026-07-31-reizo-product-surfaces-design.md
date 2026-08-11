# Reizo multi-surface product design

## Decision

Reizo keeps the personal homepage as a model-market-first entry point. It does not become a Studio landing page. The market guides discovery and trial; context-aware scene tools, templates, and a persistent “continue creating” path move users into Studio when they are ready to work.

The enterprise surface is a combined platform-and-delivery story: enterprise AI capabilities (model gateway, Agent, knowledge/MCP, workspace and governance) are credible because Reizo also assesses, co-designs, deploys and operates them. It is not a generic consulting brochure.

The account and developer center is the shared control plane for identity, wallet, teams, API credentials, Agents, MCP and support.

## Visual system

Use the Studio system, not a warm marketplace palette:

- Canvas `#F5F7FA`; ambient light `#CDF8F7`, `#E2E8F0`, `#F1F5F9`.
- High-emphasis operation surfaces `#0F172A` and `#1E293B`; text `#241E36`, `#615A73`, `#8A8298`.
- System font stack: `-apple-system`, `BlinkMacSystemFont`, `PingFang SC`, `Microsoft YaHei`, `system-ui`.
- Liquid Glass uses one thick structural material at a time: white 48–72% frosted fill, 16–48px blur, subtle bright top rim, inset contact edge and deep navy-tinted shadow. Do not stack light translucent panels.
- Motion is purposeful: press feedback around 100ms; passive navigation/card changes use transform and opacity; panels originate at their trigger; direct manipulation is spring-driven and interruptible. Reduced motion changes travel/spring to a short opacity cross-fade and reduced transparency increases surface opacity.

## Information architecture

### Shared navigation

`模型市场`, `场景工具`, `工作台`, `企业方案`, `开发者`, `资源` plus a signed-in account trigger. The personal/enterprise switch remains visible, but is no longer the sole navigation mechanism.

### Personal: model market

Existing: model search, category rail, model cards and trial entry.

Design additions: featured scene-tool strip; model-detail task templates; logged-in floating continuation card; scene categories for research/content, image workflow, video/audio, code, data/RAG and API playground. Each scene points to a preconfigured Studio intent instead of duplicating Studio.

### Personal: Studio overview

Existing: creation, Skills, Artifacts, inspiration, settings and sessions.

Design additions: project switcher; actionable task queue with status; an artifact delivery shelf; recent model/cost context; tools hub that groups Skills by real workflow. These are planned capability designs, explicitly marked as such.

### Enterprise

Hero: “Use a controllable AI platform to deliver production-ready business outcomes.” CTAs are `免费技术评估`, `客户案例`, `AI 就绪度评估`.

Sections: platform foundations; governance and operations; delivery process; industry scenarios; proof/cases; assessment entry; support and contact. The platform capabilities page details Model Gateway, Agent, Knowledge/MCP, Workspace, access control and usage/cost visibility.

### Account and developer center

Left navigation: account info; wallet/billing; team; verification; favorites/downloads; API keys; Agents; MCP; external tools/APIs; documentation, changelog and support. The primary dashboard exposes quota, active keys, Agent/MCP counts, recent usage and quick starts. Privileged configuration stays behind explicit status and permission explanations.

## Figma deliverables

1. `00 Foundations`: Studio color variables, type ramp, material tiers, buttons, chips, nav, cards, status and motion annotations.
2. `01 Personal — Model Market`: desktop homepage with category rail, discovery, scene-tool strip and continue-creating card.
3. `02 Personal — Studio Overview`: project/task/artifact and tool-hub expansion around the existing Studio shell.
4. `03 Enterprise — Home`: platform + delivery landing page with assessment and cases.
5. `04 Enterprise — Platform`: capability map and governance/implementation detail.
6. `05 Account & Developer Center`: dashboard, side navigation and key management state.

## Scope and acceptance

The Figma file is a product design and roadmap artifact, not an implementation claim. Existing and planned features must be labelled separately. It should be visually consistent with Studio, use reusable foundations/components, and include enough empty/loading/access states to make review meaningful. Validate hierarchy with Figma metadata and inspect each major screen screenshot for clipping, contrast and glass-layer legibility.
