const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/client-QzlOz2Dp.js","assets/index-arjpOJmu.js","assets/mermaid-HWGCJPDP-DpXC_hwc.js","assets/uiStore-DTrjSdE-.js","assets/tabStore-CXf8Zebb.js","assets/ErrorBoundary-DD_WZ_a2.js","assets/chatStore-BuQW_C5p.js","assets/api-CUlua-r3.js","assets/settingsStore-DO_CHdsy.js","assets/skillStore-Ds8NWC6E.js","assets/projectStore-CqxyAM1Y.js"])))=>i.map(i=>d[i]);
function xe(e,t){for(var o=0;o<t.length;o++){const n=t[o];if(typeof n!="string"&&!Array.isArray(n)){for(const r in n)if(r!=="default"&&!(r in e)){const i=Object.getOwnPropertyDescriptor(n,r);i&&Object.defineProperty(e,r,i.get?i:{enumerable:!0,get:()=>n[r]})}}}return Object.freeze(Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}))}(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))n(r);new MutationObserver(r=>{for(const i of r)if(i.type==="childList")for(const s of i.addedNodes)s.tagName==="LINK"&&s.rel==="modulepreload"&&n(s)}).observe(document,{childList:!0,subtree:!0});function o(r){const i={};return r.integrity&&(i.integrity=r.integrity),r.referrerPolicy&&(i.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?i.credentials="include":r.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(r){if(r.ep)return;r.ep=!0;const i=o(r);fetch(r.href,i)}})();const je="modulepreload",Ae=function(e){return"/reizo/experience/"+e},me={},D=function(t,o,n){let r=Promise.resolve();if(o&&o.length>0){document.getElementsByTagName("link");const s=document.querySelector("meta[property=csp-nonce]"),m=s?.nonce||s?.getAttribute("nonce");r=Promise.allSettled(o.map(u=>{if(u=Ae(u),u in me)return;me[u]=!0;const E=u.endsWith(".css"),$=E?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${u}"]${$}`))return;const x=document.createElement("link");if(x.rel=E?"stylesheet":je,E||(x.as="script"),x.crossOrigin="",x.href=u,m&&x.setAttribute("nonce",m),document.head.appendChild(x),E)return new Promise((I,c)=>{x.addEventListener("load",I),x.addEventListener("error",()=>c(new Error(`Unable to preload CSS for ${u}`)))})}))}function i(s){const m=new Event("vite:preloadError",{cancelable:!0});if(m.payload=s,window.dispatchEvent(m),!m.defaultPrevented)throw s}return r.then(s=>{for(const m of s||[])m.status==="rejected"&&i(m.reason);return t().catch(i)})};var St=typeof globalThis<"u"?globalThis:typeof window<"u"?window:typeof global<"u"?global:typeof self<"u"?self:{};function Ce(e){return e&&e.__esModule&&Object.prototype.hasOwnProperty.call(e,"default")?e.default:e}var we={exports:{}},ee={};/**
 * @license React
 * react-jsx-runtime.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var Ie=Symbol.for("react.transitional.element"),Me=Symbol.for("react.fragment");function _e(e,t,o){var n=null;if(o!==void 0&&(n=""+o),t.key!==void 0&&(n=""+t.key),"key"in t){o={};for(var r in t)r!=="key"&&(o[r]=t[r])}else o=t;return t=o.ref,{$$typeof:Ie,type:e,key:n,ref:t!==void 0?t:null,props:o}}ee.Fragment=Me;ee.jsx=_e;ee.jsxs=_e;we.exports=ee;var X=we.exports;const $e={title:"春夏训练系列 · 品牌视觉",prompt:"为一个运动品牌制作春夏训练系列视觉，包含跑步、力量训练和日常运动场景，用于商品上架和推广，统一品牌风格。",response:"我会先统一春夏系列的视觉主题，再把跑步、力量训练和日常运动分成三组场景，让商品图和推广图保持同一种品牌语言。",steps:["解析品牌与产品资料","确定系列视觉主题","规划服装搭配、模特与运动场景","制作商品及推广素材"],messages:["先整理品牌色、服装款式与上架规格，明确需要保留的产品细节。","以「轻盈、力量、日常」组织系列，统一光线、色彩和版式。","跑步突出动态，力量训练突出姿态，日常运动突出穿搭；各组沿用统一视觉规范。","画布里汇总主视觉、商品图与推广版式，方便整体确认。"],file:"春夏训练系列 · 视觉素材",type:"IMG",note:"主视觉 / 商品图 / 详情页 / 场景图 / 横幅",meta:"SPORT / 春夏训练系列"},Le={title:"《重入宫阙》· 首集",prompt:"制作一部古装权谋短剧的首集，时长 60 秒，包含人物设定、分镜、配音和字幕，讲述一位被赐死的皇妃重生回入宫当天，结尾揭示她的仇人也保留着前世记忆。",response:"首集用「赐死—重生—试探—反转」四段推进。先确立女主和对手的关系，再把 60 秒拆成镜头、对白与声音节奏。",steps:["编写剧情与对白","建立角色形象","设计镜头与分镜","生成视频片段","配音、配乐与字幕合成"],messages:["开场以赐死的记忆闪回切入，女主醒在入宫当天；结尾让对手说出只有前世才知道的话。","女主表面克制、内心警觉；对手看似温和，目光里藏着试探。服饰与色彩保持一致。","0–8 秒闪回，8–22 秒重生，22–45 秒交锋，45–60 秒揭示另一位重生者。","按分镜排列片段位置，用待播封面与缩略图呈现首集结构。","低声旁白与宫廷环境音衔接，反转对白单独落字幕，最后停在女主的反应。"],file:"重入宫阙 · 第 01 集",type:"MP4",note:"60 秒 / 分镜脚本 / 角色设定 / 封面",meta:"FILM / 古装权谋 · 第 01 集"},He={title:"生活方式品牌 · 7 天内容计划",prompt:"为一个生活方式品牌安排 7 天的小红书与抖音推广内容，包含图文和短视频，表达自然，避免硬广。",response:"先从日常生活里的真实问题切入。小红书侧重体验与收藏价值，抖音用短场景和节奏表达，同一主题不直接复制两份文案。",steps:["分析受众与内容主题","规划平台表达","编写文案与脚本","安排发布日历"],messages:["围绕通勤、居家和周末生活，找出受众愿意看、愿意分享的话题。","小红书用图文清单和体验笔记，抖音用生活片段与一句话开场。","避免堆卖点，先讲具体情境，再自然带到产品；每条准备两组标题。","把 7 天的主题、平台、格式和素材需求排在同一张日历里。"],file:"生活方式品牌 · 一周内容日历",type:"XLSX",note:"内容日历 / 图文 / 短视频脚本 / 标题备选",meta:"CONTENT / 7 天双平台计划"},De={title:"葡萄酒酒庄 · 品牌独立站",prompt:"为一家葡萄酒酒庄搭建品牌独立站，展示酒庄历史、葡萄园、葡萄酒系列与品鉴预约，支持中英文和移动端。",response:"以酒庄故事和葡萄园为首页主线，让葡萄酒系列与品鉴预约各有清楚入口。桌面版保留舒展留白，手机端优先保证浏览和预约顺畅。",steps:["梳理网站结构","确定视觉与页面布局","开发页面和交互","配置双语与预约表单","检查电脑及手机显示"],messages:["页面分为酒庄故事、葡萄园、葡萄酒系列和品鉴预约，减少无关入口。","采用低饱和葡萄园色调与衬线标题，用风土、年份和酿造细节组织叙事。","安排首页、系列详情和预约界面的版式，保持导航与按钮样式一致。","中英文沿用同一结构；预约表单保留日期、人数与联系方式。","桌面与手机预览并排展示，检查主标题、图片裁切和预约入口。"],file:"酒庄品牌独立站 · 页面交付",type:"ZIP",note:"网站页面 / 源代码 / 双语 / 预约 / 部署说明",meta:"WEB / 酒庄品牌网站 · 界面示意"},Ne={title:"供应商合同 · 风险与付款安排",prompt:"检查这份供应商合同，整理付款条件、交付验收和违约条款，标记风险并汇总付款安排。",response:"我会把付款与验收放在一起核对，标出模糊条款和缺失信息，再整理成批注、风险清单与付款计划，供专业人员复核。",steps:["提取条款与金额","核对付款和验收节点","标记风险与缺失信息","整理修改建议"],messages:["提取合同中的付款比例、付款期限、交付内容和违约责任，保留条款位置。","检查每笔付款是否有明确触发条件，验收方式、反馈期限是否完整。","将验收标准不清、尾款条件模糊和责任边界缺失分别标注。","把修改建议对应到原条款，并以付款表呈现节点与待确认事项。"],file:"供应商合同 · 审阅文件组",type:"DOCX",note:"合同批注 / 风险清单 / 修改建议 / 付款计划",meta:"REVIEW / 合同与付款 · 示意内容"},ze={title:"染烫后护理 · 新品概念",prompt:"规划一款针对染烫后干枯、毛躁发质的头发护理新品，明确产品定位、配方方向、包装和测试方案。",response:"先围绕染烫后的干枯、毛躁和梳理体验定义产品，再把配方研究、包装概念与测试安排串起来。功效表述留到测试验证后确认。",steps:["分析用户需求与竞品","确定产品形态及卖点","整理成分与配方研究方向","设计包装概念","制定打样和功效测试计划"],messages:["梳理染烫人群的使用习惯，区分即时顺滑体验与长期护理诉求。","以冲洗型发膜为概念方向，明确使用频率、容量和价格带的待确认项。","围绕保湿、调理与柔顺整理研究方向；配方相容性、安全性需专业评估。","用简洁瓶罐与信息层级展示包装，避免写入未经验证的功效结论。","安排打样、稳定性、安全性与使用体验测试，输出需求书和验证计划。"],file:"染烫后护理新品 · 概念方案",type:"PPTX",note:"概念书 / 配方方向 / 包装 / 打样 / 测试",meta:"PRODUCT / 头发护理 · 包装概念"},Ue={title:"本周工作 · 会议行动看板",prompt:"根据这份会议记录，整理本周工作，明确负责人、截止时间，以及需要我确认的问题。",response:"我会把已确定的行动项和待决定的问题分开，每项任务列出负责人、时间与依赖；会议里没有明确的信息先标成待确认。",steps:["提取决策与行动项","分配任务与时间","检查任务依赖","汇总待确认事项"],messages:["先将讨论内容分为已决定、待执行和待确认，避免把提议当成结论。","把负责人和截止时间对应到任务，没有明确归属的保留待分配。","标出素材审核、文案排期和发布之间的依赖关系。","整理需要你确认的预算与上线时间，并准备给各负责人的跟进消息。"],file:"本周会议 · 工作安排",type:"DOCX",note:"会议纪要 / 任务看板 / 待决策 / 跟进草稿",meta:"WORK / 本周任务 · 示例安排"},We={title:"数字化能力与创新绩效 · 研究框架",prompt:"围绕“数字化能力如何影响企业创新绩效”搜索文献，梳理研究假设，搭建模型图，并利用我上传的数据验证。",response:"先明确变量关系与可追溯的文献来源，再搭建假设和模型。随后核对上传数据的字段与量表，安排信效度及路径检验，区分假设与验证结论。",steps:["检索并核对文献来源","提取变量与量表","构建假设和模型图","清洗上传数据","检验信效度与模型结果"],messages:["围绕数字化能力、知识整合和创新绩效整理检索词，文献需核对出处后引用。","建立变量与量表对应表，记录定义、维度和题项来源。","以数字化能力影响创新绩效为主路径，知识整合作为待检验的中介方向。","检查缺失值、异常值与量表编码，记录每一步数据处理。","准备信效度、直接效应与中介效应的检验结构；画布只展示模型与结果表的示意。"],file:"数字化能力与创新绩效 · 研究材料",type:"DOCX",note:"文献矩阵 / 模型图 / 数据表 / 代码 / 报告",meta:"RESEARCH / 假设模型 · 待数据验证"},oe={design:$e,video:Le,marketing:He,website:De,legal:Ne,product:ze,office:Ue,research:We},Ye=320,qe=260,Be=e=>({x:40+e%3*360,y:40+Math.floor(e/3)*300}),Ge=(e,t,o,n,r)=>({id:e,type:"note",title:t,...Be(o),w:Ye,h:qe,params:{content:n,color:"slate"},from:r}),B=(e,t,o,n,r,i,s)=>({id:e,type:"image",title:t,x:o,y:n,w:250,h:r,params:{prompt:t,size:"1024x1536"},asset:i,from:s}),Fe={marketing:[`### 受众与主题

**核心人群**
25–35 岁城市通勤者，关注居家质感与周末放松。

**三条主线**
通勤小物 / 居家角落 / 周末出走`,`### 平台表达

**小红书**
图文清单、真实体验笔记，强调收藏价值。

**抖音**
15 秒生活片段，第一句话直接进入场景。`,`### 文案与脚本 · 周三

**标题 A** 下班后的 20 分钟，留给自己
**标题 B** 小房间也能有的仪式感

**脚本**
开门 → 放下包 → 点灯 → 一杯热茶 → 产品自然入镜`,`### 7 天发布日历

**周一** 图文 · 通勤清单
**周二** 短视频 · 早晨 15 秒
**周三** 图文 · 居家角落
**周四** 短视频 · 下班仪式
**周五** 图文 · 周末计划
**周末** 用户共创征集`],website:[`### 网站结构

- 首页 · 酒庄故事
- 葡萄园 · 风土与年份
- 葡萄酒系列 · 详情
- 品鉴预约

导航保持 4 项，减少无关入口。`,`### 视觉方向

**色调** 低饱和葡萄园绿、陈年木色
**字体** 衬线标题 + 无衬线正文
**图片** 晨雾葡萄园、橡木桶、手写标签`,`### 首页版式

**首屏** 全幅葡萄园影像 + 一句酒庄宣言
**第二屏** 年份时间轴
**第三屏** 系列卡片，悬停显示风味
**页脚** 预约入口常驻`,`### 双语与预约

中英文共用同一结构，切换不刷新页面。

**预约字段**
日期 · 人数 · 联系方式 · 备注

提交后发送确认邮件。`,`### 多端检查

✓ 桌面 1440 / 1280
✓ 平板 834
✓ 手机 390

主标题不折行，图片裁切保留葡萄园远景，预约按钮始终可见。`],legal:[`### 条款与金额

**合同总额** ¥ 480,000（示例）

**付款** 30% 预付 · 40% 中期 · 30% 尾款
**交付** 分两批，第 4 周与第 8 周
**违约** 第 9.2 条`,`### 付款与验收核对

| 节点 | 触发条件 |
|---|---|
| 预付 | 签约后 5 日 |
| 中期 | 首批验收 · **未写期限** |
| 尾款 | “双方确认” · **条件模糊** |`,`### 风险标记

**高** 验收标准未量化（第 6 条）
**中** 尾款触发条件模糊（第 7.3 条）
**中** 违约金上限缺失（第 9.2 条）
**低** 知识产权归属未写明`,`### 修改建议

**第 6 条** 补充验收清单与 5 个工作日反馈期限。

**第 7.3 条** 尾款改为“终验通过后 10 日内支付”。

以上建议需专业人员复核。`],product:[`### 用户需求

**痛点** 染烫后干枯、毛躁、梳理打结
**期待** 即时顺滑 + 长期修护

**竞品观察**
多为免洗精油，冲洗型发膜选择较少。`,`### 产品形态

**冲洗型发膜** 每周 2–3 次
**容量** 200 ml（待确认）
**价格带** 中端（待确认）

**卖点** 3 分钟顺滑、易冲洗`,`### 配方研究方向

- 保湿：多元醇体系
- 调理：阳离子调理剂
- 柔顺：植物油脂

相容性与安全性需配方师评估。`,`### 包装概念

简洁圆罐，哑光白 + 一抹暖杏色。

**正面** 品名 / 适用发质
**背面** 用法与成分

不写入未经验证的功效结论。`,`### 打样与测试计划

**第 1–2 周** 3 版小样
**第 3–4 周** 稳定性 · 安全性
**第 5 周** 30 人使用体验

输出需求书与验证报告。`],office:[`### 决策与行动项

**已决定**
- 新品素材周四定稿
- 下周一上线预热

**待执行** 6 项
**待确认** 2 项`,`### 任务分配

| 任务 | 负责人 | 截止 |
|---|---|---|
| 素材审核 | 林舟 | 周三 |
| 文案排期 | 陈禾 | 周四 |
| 投放设置 | 待分配 | 周五 |`,`### 任务依赖

素材审核 → 文案排期 → 投放设置 → 上线

**关键路径** 素材审核若延期，上线顺延。`,`### 待你确认

1. 预热预算是否维持 ¥ 20,000（示例）
2. 上线时间：周一 10:00 或 20:00

**跟进消息草稿** 已为 3 位负责人准备。`],research:[`### 文献来源

检索词：数字化能力 · 知识整合 · 创新绩效

**初筛** 126 篇
**精读** 18 篇

每篇引用前核对出处。`,`### 变量与量表

| 变量 | 维度 | 题项 |
|---|---|---|
| 数字化能力 | 3 | 12 |
| 知识整合 | 2 | 8 |
| 创新绩效 | 2 | 6 |`,`### 假设与模型

**H1** 数字化能力 → 创新绩效（+）
**H2** 数字化能力 → 知识整合（+）
**H3** 知识整合的中介作用

待数据验证。`,`### 数据清洗

有效样本 312 份（示例）

- 缺失值：均值插补 4 处
- 异常值：剔除 7 份
- 反向题已重新编码`,`### 检验结构

1. 信度：Cronbach’s α
2. 效度：CFA · AVE
3. 直接效应
4. 中介效应：Bootstrap 5000 次

结果以表格呈现，结论待验证后撰写。`]},re={design:"用户要一整套春夏训练系列视觉。先确认品牌色与上架规格，再分场景组织素材，最后把成果铺到画布上便于整体确认。",video:"一支生活方式短片：需要先读懂产品素材，再定节奏与分镜，生成成片，最后补一份发布方案。",marketing:"7 天、两个平台、避免硬广。先找真实生活话题，再按平台差异化表达，最后排进日历。",website:"酒庄独立站：叙事优先，预约是核心转化。结构、视觉、开发、双语、多端检查依次推进。",legal:"合同审阅：付款与验收要放在一起核对，风险需分级，建议要对应到原条款。",product:"染烫后护理新品：从用户痛点出发，形态、配方方向、包装与测试计划要前后一致。",office:"会议记录整理：分清已决定和待决定，任务需要负责人、时间与依赖。",research:"研究框架：文献要可追溯，变量与量表对应清楚，假设与验证结论要区分开。"};function Ve(){const e=oe.design,o=[[{id:"design-brief",type:"note",title:"春夏系列 · 视觉规范",x:40,y:40,w:280,h:330,params:{content:`### 为每一次运动而来。

**品牌色**
黑白、砂色与运动蓝。

**场景**
跑步、力量训练、日常穿搭。

**交付**
主视觉、商品图、详情页与推广场景。`,color:"slate"}}],[B("design-made-to-move","系列主视觉",360,40,360,"design/made-to-move.jpg",["design-brief"]),B("design-collection","商品主图",640,40,360,"design/collection.jpg",["design-brief"])],[B("design-city-duo","跑步场景",920,40,360,"design/city-duo.jpg",["design-made-to-move"]),B("design-motion-bw","运动姿态参考",360,440,300,"design/motion-bw.jpg",["design-made-to-move"]),B("design-community","日常运动",640,440,300,"design/community.jpg",["design-collection"])],[B("design-fabric-detail","详情页 · 面料细节",920,440,300,"design/fabric-detail.jpg",["design-collection"])]];return{id:"design",title:e.title,prompt:e.prompt,thinking:re.design,response:e.response,steps:e.steps.map((n,r)=>({title:n,thinking:e.messages[r],nodes:o[r]}))}}function Je(){const e=[{title:"分析产品素材",thinking:"白色日常鞋，木质桌面，自然侧光。保留鞋型与材质纹理，作为成片的参考帧。",nodes:[{id:"video-source",type:"image",title:"产品素材",x:20,y:100,w:260,h:165,params:{prompt:"自然光下的白色日常鞋，木质桌面。",size:"1536x1024"},asset:"film/source.jpg"}]},{title:"撰写创意与分镜",thinking:"主题定为「Make room for everyday」。三个镜头：完整产品缓推、鞋面细节、回到完整场景。",nodes:[{id:"video-plan",type:"note",title:"创意与分镜",x:340,y:55,w:280,h:250,params:{content:`### Make room for everyday.

从忙碌里，走回自己的节奏。

**镜头 1**
自然光下的完整产品，缓慢推进。

**镜头 2**
观察鞋面与材质细节。

**镜头 3**
舒展镜头，回到完整场景。`,color:"slate"}}]},{title:"生成 12 秒成片",thinking:"以产品素材为参考、分镜为提示，16:9，节奏放慢，保持产品形态一致。",nodes:[{id:"video-final",type:"video",title:"日常鞋履 · 12 秒成片",x:680,y:90,w:360,h:215,params:{prompt:"自然光，缓慢推进，保持产品形态一致。",ratio:"16:9",duration:"10s"},asset:"film/everyday.mp4",from:["video-source","video-plan"]}]},{title:"整理发布方案",thinking:"按一周节奏安排：先介绍产品，再放进生活场景，周五发布短片并收集反馈。",nodes:[{id:"video-copy",type:"note",title:"发布方案",x:680,y:385,w:360,h:220,params:{content:`### 一周发布节奏

**周一 · 产品介绍**
产品细节与创意主题。

**周三 · 场景内容**
将产品放进日常生活。

**周五 · 短片发布**
汇总反馈，整理下一轮内容。`,color:"slate"},from:["video-final"]}]}];return{id:"video",title:"日常鞋履 · 发布短片",prompt:"用这张产品图做一支生活方式短片。自然光，节奏慢一点，同时整理发布方案。",thinking:re.video,response:"短片以产品近景开场，缓慢推进到鞋面细节，再回到完整场景。字幕和镜头节奏已配好，发布方案也一并整理。",steps:e}}function Ze(e){const t=oe[e];return{id:e,title:t.title,prompt:t.prompt,thinking:re[e],response:t.response,steps:t.steps.map((o,n)=>({title:o,thinking:t.messages[n],nodes:[Ge(`${e}-note-${n}`,o,n,Fe[e][n]??`### ${o}

${t.messages[n]}`,n?[`${e}-note-${n-1}`]:void 0)]}))}}const V=Object.fromEntries(Object.keys(oe).map(e=>[e,e==="design"?Ve():e==="video"?Je():Ze(e)]));function Xe(e){return`${e.response}

${e.steps.map(t=>`**${t.title}**
${t.thinking}`).join(`

`)}

相关内容已放在右侧画布，可以打开节点继续查看。`}const Ke=`这里是官网上的工作台体验，内容为预先准备的示例。

要让 Agent 真正处理你的任务，请进入 REIZO 工作台。`,H="2026-10-05T08:00:00.000Z",K=(e,t,o)=>({id:e,role:t,content:o,createdAt:H,...t==="assistant"?{turnOutcome:"completed"}:{}});function Qe(){const e=[{id:"film",title:"日常鞋履 · 发布短片",createdAt:H,updatedAt:H,workspacePath:null,projectId:null,lastTurnOutcome:"completed",messages:[K("film-u","user","用这张产品图做一支生活方式短片。自然光，节奏慢一点，同时整理发布方案。"),K("film-a","assistant",`已把素材、创意方向和成片放到右侧画布。

短片以产品近景开场，缓慢推进到鞋面细节，再回到完整场景。字幕和镜头节奏已配好。

你可以在画布上播放成片，也可以打开发布方案，继续调整。`)]},{id:"commerce",title:"毛球修剪器 · 电商套图",createdAt:H,updatedAt:H,workspacePath:null,projectId:null,lastTurnOutcome:"completed",messages:[K("commerce-u","user","根据产品参考图，整理一套电商图片：白底主图、细节图和卖点图。保留蓝色按钮和透明集屑杯。"),K("commerce-a","assistant",`已整理好白底主图、产品细节和卖点图。

蓝色按钮和透明集屑杯已保留。图片与商品文案放在右侧画布。`)]}];function t(s,m,u,E,$,x,I,c,w,R){return{id:m,canvasId:s,type:u,title:E,x:$,y:x,w:I,h:c,params:w,paramsHash:null,runState:R?"done":"idle",output:R?{assets:[R]}:null,updatedAt:H}}function o(s,m,u){return{canvas:{id:s,sessionId:s,liveRevision:1,createdAt:H,updatedAt:H},nodes:m,edges:u.map(([E,$],x)=>{const I=m.find(w=>w.id===E),c=m.find(w=>w.id===$);return{id:`${s}-edge-${x}`,canvasId:s,sourceId:E,targetId:$,sourceHandle:I.type==="image"?"image_out":"prompt_out",targetHandle:c.type==="note"?"text_in":I.type==="image"?"reference":"prompt"}})}}const n={film:o("film",[t("film","film-source","image","产品素材",20,100,260,165,{prompt:"自然光下的白色日常鞋，木质桌面。",size:"1536x1024"},"film/source.jpg"),t("film","film-plan","note","创意与分镜",340,55,280,250,{content:`### Make room for everyday.

从忙碌里，走回自己的节奏。

**镜头 1**
自然光下的完整产品，缓慢推进。

**镜头 2**
观察鞋面与材质细节。

**镜头 3**
舒展镜头，回到完整场景。`,color:"slate"}),t("film","film-final","video","日常鞋履 · 12 秒成片",680,90,360,215,{prompt:"自然光，缓慢推进，保持产品形态一致。",ratio:"16:9",duration:"10s"},"film/everyday.mp4"),t("film","film-copy","note","发布方案",680,385,360,220,{content:`### 一周发布节奏

**周一 · 产品介绍**
产品细节与创意主题。

**周三 · 场景内容**
将产品放进日常生活。

**周五 · 短片发布**
汇总反馈，整理下一轮内容。`,color:"slate"})],[["film-source","film-final"],["film-plan","film-final"],["film-final","film-copy"]]),commerce:o("commerce",[t("commerce","commerce-ref","image","产品参考",20,110,240,240,{prompt:"白色毛球修剪器，蓝色按钮，透明集屑杯。",size:"1024x1024"},"commerce/main.jpg"),t("commerce","commerce-main","image","白底主图",340,20,240,240,{prompt:"纯白背景，保留产品外形，柔和光线。",size:"1024x1024"},"commerce/main.jpg"),t("commerce","commerce-detail","image","产品细节",660,20,240,240,{prompt:"刀网、按钮与充电接口的产品细节组图。",size:"1024x1024"},"commerce/detail.jpg"),t("commerce","commerce-features","image","功能卖点",660,355,182,380,{prompt:"简洁的商品卖点图，搭配功能说明。",size:"1024x1024"},"commerce/features.jpg"),t("commerce","commerce-copy","note","商品文案",340,355,255,255,{content:`### 便携毛球修剪器

让旧衣物恢复整洁。

- USB 充电
- 蜂窝刀网
- 透明集屑杯

主图与详情页统一使用白色背景。`,color:"slate"})],[["commerce-ref","commerce-main"],["commerce-ref","commerce-detail"],["commerce-detail","commerce-features"]])},r={appearance:"light",activeProviderId:"reizo",workspacePath:null,permissionMode:"ask",busyEnter:"queue",computerUse:!1,mediaModels:{},directorSessions:{},reasoningEffort:"low",providers:[{id:"reizo",name:"REIZO",tag:"多模型",hasKey:!1,model:"auto",baseUrl:"",websiteUrl:"https://reizo-ai.com",allowCustomBaseUrl:!1,description:"官网界面体验",models:[{id:"auto",name:"REIZO 自动"},{id:"gpt-5.6-sol",name:"GPT-5.6 Sol"}]}]},i=Object.values(V).map(s=>({id:s.id,title:s.title,createdAt:H,updatedAt:H,workspacePath:null,projectId:null,lastTurnOutcome:null,messages:[]}));for(const s of Object.values(V))n[s.id]=o(s.id,[],[]);return{sessions:[...i,...e],canvases:n,settings:r}}const Y="这是工作台界面体验。要与 Agent 对话或生成新作品，请进入 REIZO 工作台。",g=(e,t=200)=>new Response(JSON.stringify(e),{status:t,headers:{"content-type":"application/json"}});function et(e,t){const o=Qe(),n=new Map;let r=()=>!0;const i=new Map,s=c=>new TextEncoder().encode(JSON.stringify(c)+`
`);function m(c,w,R){if(!w.length)return;c.canvas.liveRevision++;const _={v:2,kind:"commit",canvasId:c.canvas.id,epoch:"showcase",commit:{canvasId:c.canvas.id,revision:c.canvas.liveRevision,changes:w,mutationId:R}};for(const d of i.get(c.canvas.id)??[])d.enqueue(s(_))}function u(c,w,R){const _=[];for(const d of w)if(d.kind==="add_node"){const p={id:d.id,canvasId:c.canvas.id,type:d.node.type,x:d.node.x,y:d.node.y,w:d.node.w??280,h:d.node.h??260,title:d.node.title??"新节点",params:d.node.params??{},runState:"idle",paramsHash:null,output:null,updatedAt:new Date().toISOString(),...d.patch};c.nodes.push(p),_.push({type:"node_added",node:p})}else if(d.kind==="update_node"){const p=c.nodes.find(S=>S.id===d.id);p&&(Object.assign(p,d.patch),_.push({type:"node_updated",node:p}))}else if(d.kind==="delete_node"){c.nodes=c.nodes.filter(p=>p.id!==d.id);for(const p of c.edges.filter(S=>S.sourceId===d.id||S.targetId===d.id))_.push({type:"edge_deleted",id:p.id});c.edges=c.edges.filter(p=>p.sourceId!==d.id&&p.targetId!==d.id),_.push({type:"node_deleted",id:d.id})}else if(d.kind==="add_edge"){const p={...d.edge,canvasId:c.canvas.id};c.edges.push(p),_.push({type:"edge_added",edge:p})}else c.edges=c.edges.filter(p=>p.id!==d.id),_.push({type:"edge_deleted",id:d.id});m(c,_,R)}const E=typeof matchMedia=="function"&&matchMedia("(prefers-reduced-motion: reduce)").matches,$={headers:{"content-type":"application/x-ndjson"}};function x(c,w,R){if(n.has(c))return g({error:"示例正在播放"},409);const _=new AbortController;n.set(c,_);const d=()=>_.abort();R?.addEventListener("abort",d,{once:!0}),R?.aborted&&_.abort();const p=o.sessions.find(a=>a.id===c),S=V[c],k=p.messages.length===0&&w===S?.prompt?S:void 0,M=o.canvases[c],O=new TextEncoder,h=Date.now(),b={id:`${c}-u-${h}`,role:"user",content:w,createdAt:new Date(h).toISOString()};p.messages.push(b);const L=new ReadableStream({async start(a){const f=y=>a.enqueue(O.encode(JSON.stringify(y)+`
`)),P=async y=>{let j=E?0:y;do{if(_.signal.aborted)throw new DOMException("aborted","AbortError");const A=r(c);if(A&&j<=0)return;const C=Math.min(50,Math.max(1,j));await new Promise(T=>setTimeout(T,A?C:50)),A&&(j-=C)}while(!0)},q=async(y,j,A=3,C=26)=>{if(E){f({type:y,delta:j});return}for(let T=0;T<j.length;T+=A)f({type:y,delta:j.slice(T,T+A)}),await P(C)},N=[],J=[],pe=async y=>{const j=Date.now();f({type:"status",phase:"thinking"}),await q("reasoning",y),await P(260),J.push({text:y,durationMs:Date.now()-j,beforeToolIndex:N.length})},ke=y=>{const j=[{kind:"add_node",id:y.id,node:{type:y.type,x:y.x,y:y.y,w:y.w,h:y.h,title:y.title,params:y.params},patch:{runState:y.asset?"running":"done"}}];for(const A of y.from??[]){const C=M.nodes.find(T=>T.id===A);C&&j.push({kind:"add_edge",edge:{id:`${A}->${y.id}`,sourceId:A,targetId:y.id,sourceHandle:C.type==="image"?"image_out":"prompt_out",targetHandle:y.type==="note"?"text_in":C.type==="image"?"reference":"prompt"}})}u(M,j)};try{let y=Ke;if(k){await P(500),await pe(k.thinking);const A=C=>k.steps.map((T,U)=>({id:`${k.id}-todo-${U}`,content:T.title,status:U<C?"completed":U===C?"in_progress":"pending"}));for(const[C,T]of k.steps.entries()){f({type:"todos",items:A(C)}),await pe(T.thinking),f({type:"status",phase:"tools"});const U=T.nodes.length>1,Z={type:"tool",id:`${k.id}-tool-${C}`,name:U?"create_storyboard_pipeline":"add_node",args:U?{title:T.title,count:T.nodes.length}:{type:T.nodes[0].type,title:T.nodes[0].title}};f(Z);for(const z of T.nodes)ke(z),await P(380);const fe=T.nodes.filter(z=>z.asset);if(fe.length){await P(1100);for(const z of fe)u(M,[{kind:"update_node",id:z.id,patch:{runState:"done",output:{assets:[z.asset]}}}]),await P(220)}else await P(500);Z.result=JSON.stringify(U?{createdNodeIds:T.nodes.map(z=>z.id)}:{id:T.nodes[0].id}),f(Z),N.push(Z),await P(320)}f({type:"todos",items:A(k.steps.length)}),y=Xe(k)}else await P(400),f({type:"status",phase:"thinking"}),await P(600);f({type:"status",phase:"replying"}),await q("text",y,4,22);const j={id:`${c}-a-${Date.now()}`,role:"assistant",content:y,createdAt:new Date().toISOString(),turnOutcome:"completed",durationMs:Date.now()-h,...N.length?{parts:N}:{},...J.length?{reasoning:J.map(A=>A.text).join(`

`),reasoningSegments:J}:{}};p.messages.push(j),p.lastTurnOutcome="completed",p.updatedAt=j.createdAt,f({type:"done",outcome:"completed"}),a.close()}catch{p.lastTurnOutcome="interrupted";for(const y of M.nodes.filter(j=>j.runState==="running"))u(M,[{kind:"update_node",id:y.id,patch:{runState:"idle"}}]);try{f({type:"done",outcome:"interrupted"}),a.close()}catch{}}finally{R?.removeEventListener("abort",d),n.delete(c)}},cancel(){_.abort()}});return new Response(L,$)}return{handle:async(c,w)=>{const R=typeof c=="string"?c:c instanceof URL?c.href:c.url,_=new URL(R,e);if(!_.href.startsWith(e+"/api/"))return _.origin!==new URL(e).origin||/\/api\//.test(_.pathname)?g({error:Y},403):t(c,w);const d=_.pathname.slice(new URL(e).pathname.length),p=w?.method??(c instanceof Request?c.method:"GET"),S=w?.body?JSON.parse(String(w.body)):{};if(d==="/api/settings"){if(p!=="GET"){if(S.provider?.apiKey||S.computerUse)return g({error:Y},403);Object.assign(o.settings,{...S,appearance:"light",computerUse:!1})}return g(o.settings)}if(/^\/api\/settings\/providers\/.+\/models$/.test(d))return g({models:o.settings.providers[0].models});if(d==="/api/sessions")return p!=="GET"?g({error:Y},403):g({sessions:o.sessions.map(({messages:O,...h})=>({...h,listMessageCount:O.length}))});const k=d.match(/^\/api\/sessions\/([^/]+)(?:\/(.+))?$/);if(k){const O=o.sessions.find(b=>b.id===k[1]);if(!O)return g({error:"示例任务不存在"},404);const h=k[2];return h==="interactions"?g({interactions:[]}):h==="artifacts"?g({artifacts:[]}):h==="stream/resume"?new Response(JSON.stringify({type:"done",outcome:"completed"})+`
`,$):h==="messages"&&p==="POST"&&V[O.id]?x(O.id,String(S.text??""),w?.signal):h==="stop"&&p==="POST"?(n.get(O.id)?.abort(),g({ok:!0})):h||p!=="GET"?g({error:Y},403):g({session:O})}if(d==="/api/projects")return g({projects:[]});if(d==="/api/skills")return g({skills:[]});if(d==="/api/artifacts")return g({artifacts:[]});if(d==="/api/memory/events")return g({events:[]});if(d==="/api/schedules")return g({schedules:[],presets:[]});if(d==="/api/schedules/thoughts")return g({thoughts:[]});if(d==="/api/providers/catalog")return g({providers:[],defaultIds:{},defaults:{}});if(d==="/api/canvas/assets/library")return g({assets:[],items:[],nextCursor:null});const M=d.match(/^\/api\/canvas\/([^/]+)(?:\/(.+))?$/);if(M){const O=M[1],h=M[2],b=o.canvases[O];if(!b)return g({error:"示例画布不存在"},404);if(!h&&p==="GET")return g(b);if(h==="stream"){let f;const P=i.get(O)??new Set;i.set(O,P);const q=new ReadableStream({start(N){f=N,P.add(N),N.enqueue(s({v:2,kind:"heartbeat",canvasId:O,epoch:"showcase",revision:b.canvas.liveRevision}))},cancel(){f&&P.delete(f)}});return new Response(q,{headers:{"content-type":"application/x-ndjson"}})}if(h==="selection")return g({ok:!0});if(h==="jobs")return g({jobs:[],nextCursor:null});if(h==="deliveries")return g({deliveries:[]});if(h==="edits"&&p==="POST")return S.uploads?.length?g({error:Y},403):(u(b,S.edits??[],new Headers(w?.headers).get("Idempotency-Key")??void 0),g({snapshot:b}));const L=h?.match(/^nodes\/([^/]+)$/);if(L&&p==="PATCH")return u(b,[{kind:"update_node",id:L[1],patch:S}]),g({node:b.nodes.find(f=>f.id===L[1])});if(L&&p==="DELETE")return u(b,[{kind:"delete_node",id:L[1]}]),g({ok:!0});if(h==="nodes"&&p==="POST"){const f=S.id??crypto.randomUUID();return u(b,[{kind:"add_node",id:f,node:{x:0,y:0,...S}}]),g({node:b.nodes.find(P=>P.id===f)})}const a=h?.match(/^edges\/([^/]+)$/);if(a&&p==="DELETE")return u(b,[{kind:"delete_edge",id:a[1]}]),g({ok:!0});if(h==="edges"&&p==="POST"){const f={id:crypto.randomUUID(),sourceHandle:null,targetHandle:null,...S};return u(b,[{kind:"add_edge",edge:f}]),g({edge:{...f,canvasId:O}})}}return g({error:Y},403)},data:o,replays:V,setReplayActivity:c=>{r=c}}}function tt(){const e=window.location.origin+"/reizo/experience/".replace(/\/$/,""),t=et(e,window.fetch.bind(window));window.fetch=t.handle;function o(){const i=new Map;return{get length(){return i.size},key:s=>[...i.keys()][s]??null,getItem:s=>i.get(s)??null,setItem:(s,m)=>{i.set(s,String(m))},removeItem:s=>{i.delete(s)},clear:()=>i.clear()}}Object.defineProperty(window,"localStorage",{value:o()}),Object.defineProperty(window,"sessionStorage",{value:o()});const n=async()=>{throw new Error(Y)},r={getApiOrigin:async()=>e,platform:"web",listWorkspace:async()=>[],flattenWorkspace:async()=>[],readWorkspaceFile:n,pickFolder:async()=>null,windowIsMaximized:async()=>!1,windowMinimize:async()=>{},windowClose:async()=>{},windowToggleMaximize:async()=>!1,runCommand:n,readDroppedFile:n,getPathForFile:()=>"",revealInFolder:n,deleteWorkspacePath:n,createWorkspaceEntry:n,gitStatus:async()=>({available:!1,branch:null,dirty:!1,porcelain:"",recent:""}),installSkill:n,uninstallSkill:n,searchSkillHub:async()=>({items:[],total:0}),installSkillHubSkill:n,previewSkillHubSkill:n,exportPdf:n};return window.reizo=r,t}var Ee={exports:{}},l={};/**
 * @license React
 * react.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var se=Symbol.for("react.transitional.element"),nt=Symbol.for("react.portal"),ot=Symbol.for("react.fragment"),rt=Symbol.for("react.strict_mode"),st=Symbol.for("react.profiler"),it=Symbol.for("react.consumer"),at=Symbol.for("react.context"),ct=Symbol.for("react.forward_ref"),ut=Symbol.for("react.suspense"),dt=Symbol.for("react.memo"),Se=Symbol.for("react.lazy"),lt=Symbol.for("react.activity"),ge=Symbol.iterator;function pt(e){return e===null||typeof e!="object"?null:(e=ge&&e[ge]||e["@@iterator"],typeof e=="function"?e:null)}var Te={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},be=Object.assign,Re={};function F(e,t,o){this.props=e,this.context=t,this.refs=Re,this.updater=o||Te}F.prototype.isReactComponent={};F.prototype.setState=function(e,t){if(typeof e!="object"&&typeof e!="function"&&e!=null)throw Error("takes an object of state variables to update or a function which returns an object of state variables.");this.updater.enqueueSetState(this,e,t,"setState")};F.prototype.forceUpdate=function(e){this.updater.enqueueForceUpdate(this,e,"forceUpdate")};function Oe(){}Oe.prototype=F.prototype;function ie(e,t,o){this.props=e,this.context=t,this.refs=Re,this.updater=o||Te}var ae=ie.prototype=new Oe;ae.constructor=ie;be(ae,F.prototype);ae.isPureReactComponent=!0;var ye=Array.isArray;function ne(){}var v={H:null,A:null,T:null,S:null},Pe=Object.prototype.hasOwnProperty;function ce(e,t,o){var n=o.ref;return{$$typeof:se,type:e,key:t,ref:n!==void 0?n:null,props:o}}function ft(e,t){return ce(e.type,t,e.props)}function ue(e){return typeof e=="object"&&e!==null&&e.$$typeof===se}function mt(e){var t={"=":"=0",":":"=2"};return"$"+e.replace(/[=:]/g,function(o){return t[o]})}var he=/\/+/g;function te(e,t){return typeof e=="object"&&e!==null&&e.key!=null?mt(""+e.key):t.toString(36)}function gt(e){switch(e.status){case"fulfilled":return e.value;case"rejected":throw e.reason;default:switch(typeof e.status=="string"?e.then(ne,ne):(e.status="pending",e.then(function(t){e.status==="pending"&&(e.status="fulfilled",e.value=t)},function(t){e.status==="pending"&&(e.status="rejected",e.reason=t)})),e.status){case"fulfilled":return e.value;case"rejected":throw e.reason}}throw e}function G(e,t,o,n,r){var i=typeof e;(i==="undefined"||i==="boolean")&&(e=null);var s=!1;if(e===null)s=!0;else switch(i){case"bigint":case"string":case"number":s=!0;break;case"object":switch(e.$$typeof){case se:case nt:s=!0;break;case Se:return s=e._init,G(s(e._payload),t,o,n,r)}}if(s)return r=r(e),s=n===""?"."+te(e,0):n,ye(r)?(o="",s!=null&&(o=s.replace(he,"$&/")+"/"),G(r,t,o,"",function(E){return E})):r!=null&&(ue(r)&&(r=ft(r,o+(r.key==null||e&&e.key===r.key?"":(""+r.key).replace(he,"$&/")+"/")+s)),t.push(r)),1;s=0;var m=n===""?".":n+":";if(ye(e))for(var u=0;u<e.length;u++)n=e[u],i=m+te(n,u),s+=G(n,t,o,i,r);else if(u=pt(e),typeof u=="function")for(e=u.call(e),u=0;!(n=e.next()).done;)n=n.value,i=m+te(n,u++),s+=G(n,t,o,i,r);else if(i==="object"){if(typeof e.then=="function")return G(gt(e),t,o,n,r);throw t=String(e),Error("Objects are not valid as a React child (found: "+(t==="[object Object]"?"object with keys {"+Object.keys(e).join(", ")+"}":t)+"). If you meant to render a collection of children, use an array instead.")}return s}function Q(e,t,o){if(e==null)return e;var n=[],r=0;return G(e,n,"","",function(i){return t.call(o,i,r++)}),n}function yt(e){if(e._status===-1){var t=e._result;t=t(),t.then(function(o){(e._status===0||e._status===-1)&&(e._status=1,e._result=o)},function(o){(e._status===0||e._status===-1)&&(e._status=2,e._result=o)}),e._status===-1&&(e._status=0,e._result=t)}if(e._status===1)return e._result.default;throw e._result}var ve=typeof reportError=="function"?reportError:function(e){if(typeof window=="object"&&typeof window.ErrorEvent=="function"){var t=new window.ErrorEvent("error",{bubbles:!0,cancelable:!0,message:typeof e=="object"&&e!==null&&typeof e.message=="string"?String(e.message):String(e),error:e});if(!window.dispatchEvent(t))return}else if(typeof process=="object"&&typeof process.emit=="function"){process.emit("uncaughtException",e);return}console.error(e)},ht={map:Q,forEach:function(e,t,o){Q(e,function(){t.apply(this,arguments)},o)},count:function(e){var t=0;return Q(e,function(){t++}),t},toArray:function(e){return Q(e,function(t){return t})||[]},only:function(e){if(!ue(e))throw Error("React.Children.only expected to receive a single React element child.");return e}};l.Activity=lt;l.Children=ht;l.Component=F;l.Fragment=ot;l.Profiler=st;l.PureComponent=ie;l.StrictMode=rt;l.Suspense=ut;l.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=v;l.__COMPILER_RUNTIME={__proto__:null,c:function(e){return v.H.useMemoCache(e)}};l.cache=function(e){return function(){return e.apply(null,arguments)}};l.cacheSignal=function(){return null};l.cloneElement=function(e,t,o){if(e==null)throw Error("The argument must be a React element, but you passed "+e+".");var n=be({},e.props),r=e.key;if(t!=null)for(i in t.key!==void 0&&(r=""+t.key),t)!Pe.call(t,i)||i==="key"||i==="__self"||i==="__source"||i==="ref"&&t.ref===void 0||(n[i]=t[i]);var i=arguments.length-2;if(i===1)n.children=o;else if(1<i){for(var s=Array(i),m=0;m<i;m++)s[m]=arguments[m+2];n.children=s}return ce(e.type,r,n)};l.createContext=function(e){return e={$$typeof:at,_currentValue:e,_currentValue2:e,_threadCount:0,Provider:null,Consumer:null},e.Provider=e,e.Consumer={$$typeof:it,_context:e},e};l.createElement=function(e,t,o){var n,r={},i=null;if(t!=null)for(n in t.key!==void 0&&(i=""+t.key),t)Pe.call(t,n)&&n!=="key"&&n!=="__self"&&n!=="__source"&&(r[n]=t[n]);var s=arguments.length-2;if(s===1)r.children=o;else if(1<s){for(var m=Array(s),u=0;u<s;u++)m[u]=arguments[u+2];r.children=m}if(e&&e.defaultProps)for(n in s=e.defaultProps,s)r[n]===void 0&&(r[n]=s[n]);return ce(e,i,r)};l.createRef=function(){return{current:null}};l.forwardRef=function(e){return{$$typeof:ct,render:e}};l.isValidElement=ue;l.lazy=function(e){return{$$typeof:Se,_payload:{_status:-1,_result:e},_init:yt}};l.memo=function(e,t){return{$$typeof:dt,type:e,compare:t===void 0?null:t}};l.startTransition=function(e){var t=v.T,o={};v.T=o;try{var n=e(),r=v.S;r!==null&&r(o,n),typeof n=="object"&&n!==null&&typeof n.then=="function"&&n.then(ne,ve)}catch(i){ve(i)}finally{t!==null&&o.types!==null&&(t.types=o.types),v.T=t}};l.unstable_useCacheRefresh=function(){return v.H.useCacheRefresh()};l.use=function(e){return v.H.use(e)};l.useActionState=function(e,t,o){return v.H.useActionState(e,t,o)};l.useCallback=function(e,t){return v.H.useCallback(e,t)};l.useContext=function(e){return v.H.useContext(e)};l.useDebugValue=function(){};l.useDeferredValue=function(e,t){return v.H.useDeferredValue(e,t)};l.useEffect=function(e,t){return v.H.useEffect(e,t)};l.useEffectEvent=function(e){return v.H.useEffectEvent(e)};l.useId=function(){return v.H.useId()};l.useImperativeHandle=function(e,t,o){return v.H.useImperativeHandle(e,t,o)};l.useInsertionEffect=function(e,t){return v.H.useInsertionEffect(e,t)};l.useLayoutEffect=function(e,t){return v.H.useLayoutEffect(e,t)};l.useMemo=function(e,t){return v.H.useMemo(e,t)};l.useOptimistic=function(e,t){return v.H.useOptimistic(e,t)};l.useReducer=function(e,t,o){return v.H.useReducer(e,t,o)};l.useRef=function(e){return v.H.useRef(e)};l.useState=function(e){return v.H.useState(e)};l.useSyncExternalStore=function(e,t,o){return v.H.useSyncExternalStore(e,t,o)};l.useTransition=function(){return v.H.useTransition()};l.version="19.2.8";Ee.exports=l;var de=Ee.exports;const vt=Ce(de),Tt=xe({__proto__:null,default:vt},[de]),wt=de.createContext(!0),W=tt();document.documentElement.classList.remove("dark");document.addEventListener("wheel",e=>{!e.ctrlKey&&e.target?.closest(".react-flow")&&e.stopPropagation()},{capture:!0,passive:!0});const _t=HTMLElement.prototype.focus;let le=!1;document.addEventListener("pointerdown",()=>{le=!0},{capture:!0});document.addEventListener("keydown",()=>{le=!0},{capture:!0});HTMLElement.prototype.focus=function(e){window.parent!==window&&!le||_t.call(this,{...e,preventScroll:!0})};async function Et(){const[{createRoot:e},{default:t},{default:o},n,r,i,s,m,u]=await Promise.all([D(()=>import("./client-QzlOz2Dp.js").then(a=>a.c),__vite__mapDeps([0,1])),D(()=>import("./mermaid-HWGCJPDP-DpXC_hwc.js").then(a=>a.bm),__vite__mapDeps([2,1,3,4,5,6,7,8,9,10])),D(()=>import("./ErrorBoundary-DD_WZ_a2.js").then(a=>a.d),[]),D(()=>import("./settingsStore-DO_CHdsy.js"),__vite__mapDeps([8,7])),D(()=>import("./chatStore-BuQW_C5p.js").then(a=>a.br),__vite__mapDeps([6,7,8,4,3,9])),D(()=>import("./skillStore-Ds8NWC6E.js"),__vite__mapDeps([9,7])),D(()=>import("./projectStore-CqxyAM1Y.js"),__vite__mapDeps([10,7])),D(()=>import("./tabStore-CXf8Zebb.js").then(a=>a.t),[]),D(()=>import("./uiStore-DTrjSdE-.js"),[])]);await Promise.all([n.loadSettings(),r.loadSessions(),i.loadSkills(),s.loadProjects()]);const E=new URLSearchParams(window.location.search);document.documentElement.dataset.experienceView=E.get("view")==="canvas"?"canvas":"workspace";const $=E.get("project")??"commerce",x=r.getSnapshot().sessions.find(a=>a.id===$)??r.getSnapshot().sessions[0];if(window.innerWidth<600)for(const a of W.data.sessions)localStorage.setItem(`reizo:canvas-viewport:${a.id}`,JSON.stringify({x:30,y:-45,zoom:.95}));else for(const a of Object.keys(W.replays)){const f=E.get("view")==="canvas"?window.innerWidth:window.innerWidth*.55,P=Math.min(1,Math.max(.35,Math.min((f-40)/1320,(window.innerHeight-120)/820)));localStorage.setItem(`reizo:canvas-viewport:${a}`,JSON.stringify({x:20,y:20,zoom:P}))}m.openChatTab(x.id,x.title,!0),u.setMode("chat"),u.setSidebarWidth(192),u.setRightPanelTab(E.get("view")==="canvas"||window.innerWidth>=600?"canvas":null),u.setRightPanelWidth(Math.round(window.innerWidth*.55)),u.setSidebarCollapsed(!0),u.setRightPanelMaximized(E.get("view")==="canvas"||window.innerWidth<600),e(document.getElementById("root")).render(X.jsx("div",{className:"landing-sample",children:X.jsx(wt.Provider,{value:!1,children:X.jsx(o,{children:X.jsx(t,{})})})}));let I=!1,c=E.get("view");const w=()=>window.parent.postMessage({type:"reizo-experience-ready"},window.location.origin),R=()=>{const a=m.getSnapshot();return a.tabs.find(f=>f.id===a.activeTabId)?.sessionId},_=()=>{const a=R();a&&W.data.sessions.some(f=>f.id===a)&&window.parent.postMessage({type:"reizo-experience-project",project:a},window.location.origin),I&&k&&O(a)},d=new Set,p=new Set;let S=!1,k=!1;const M=a=>k&&!document.hidden&&!S&&R()===a;W.setReplayActivity(M),document.addEventListener("input",a=>{if(!a.isTrusted||!(a.target instanceof Element)||!a.target.closest('textarea,[contenteditable="true"]'))return;const f=R();f&&p.add(f)},{capture:!0});async function O(a){if(!a||d.has(a)||p.has(a)||!W.replays[a]||!M(a))return;d.add(a);const{prompt:f}=W.replays[a];await r.sendMessage(a,f)}new IntersectionObserver(([a])=>{k=a.isIntersecting,k&&I&&O(R())},{threshold:.35}).observe(document.documentElement),m.subscribe(_);const h=()=>{document.documentElement.dataset.experienceView=c==="canvas"?"canvas":"workspace",u.setRightPanelTab(c==="canvas"||window.innerWidth>=600?"canvas":null),u.setRightPanelWidth(Math.round(window.innerWidth*.55)),c==="canvas"&&u.setSidebarCollapsed(!0),u.setRightPanelMaximized(c==="canvas"||window.innerWidth<600)};window.addEventListener("resize",h),window.addEventListener("message",a=>{if(a.source!==window.parent||a.origin!==window.location.origin)return;if(a.data?.type==="reizo-experience-playback"){S=a.data.paused===!0;return}if(a.data?.type==="reizo-experience-host-ready"){I&&w();return}if(a.data?.type!=="reizo-experience-open-project")return;const f=W.data.sessions.find(q=>q.id===a.data.project);if(!f)return;R()!==f.id&&m.openChatTab(f.id,f.title),u.setMode("chat"),u.setRightPanelTab("canvas"),c=a.data.view==="canvas"?"canvas":null,h(),k&&O(f.id)});const b=document.getElementById("root"),L=new MutationObserver(()=>{(c==="canvas"||window.innerWidth>=600?b.querySelector(".react-flow__node, .react-flow__renderer"):b.querySelector("[data-message-id], textarea"))&&(L.disconnect(),requestAnimationFrame(()=>requestAnimationFrame(()=>{I=!0,w(),_()})))});L.observe(b,{subtree:!0,childList:!0})}Et().catch(e=>{console.error("REIZO experience boot failed",e);const t=document.getElementById("root");t&&(t.textContent="工作台加载失败，请刷新重试。")});export{Tt as $,wt as C,D as _,St as c,Ce as g,X as j,de as r,vt as v};
