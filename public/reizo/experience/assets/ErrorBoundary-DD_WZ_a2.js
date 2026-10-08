import{r as a,j as r}from"./index-vJjLdg73.js";/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const u=(...s)=>s.filter((e,t,o)=>!!e&&e.trim()!==""&&o.indexOf(e)===t).join(" ").trim();/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=s=>s.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase();/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const C=s=>s.replace(/^([A-Z])|[\s-_]+(\w)/g,(e,t,o)=>o?o.toUpperCase():t.toLowerCase());/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const x=s=>{const e=C(s);return e.charAt(0).toUpperCase()+e.slice(1)};/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var d={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const N=s=>{for(const e in s)if(e.startsWith("aria-")||e==="role"||e==="title")return!0;return!1},S=a.createContext({}),E=()=>a.useContext(S),_=a.forwardRef(({color:s,size:e,strokeWidth:t,absoluteStrokeWidth:o,className:c="",children:n,iconNode:m,...h},k)=>{const{size:l=24,strokeWidth:p=2,absoluteStrokeWidth:y=!1,color:f="currentColor",className:g=""}=E()??{},b=o??y?Number(t??p)*24/Number(e??l):t??p;return a.createElement("svg",{ref:k,...d,width:e??l??d.width,height:e??l??d.height,stroke:s??f,strokeWidth:b,className:u("lucide",g,c),...!n&&!N(h)&&{"aria-hidden":"true"},...h},[...m.map(([v,w])=>a.createElement(v,w)),...Array.isArray(n)?n:[n]])});/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const i=(s,e)=>{const t=a.forwardRef(({className:o,...c},n)=>a.createElement(_,{ref:n,iconNode:e,className:u(`lucide-${j(x(s))}`,`lucide-${s}`,o),...c}));return t.displayName=x(s),t};/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const M=[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]],$=i("check",M);/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const z=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["line",{x1:"12",x2:"12",y1:"8",y2:"12",key:"1pkeuh"}],["line",{x1:"12",x2:"12.01",y1:"16",y2:"16",key:"4dfq90"}]],R=i("circle-alert",z);/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const W=[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2",key:"17jyea"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",key:"zix9uf"}]],A=i("copy",W);/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const L=[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]],T=i("refresh-cw",L);/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const B=[["path",{d:"M10 11v6",key:"nco0om"}],["path",{d:"M14 11v6",key:"outv1u"}],["path",{d:"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",key:"miytrc"}],["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",key:"e791ji"}]],I=i("trash-2",B);class O extends a.Component{constructor(e){super(e),this.state={hasError:!1,error:null,errorInfo:null,copied:!1}}static getDerivedStateFromError(e){return{hasError:!0,error:e}}componentDidCatch(e,t){console.error("[ErrorBoundary caught error]",e,t),this.setState({errorInfo:t})}handleReload=()=>{window.location.reload()};handleResetStorage=()=>{try{const e=[];for(let t=0;t<localStorage.length;t++){const o=localStorage.key(t);o&&(o.startsWith("reizo:canvas")||o.startsWith("reizo:right-panel")||o.startsWith("reizo:sidebar-mode"))&&e.push(o)}e.forEach(t=>localStorage.removeItem(t))}catch{}window.location.reload()};handleCopy=async()=>{const e=[`Error: ${this.state.error?.message??"Unknown error"}`,`Stack: ${this.state.error?.stack??""}`,`ComponentStack: ${this.state.errorInfo?.componentStack??""}`].join(`

`);try{await navigator.clipboard.writeText(e),this.setState({copied:!0}),setTimeout(()=>this.setState({copied:!1}),2e3)}catch{}};render(){if(this.state.hasError){if(this.props.fallback)return this.props.fallback;const e=this.state.error?.message||"未知渲染错误",t=this.state.error?.stack||this.state.errorInfo?.componentStack||"";return r.jsx("div",{className:"flex h-screen w-screen items-center justify-center bg-paper p-6 text-ink select-none",children:r.jsxs("div",{className:"w-full max-w-xl rounded-2xl border border-line bg-paper-raised p-6 shadow-2xl",children:[r.jsxs("div",{className:"flex items-center gap-3 text-danger",children:[r.jsx("div",{className:"flex h-10 w-10 items-center justify-center rounded-xl bg-danger/10",children:r.jsx(R,{size:22})}),r.jsxs("div",{children:[r.jsx("h2",{className:"text-base font-semibold text-ink",children:"界面组件渲染异常"}),r.jsx("p",{className:"text-xs text-ink-muted",children:"已捕获未处理的运行时错误，保护应用未完全崩溃"})]})]}),r.jsxs("div",{className:"mt-4 rounded-xl border border-line/80 bg-paper-inset/50 p-3 font-mono text-xs text-ink",children:[r.jsx("p",{className:"font-semibold text-danger break-words",children:e}),t?r.jsx("pre",{className:"mt-2 max-h-48 overflow-auto text-[11px] leading-relaxed text-ink-muted whitespace-pre-wrap",children:t}):null]}),r.jsxs("div",{className:"mt-5 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-line",children:[r.jsxs("div",{className:"flex items-center gap-2",children:[r.jsxs("button",{type:"button",onClick:this.handleReload,className:"inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink hover:opacity-90 active:scale-95 transition-all",children:[r.jsx(T,{size:13}),"刷新界面"]}),r.jsxs("button",{type:"button",onClick:this.handleResetStorage,className:"inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper-raised px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-paper-inset hover:text-ink active:scale-95 transition-all",title:"清理画布本地缓存并刷新（解决脏数据导致的渲染崩溃）",children:[r.jsx(I,{size:13}),"重置画布缓存"]})]}),r.jsxs("button",{type:"button",onClick:()=>void this.handleCopy(),className:"inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-ink-muted hover:bg-paper-inset hover:text-ink transition-colors",children:[this.state.copied?r.jsx($,{size:13,className:"text-success"}):r.jsx(A,{size:13}),this.state.copied?"已复制":"复制报错详情"]})]})]})})}return this.props.children}}const U=Object.freeze(Object.defineProperty({__proto__:null,default:O},Symbol.toStringTag,{value:"Module"}));export{$ as C,O as E,T as R,I as T,R as a,A as b,i as c,U as d};
