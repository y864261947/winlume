# 007 - Portal homepage design refinement (unified visual system)

**Severity**: MEDIUM
**Status**: TODO
**Area**: Landing / Portal home (`/`)
**Dependency**: None

## Goal

让公共首页 `/`(即 `ModelMarket`)在**不重构 JSX 结构、不换技术栈**的前提下,从"功能多、品味杂"收敛成"安静、协调、有呼吸感"的一套视觉系统。

现状是**三套并行 CSS 视觉系统**叠加出来的:

- `portal` 基础(搜索卡 / API 卡 / 工具卡 / 轮播,`globals.css` ~4026–4660)
- `portal-v2` showcase + capability(应用展示 / 能力展示,~7417–7575)
- `portal-ed` 深色路径区(产品路径卡 / 定价 / FAQ / footer,~4715–5730)

三者各有一套 `--portal-*` / `--ed-*` 变量与硬编码色值。首页还有两段 **footer**:`portal-bottom-footer`(app-showcase 下方,~7548)和 `portal-ed-footer`(路径区底部,~5522)——它们由一个响应式覆盖块(~6203 起)在 1280px 以上互斥显示,并非真重复。

## Principle

只做**收束**与**叙事**,不做重构。

- 收束 = 让所有卡片讲同一种语言、所有区块共享同一节奏。
- 叙事 = 让"成果卡片"(`portal-result-preview` / `portal-capability-evidence`)成为主角,减少外围装饰。
- 所有改动用 `src/app/globals.css` 末尾的一个自包含覆盖层 `portal-design-v3` 落地,规则靠后,天然覆盖先前规则,可整体回退。

不改 `ModelMarket.tsx` 的 JSX 结构(避免破坏探探交互 / 引导 / 轮播 / 触控卡这些 JS 交互)。

## Files

- `src/app/globals.css` — 追加覆盖层(v3)
- `src/components/ModelMarket.tsx` — 仅两处小改:fix 硬编码 usage 数据、去掉第二个 footer 的品牌区重复(可选)

## Changes

### 1. 设计 token 层(v3 基座)

在 `.portal-home` 作用域派生一组语义 token,后续所有精修引用它:

```css
.portal-home.portal-home {            /* 提高优先级,确保覆盖先前规则 */
  /* ink levels */
  --p-ink: #0b1220;
  --p-ink-70: #2b3b52;
  --p-ink-55: #4c5f77;
  --p-ink-40: #71879e;                /* 次级/说明文字 */
  /* surfaces */
  --p-surface: rgba(255,255,255,.72);
  --p-surface-strong: rgba(255,255,255,.86);
  --p-surface-soft: rgba(244,249,255,.6);
  /* lines */
  --p-line: rgba(194,212,227,.82);
  --p-line-strong: rgba(160,184,204,.5);
  /* accents */
  --p-accent: var(--portal-blue);
  --p-blue: #0d4fc9;
  /* shadows */
  --p-shadow: 0 16px 32px -18px rgba(30,66,110,.42);
  --p-shadow-hover: 0 24px 44px -22px rgba(24,62,112,.5);
  /* rhythm */
  --p-card-radius: 16px;
  --p-gap: 22px;
  --p-section-gap: 36px;
}
```

> 采用 `.portal-home.portal-home` 的写法:双类提升优先级,既能在相同(0,2,0)下仍靠后覆盖,又不至于溢出干扰其他页面。

### 2. 统一卡片语言(收束重点)

把分散的卡片圆角、描边、投影收拢为同一种"玻璃 + 细内描边 + 柔和投影":

- 统一 `border-radius` 到 `16px`(现在 7/9/10/11/13/14/15/16 混用)。
- 统一 `box-shadow` = `var(--p-shadow)` + `inset 0 1px .5px rgba(255,255,255,.9)`。
- 统一 `border` 使用 `var(--p-line)`。
- `portal-app-showcase-card` / `portal-tool-card` 的 hover 只在 `translateY(-2px)` + 提升阴影,不再改变色相。

