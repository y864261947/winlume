import fs from 'node:fs/promises';
import path from 'node:path';
import {documents,sheets,decks} from './showcase-content.mjs';
const out=path.resolve('public/reizo/deliverables');
const manifest=JSON.parse(await fs.readFile(path.join(out,'manifest.json'),'utf8'));
const url=n=>'/reizo/deliverables/'+n;
manifest['website-0']={href:url('winery.html'),detail:'响应式 HTML · 本地预约演示'};
manifest['website-2']={href:url('WineCollection.tsx'),body:await fs.readFile(path.join(out,'WineCollection.tsx'),'utf8'),detail:'完整 React 组件 · TypeScript'};
const series=[{label:'自然搜索',color:'#4880AD',values:[120,150,180,210,270,320]},{label:'内容渠道',color:'#43846B',values:[80,110,100,160,190,230]},{label:'直接访问',color:'#AE82AE',values:[60,70,90,100,120,140]}];
const chart=`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="650" viewBox="0 0 1000 650"><rect width="1000" height="650" fill="#FAFBF8"/><g font-family="Microsoft YaHei,Arial,sans-serif" fill="#203D35"><text x="70" y="70" font-size="29" font-weight="600">2026 年上半年有效线索</text><text x="70" y="105" font-size="16" fill="#6D8176">单位：条  /  人工构造的演示数据</text><text x="750" y="77" font-size="42">690</text><text x="750" y="108" font-size="14" fill="#6D8176">6月三个渠道合计</text>${[0,100,200,300,400].map(v=>`<line x1="90" y1="${480-v*.75}" x2="930" y2="${480-v*.75}" stroke="#DCE4DE"/><text x="45" y="${485-v*.75}" font-size="14">${v}</text>`).join('')}${series.map(s=>`<polyline fill="none" stroke="${s.color}" stroke-width="4" points="${s.values.map((v,i)=>`${110+i*158},${480-v*.75}`).join(' ')}"/>${s.values.map((v,i)=>`<circle cx="${110+i*158}" cy="${480-v*.75}" r="5" fill="${s.color}"/>`).join('')}`).join('')}${[1,2,3,4,5,6].map((m,i)=>`<text x="${110+i*158}" y="514" font-size="15" text-anchor="middle">${m}月</text>`).join('')}${series.map((s,i)=>`<circle cx="${260+i*220}" cy="553" r="5" fill="${s.color}"/><text x="${276+i*220}" y="558" font-size="15">${s.label}</text>`).join('')}<text x="70" y="610" font-size="16">自然搜索贡献 46.5% 的净增线索。未纳入成本和成交率，不推断投资回报。</text></g></svg>`;
await fs.writeFile(path.join(out,'channel-growth.svg'),chart);
manifest['research-0']={href:url('channel-growth.svg'),detail:'可缩放 SVG · 与 Excel 同一组数据'};
for(const id of ['legal-0','office-0']) {
  const pages=(await fs.readdir(out)).filter(n=>new RegExp(`^${id}-\\d+\\.png$`).test(n)).sort();
  if(!pages.length)throw new Error(`Missing rendered document pages: ${id}`);
  manifest[id].pages=pages.map(url);manifest[id].detail=`${pages.length} 页 · 可编辑 Word 文档`;
}
for(const item of Object.values(manifest)) {
  item.bytes=(await fs.stat(path.resolve('public',item.href.slice(1)))).size;
  if(item.pages)for(const p of item.pages)await fs.access(path.resolve('public',p.slice(1)));
}
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
await fs.writeFile('src/components/reizo/showcase-deliverables.json',JSON.stringify(manifest,null,2));
const labels={...Object.fromEntries(Object.entries({...documents,...sheets,...decks}).map(([id,v])=>[id,v.name])),'design-0':'春夏系列视觉.zip','video-0':'日常鞋履产品图.jpg','video-2':'日常鞋履短片.mp4','website-0':'山麓酒庄.html','website-2':'WineCollection.tsx','research-0':'渠道增长图表.svg'};
const groups={design:'电商销售',video:'视觉媒体',marketing:'内容营销',website:'代码开发',legal:'法务财务',product:'产品研发',office:'办公管理',research:'数据科研'};
const index=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>REIZO 本地成果文件</title><style>body{max-width:1000px;margin:60px auto;padding:0 24px;font:16px/1.8 system-ui;background:#f7f8f4;color:#203d35}a{color:#386e90}li{padding:5px}h2{font-size:20px;margin-top:35px}</style><h1>REIZO 首页成果样例</h1><p>真实可打开的本地文件。所有业务案例与数据均为虚构演示，不调用模型，不产生费用。</p>${Object.entries(groups).map(([id,title])=>`<h2>${title}</h2><ul>${[0,1,2].map(i=>{const key=id+'-'+i,v=manifest[key],href=v.href.replace('/reizo/deliverables/','./').replace('/reizo/showcase/','../showcase/');return `<li><a href="${href}" download="${labels[key]}">${labels[key]}</a> · ${v.detail||'完整内容文件'}</li>`;}).join('')}</ul>`).join('')}`;
await fs.writeFile(path.join(out,'index.html'),index);
console.log(`Verified ${Object.keys(manifest).length} downloadable deliverables and all previews.`);
