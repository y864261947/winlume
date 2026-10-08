import{r as c,j as t}from"./index-DCFvn9vp.js";import{y as S,T as h,p as b,a as O,z as K,F as _,I as H,b as $}from"./mermaid-HWGCJPDP-DBqIxXlx.js";import{u as A,A as q,F as V,i as G,a as J}from"./ArtifactPreview-D1VJgmD3.js";import{s as T,t as Q,v as W,w as X}from"./api-CUlua-r3.js";import{l as u,t as j}from"./chatStore-BuQW_C5p.js";import{c as Y,R as Z,T as I}from"./ErrorBoundary-D5cXN-za.js";import{U as ee,S as z}from"./upload-5Xl1nFib.js";import"./index-D7IVMJ4h.js";import"./uiStore-DTrjSdE-.js";import"./tabStore-CXf8Zebb.js";import"./skillStore-Ds8NWC6E.js";import"./settingsStore-DO_CHdsy.js";import"./projectStore-CqxyAM1Y.js";import"./zoom-out-Ckd1VjkJ.js";import"./share-2-Cwvr32or.js";import"./download-lGt09fyB.js";/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const te=[["path",{d:"M11.35 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v5.35",key:"17jvcc"}],["path",{d:"M14 2v5a1 1 0 0 0 1 1h5",key:"wfsgrz"}],["path",{d:"M14 19h6",key:"bvotb8"}],["path",{d:"M17 16v6",key:"18yu1i"}]],ne=Y("file-plus-corner",te),L=[{id:"blank",label:"空白文档",fileName:"文档.md",body:`# 标题

`},{id:"image-brief",label:"图片需求",fileName:"图片需求.md",body:`# 图片需求

## 目标
（这张图要用在哪里、传达什么）

## 规格
- 主体：
- 画幅 / 比例：
- 构图：
- 视觉风格：
- 品牌色 / 关键色：
- 参考图 / 参考风格：
- 负向约束（不要出现什么）：
`},{id:"video-storyboard",label:"视频分镜",fileName:"视频分镜.md",body:`# 视频分镜

## 目标
（时长、平台、核心信息）

## 分镜表
| # | 画面 | 时长 | 字幕 / 旁白 | 运动 | 素材 | 音频 |
|---|------|------|-------------|------|------|------|
| 1 |      |      |             |      |      |      |

## 输出
- 分辨率 / 帧率：
- 交付格式：
`},{id:"spec",label:"方案 / 需求",fileName:"方案.md",body:`# 方案

## 目标
（要解决的问题，成功的样子）

## 背景与约束

## 方案

## 里程碑
- [ ]

## 风险与未决问题
`},{id:"landing",label:"落地页文案",fileName:"落地页文案.md",body:`# 落地页文案

## 目标受众与场景

## 结构
- Hero 主标题：
- 副标题：
- 主 CTA：
- 卖点 1 / 2 / 3：
- 社会证明：
- 次 CTA：

## 语气 / 风格
`}],se={markdown:"Markdown",html:"HTML",text:"文本",json:"JSON",image:"图片",binary:"二进制",svg:"SVG",diagram:"图表",code:"代码",video:"视频",audio:"音频",sketch:"手绘",sheet:"表格"},ae={attachment:"附件",generated:"生成",manual:"手动"};function ie({kind:n}){const s="h-3.5 w-3.5 shrink-0 text-accent";return n==="json"?t.jsx(V,{className:s}):n==="html"?t.jsx(_,{className:s}):n==="image"?t.jsx(H,{className:s}):t.jsx($,{className:s})}function re(n){try{return new Date(n).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})}catch{return n}}const le=()=>{},F=()=>null;function ce(n){const s=G(n.name,n.type||void 0);return new Promise((x,o)=>{const r=new FileReader;r.onerror=()=>o(r.error),r.onload=()=>x({content:String(r.result??""),mimeType:n.type||"",kind:s}),J(s)?r.readAsDataURL(n):r.readAsText(n)})}function Ce({sessionId:n}){const s=A(e=>e.bySession[n])??[],x=A(e=>e.loadingBySession[n])??!1,[o,r]=c.useState(null),[y,g]=c.useState(!1),[D,E]=c.useState(!1),[m,p]=c.useState(new Set),[M,k]=c.useState(!1),v=c.useRef(null);async function R(e){k(!1);const a=L.find(l=>l.id===e);if(!a)return;const i=await T(n,{name:a.fileName,content:a.body,kind:"markdown",source:"manual"}).catch(F);await u(n),i&&(r(i.id),j.success(`已创建「${a.fileName}」`))}c.useEffect(()=>{u(n)},[n]),c.useEffect(()=>{o&&!s.some(e=>e.id===o)&&r(null),p(e=>{const a=new Set([...e].filter(i=>s.some(l=>l.id===i)));return a.size===e.size?e:a})},[s,o]);const w=c.useMemo(()=>s.find(e=>e.id===o)??null,[s,o]);async function N(e){const a=Array.from(e);a.length!==0&&(await Promise.all(a.map(async i=>{try{const{content:l,mimeType:d,kind:B}=await ce(i);await T(n,{name:i.name,content:l,mimeType:d||void 0,kind:B,source:"attachment"})}catch{}})),await u(n),j.success(`已上传 ${a.length} 个作品`))}function C(e){p(a=>{const i=new Set(a);return i.has(e)?i.delete(e):i.add(e),i})}async function P(){const e=[...m];e.length!==0&&(await Promise.all(e.map(a=>Q(a).catch(le))),p(new Set),await u(n),j.success(`已删除 ${e.length} 个作品`))}async function U(){for(const e of m){const a=await W(e).catch(F),i=s.find(d=>d.id===e);if(!a||!i)continue;const l=document.createElement("a");if(a.rawUrl)l.href=await X(e,i.version);else{const d=new Blob([a.content],{type:i.mimeType||"text/plain"});l.href=URL.createObjectURL(d)}l.download=i.name,l.click(),await new Promise(d=>setTimeout(d,120))}}const f=m.size>0||D;return t.jsxs("div",{className:b("relative flex h-full min-h-0 flex-col",y&&"ring-2 ring-accent ring-inset"),onDragOver:e=>{e.preventDefault(),g(!0)},onDragLeave:()=>g(!1),onDrop:e=>{e.preventDefault(),g(!1),e.dataTransfer?.files?.length&&N(e.dataTransfer.files)},children:[t.jsx("input",{ref:v,type:"file",multiple:!0,hidden:!0,onChange:e=>{e.target.files&&N(e.target.files),e.target.value=""}}),t.jsxs("div",{className:"flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2.5",children:[t.jsxs("h2",{className:"flex min-w-0 items-center gap-1.5 text-xs font-semibold",children:[t.jsx(S,{className:"h-3.5 w-3.5 shrink-0 text-accent"}),t.jsx("span",{className:"truncate",children:"本会话作品"}),s.length>0&&t.jsx("span",{className:"rounded-full bg-paper-inset px-1.5 text-[10px] font-medium tabular-nums",children:s.length})]}),t.jsxs("div",{className:"relative flex items-center gap-0.5",children:[t.jsx(h,{content:"新建文档",children:t.jsx("button",{type:"button",onClick:()=>k(e=>!e),className:"inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-paper-inset hover:text-ink transition-colors",children:t.jsx(ne,{className:"h-3.5 w-3.5"})})}),M&&t.jsx("div",{className:"absolute right-0 top-8 z-20 w-36 rounded-lg border border-line bg-paper-raised py-1 shadow-lg",children:L.map(e=>t.jsx("button",{type:"button",onClick:()=>void R(e.id),className:"block w-full px-3 py-1.5 text-left text-[11px] hover:bg-paper-inset",children:e.label},e.id))}),t.jsx(h,{content:"上传文件",children:t.jsx("button",{type:"button",onClick:()=>v.current?.click(),className:"inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-paper-inset hover:text-ink transition-colors",children:t.jsx(ee,{className:"h-3.5 w-3.5"})})}),t.jsx(h,{content:"多选模式",children:t.jsx("button",{type:"button",onClick:()=>E(e=>!e),className:b("inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-paper-inset hover:text-ink transition-colors",f?"text-accent":"text-ink-muted"),children:t.jsx(z,{className:"h-3.5 w-3.5"})})}),t.jsx(h,{content:"刷新列表",children:t.jsx("button",{type:"button",onClick:()=>void u(n),disabled:x,className:"inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-paper-inset hover:text-ink disabled:opacity-50 transition-colors",children:t.jsx(Z,{className:b("h-3.5 w-3.5",x&&"animate-spin")})})})]})]}),m.size>0&&t.jsxs("div",{className:"flex shrink-0 items-center gap-2 border-b border-line bg-paper-inset/40 px-3 py-1.5 text-[11px]",children:[t.jsxs("span",{className:"text-ink-muted",children:["已选 ",m.size]}),t.jsx("button",{type:"button",onClick:()=>void U(),className:"rounded px-1.5 py-0.5 hover:bg-paper-inset",children:"下载"}),t.jsxs("button",{type:"button",onClick:()=>void P(),className:"inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-red-500 hover:bg-red-500/10",children:[t.jsx(I,{size:11})," 删除"]}),t.jsx("button",{type:"button",onClick:()=>p(new Set),className:"ml-auto rounded px-1.5 py-0.5 hover:bg-paper-inset",children:"清除"})]}),t.jsx("div",{className:"min-h-0 flex-1 overflow-y-auto",children:x&&s.length===0?t.jsxs("div",{className:"flex items-center gap-2 px-3 py-6 text-xs text-ink-muted",children:[t.jsx(O,{variant:"spinner",size:14}),"加载中…"]}):s.length===0?t.jsxs("div",{className:"px-3 py-8 text-center",children:[t.jsx(S,{className:"mx-auto h-6 w-6 text-ink-muted/50"}),t.jsx("p",{className:"mt-2 text-xs text-ink-muted",children:"暂无作品"}),t.jsx("p",{className:"mt-1 text-[11px] leading-4 text-ink-muted",children:"拖文件到这里 · 图片、文档、参考；Agent 写入的文件也会出现在这里"})]}):t.jsx("ul",{className:"flex flex-col p-2",children:s.map(e=>t.jsxs("li",{className:"flex items-stretch gap-1",children:[f&&t.jsx("button",{type:"button",onClick:()=>C(e.id),className:"flex shrink-0 items-center px-1 text-ink-muted hover:text-ink","aria-label":"选择",children:m.has(e.id)?t.jsx(z,{size:13,className:"text-accent"}):t.jsx(K,{size:13})}),t.jsxs("button",{type:"button",onClick:()=>f?C(e.id):r(e.id),className:b("flex w-full items-start gap-2 rounded-xl px-2.5 py-2.5 text-left hover:bg-paper-inset/70",o===e.id&&"bg-paper-inset"),children:[t.jsx(ie,{kind:e.kind}),t.jsxs("span",{className:"min-w-0 flex-1",children:[t.jsxs("span",{className:"flex items-center gap-1.5 truncate text-xs font-medium",children:[t.jsx("span",{className:"truncate",children:e.name}),e.versionCount>1&&t.jsxs("span",{className:"shrink-0 rounded bg-paper-inset px-1 text-[9px] font-medium tabular-nums text-ink-muted",children:["v",e.version]})]}),t.jsxs("span",{className:"mt-0.5 block truncate font-mono text-[10px] text-ink-muted",children:[se[e.kind]," · ",ae[e.source]??e.source," · ",re(e.createdAt)]})]})]})]},e.id))})}),y&&t.jsx("div",{className:"pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-paper/70",children:t.jsx("span",{className:"rounded-lg border border-dashed border-accent px-4 py-2 text-xs text-accent",children:"松开以上传"})}),w&&!f?t.jsx("div",{className:"flex max-h-[55%] min-h-[140px] shrink-0 flex-col border-t border-line",children:t.jsx(q,{artifact:w,onClose:()=>r(null)})}):null]})}export{Ce as default};