涉及:`.portal-search-card`、`.portal-usage-card`、`.portal-api-card`、`.portal-featured-card`、`.portal-side-card`、`.portal-industry-section`、`.portal-enterprise-card`、`.portal-tool-card`、`.portal-app-showcase-card`、`.portal-capability-hero`、`.portal-ed-stage`、`.portal-ed-path-list`、`.portal-ed-plan-card`、`.portal-ed-support-panel`。

### 3. 统一区块标题节奏(叙事)

三套 section-head 现在各自为政。统一为:

- kicker:`font-size 11px / letter-spacing .14em / weight 750 / color var(--p-accent)`,等宽(mono)。
- 标题:`font-size 22–24px / letter-spacing -.02em / weight 650 / line-height 1.2`。
- 副文案:`color var(--p-ink-40)`。
- 区块之间留白拉大到 `var(--p-section-gap)`,区块内部标题与内容间距 `12–14px`。

涉及 `.portal-app-showcase-head`、`.portal-bottom-explore-head`、`.portal-section-header`(industry)、`.portal-ed-section-head`、`.portal-ed-stage-head`。

### 4. 降密度:让成果卡片成为主角

- `portal-app-showcase`:`padding` 收敛到 `18px`,标题区 `align-items: baseline`,tab 与标题之间加 `12px`。
- `portal-capability-hero`:统一为"深色渐变 + 单一径向光斑 + 细白内描边",三类(models/agent/usage)共用同一套阴影/圆角/间距,只保留色调差异。
- `portal-result-preview`:作为卡片主体时,移除多余外围描边,保留原有渐变叙事。
- `portal-discovery-grid`:行高保持 `382px`,但让各卡片顶部 `border-radius` 一致、内部 padding 对齐到 `16–18px` 网格。

### 5. 修硬编码"假数据"

`ModelMarket` 的 `portal-usage-card` 里写死了三行:`¥168.20`、`1.24M`、`80%`。

- 余额已用 `account?.quota` 显示,保留。
- `已消耗 Token` 与 `会员剩余额度`:无数据时优雅降级为 `—`(而不是硬编码数字)。
- 实现:给 `usage-card` 补一个真实耗用量来源(`account` 或 `overview.usage` 汇总),取不到就显示占位符。见问题 2。

### 6. 合并重复 footer

- 保留 `portal-bottom-footer`(app-showcase 下方,品牌 + 分栏)。
- 同一覆盖层内让 `portal-ed-footer` 与 `portal-bottom-footer` 视觉一致(字号/行距/列宽),避免两套样式割裂。`portal-ed-footer` 的品牌区去掉与 `portal-bottom-footer` 重复的"REIZO + slogan"部分(可选)。

### 7. 克制动画(叙事,不喧宾夺主)

纯 CSS,不引入新依赖:

- `portal-app-showcase-v2` 与 `portal-capability-showcase` 区块在进入视口时,块内卡片 `opacity:0 → 1` + `translateY(8px) → 0`,用 `@keyframes` + `animation-timeline: view()`(Chrome 原生支持,其余浏览器按无动画降级,不改变布局)。
- hover 只在 `transform`/`box-shadow` 上做 `<=220ms` 的缓动。

## Risks / mitigations

- `globals.css` 已 **7652 行**,规则层多、断点交叉多。仅追加覆盖层,不改原规则 → 风险可控、可整体回退。
- 双类选择器 `.portal-home.portal-home` 优先级较高,统一覆盖需要同样用 `.portal-home .portal-app-showcase-card` 这类前置作用域写法,避免误伤 `/products`、`/account` 等其他 portal 页面。

## Not doing (this pass)

- 不重建 `ModelMarket.tsx` 的 JSX 结构 / 不重排区块顺序。
- 不动 `/account`、`/account/portal`、`/products` 的样式(除非被同一 `portal-home` 作用域命中)。
- 不引入 framer-motion 原生 `view()` polyfill。
- 不换品牌视觉基调(当前蓝橙渐变画布 + 玻璃拟态方向保留)。

## Preview

`npm run dev` 后访问 `http://localhost:3000/`,重点看:

- 首屏搜索卡与发现网格是否"整齐、不挤"。
- `应用工具`/`API模型`/`能力展示` 三块是否共用同一"语言"。
- 两个 footer 是否协调。
- usage 卡是否不再显示编造的余额数字。
