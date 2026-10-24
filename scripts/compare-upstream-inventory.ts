import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { classifyModel } from '../src/lib/probe/classify';
async function main() {
 setGlobalDispatcher(new ProxyAgent('http://127.0.0.1:7897'));
 const channels=JSON.parse(readFileSync('relay-inventory.json','utf8')) as Array<{id:number;name:string;baseUrl:string;status:number;models:string[]}>;
 const sites=[['云飞','https://img.yunfei.best'],['卡藏','https://newapi.prompt-hubs.com'],['小安','https://app.22codex.xyz']];
 const results=[];
 for (const [supplier,base] of sites) {
  const res=await fetch(base+'/api/pricing',{signal:AbortSignal.timeout(30000)}); if(!res.ok)throw new Error(`${supplier}: HTTP ${res.status}`);
  const j=await res.json() as {data:any[]}; if(!Array.isArray(j.data))throw new Error('Invalid catalog');
  const unique=[...new Map(j.data.map(r=>[r.model_name,r])).values()];
  const rows=unique.map(r=>{const matches=channels.filter(c=>c.models.includes(r.model_name)); const enabled=matches.filter(c=>c.status===1);return {name:r.model_name,...classifyModel(r),status:enabled.length?'enabled':matches.length?'disabled_only':'absent',sameSupplier:enabled.some(c=>{try{return new URL(c.baseUrl).host===new URL(base).host}catch{return false}}),channels:matches.map(c=>`${c.name}#${c.id}(${c.status===1?'启用':'停用'})`)};});
  results.push({supplier,url:base+'/api/pricing',total:rows.length,rows});
 }
 const output={generatedAt:new Date().toISOString(),relaySnapshotAt:statSync('relay-inventory.json').mtime.toISOString(),matchRule:'Exact model name; aliases/model_mapping not included. Configured does not prove callable.',results};
 writeFileSync('upstream-gap-report.json',JSON.stringify(output,null,2),'utf8');
 const md=['# 三家上游与 new-api 模型差集','',`上游采集时间：${output.generatedAt}；new-api 渠道快照：${output.relaySnapshotAt}。`,'','按原始模型名精确比较；未检查 model_mapping 别名，配置存在不代表已实测可调用。供应商公开目录也不保证当前账号权限。',''];
 for(const s of results){md.push(`## ${s.supplier}`, '', `来源：${s.url}`, '');for(const status of ['absent','disabled_only','enabled']){md.push(`### ${{absent:'未在渠道清单配置',disabled_only:'仅停用渠道配置',enabled:'已有启用渠道'}[status]}`,'','| 模型 | 类别 | 渠道 |','|---|---|---|');for(const r of s.rows.filter(r=>r.status===status))md.push(`| ${r.name} | ${r.category} | ${r.channels.join('、')||'—'} |`);md.push('');}}
 writeFileSync('upstream-gap-report.md',md.join('\n'),'utf8');
 for(const s of results){console.log('\n'+s.supplier+' total '+s.total);for(const status of ['absent','disabled_only','enabled']) {const rows=s.rows.filter(r=>r.status===status);console.log(status,rows.length);console.log(rows.filter(r=>['image','video','audio'].includes(r.category)).map(r=>`${r.name} [${r.category}]`).join('\n'));}console.log('media already connected elsewhere:',s.rows.filter(r=>r.status==='enabled'&&!r.sameSupplier&&['image','video','audio'].includes(r.category)).map(r=>r.name).join(', '));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
