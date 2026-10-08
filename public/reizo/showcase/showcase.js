/* Static, authored examples only. No authentication, task API, uploads or model calls. */
const product = '/studio/tools/background-removal/product-before.jpg';
const poster = '/tool-covers/poster.webp';
const cover = '<div class="doc-cover"><span>新品发布 / 创意提案</span><strong>让日常<br>轻一步。</strong><span>内容策略与执行方案</span><i></i><i></i></div>';
const report = `<article class="report"><small>REIZO / 新品发布提案 · 示例文档</small><h3>让日常轻一步。<br>生活方式鞋履发布方案</h3><p>围绕白色日常鞋，将产品细节、自然光场景与轻松的生活节奏连接起来。以一支短片、一组场景图和清晰的发布节奏，形成完整的内容组合。</p><div class="report-grid"><div><strong>12 秒</strong>短片时长</div><div><strong>3 阶段</strong>内容推进</div><div><strong>7 天</strong>示例发布周期</div></div><hr class="report-rule"><h4>01 / 创意方向</h4><p>主张：从忙碌里，走回自己的节奏。镜头以自然光、木质纹理和产品近景建立松弛感。文案保持简短，不使用未经验证的舒适度或性能承诺。</p><h4>02 / 短片分镜</h4><table><thead><tr><th>时段</th><th>画面</th><th>字幕</th></tr></thead><tbody><tr><td>0–4 秒</td><td>自然光下的完整产品</td><td>Make room for everyday.</td></tr><tr><td>4–8 秒</td><td>缓慢推进，观察鞋面细节</td><td>A little closer.</td></tr><tr><td>8–12 秒</td><td>镜头舒展，落到完整场景</td><td>Take it easy.</td></tr></tbody></table><h4>03 / 发布与复盘</h4><p>第 1–2 天：发布场景图，介绍创意主题。第 3–5 天：上线短片，围绕画面与使用场景展开交流。第 6–7 天：汇总完播率、收藏和有效反馈，调整下一轮素材。</p><p>交付检查：确认素材使用权、画面清晰度、移动端字幕安全区及落地页链接。预算和转化目标应依据实际业务数据另行制定。</p><hr class="report-rule"><p>本文为产品展示而编写，时间安排与内容策略均为示例，不代表真实客户项目或实际投放效果。</p></article>`;
const assets = [
  {id:'film',title:'日常轻一步 · 产品短片',meta:'MP4 · 12 秒 · 1280 × 720',type:'video',src:'everyday-film.mp4',poster:'film-poster.jpg'},
  {id:'product',title:'自然光产品场景',meta:'JPG · 1024 × 1024',type:'image',src:product},
  {id:'poster',title:'生活方式海报场景',meta:'WEBP · 品牌视觉',type:'image',src:poster},
  {id:'report',title:'新品发布与内容方案',meta:'文档 · 3 个章节 · 可下载',type:'document',src:'launch-plan.md'},
];
const tasks = {
  video:{name:'制作产品短片',title:'把日常的一步，拍成一支短片。',prompt:'为白色日常鞋制作一支 12 秒产品短片。自然光、慢节奏，让产品在真实的生活场景里被看见。',directions:['先看完整成片','先看分镜方案'],results:['film','report']},
  image:{name:'准备品牌视觉素材',title:'让一个想法，有看得见的样子。',prompt:'为生活方式品牌整理两种视觉参考：自然光里的产品场景，以及适合品牌传播的海报场景。',directions:['产品场景优先','海报场景优先'],results:['product','poster']},
  document:{name:'整理新品发布方案',title:'把零散的灵感，整理成行动方案。',prompt:'把创意方向、短片分镜和发布安排整理成一份可阅读、可下载的新品发布方案。',directions:['先读完整方案','先看短片成果'],results:['report','film']},
};
const $ = selector => document.querySelector(selector);
let taskId='video', view='task', direction=0, choosing=false;
function thumbnail(asset){return asset.type==='document'?cover:`<img src="${asset.poster||asset.src}" alt="${asset.title}" loading="lazy">`;}
function media(asset){
  if(asset.type==='video')return `<video class="hero-video" controls playsinline preload="none" poster="${asset.poster}" aria-label="${asset.title}"><source src="${asset.src}" type="video/mp4">当前浏览器无法播放视频，请下载查看。</video>`;
  if(asset.type==='image')return `<div class="image-grid">${tasks.image.results.map(id=>assets.find(a=>a.id===id)).sort((a,b)=>a.id===asset.id?-1:b.id===asset.id?1:0).map(a=>`<button class="image-card" data-open="${a.id}">${thumbnail(a)}<span>${a.title} ↗</span><small>${a.meta} · 点击放大</small></button>`).join('')}</div>`;
  return `<button class="document-card" data-open="report">${cover}<div><h3>新品发布与内容方案</h3><p>创意方向 / 短片分镜 / 发布与复盘</p><p>一份从想法走向执行的完整提案。</p><span class="open-doc">打开文档，阅读全文 ↗</span></div></button>`;
}
function stopVideos(){document.querySelectorAll('video').forEach(v=>v.pause());}
function render(){
  stopVideos();
  const task=tasks[taskId], asset=assets.find(a=>a.id===task.results[direction]);
  $('#breadcrumb').textContent=view==='library'?'我的成果 / 全部示例':`我的任务 / ${task.name}`;
  document.querySelectorAll('[data-task]').forEach(b=>{b.classList.toggle('selected',b.dataset.task===taskId);b.setAttribute('aria-pressed',String(b.dataset.task===taskId));});
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===(view==='canvas'?'task':view));b.setAttribute('aria-pressed',String(b.dataset.view===(view==='canvas'?'task':view)));});
  ['task','library','canvas'].forEach(v=>$(`#${v}-view`).hidden=view!==v);
  $('#canvas-toggle').setAttribute('aria-pressed',String(view==='canvas'));
  $('#task-title').textContent=task.title;$('#task-prompt').textContent=task.prompt;
  $('#direction-panel').hidden=!choosing;$('#result-view').hidden=choosing;
  $('#progress-text').textContent=choosing?'需求已整理，等待你确认方向':'方向已确认，成果已整理';
  $('#replay').hidden=choosing;
  document.querySelectorAll('[data-direction]').forEach((b,i)=>{b.textContent=task.directions[i];b.setAttribute('aria-pressed',String(direction===i));});
  $('#result-title').textContent=asset.title;$('#result-meta').textContent=asset.meta;$('#result-body').innerHTML=media(asset);
  $('#canvas-prompt').textContent=task.prompt;$('#canvas-direction').textContent=choosing?'等待确认':task.directions[direction];$('#canvas-result').textContent=asset.title;$('#canvas-thumb').innerHTML=thumbnail(asset);
}
function changeView(next){view=next;render();$('#scroll-area').scrollTop=0;}
function openAsset(id){
  stopVideos();const asset=assets.find(a=>a.id===id);
  $('#preview-title').textContent=asset.title;
  $('#preview-content').innerHTML=asset.type==='document'?report:asset.type==='video'?media(asset):`<img src="${asset.src}" alt="${asset.title}">`;
  $('#download').href=asset.src;$('#download').download=asset.src.split('/').pop();$('#preview-dialog').showModal();
}
$('#library-grid').innerHTML=assets.map(a=>`<button class="library-card" data-open="${a.id}">${thumbnail(a)}<h2>${a.title} ↗</h2><p>${a.meta}</p></button>`).join('');
document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.task){taskId=b.dataset.task;direction=0;choosing=false;changeView('task');}
  if(b.dataset.view)changeView(b.dataset.view);
  if(b.dataset.direction!==undefined){direction=Number(b.dataset.direction);render();}
  if(b.dataset.open)openAsset(b.dataset.open);
});
$('#canvas-toggle').onclick=()=>changeView(view==='canvas'?'task':'canvas');
$('#show-library').onclick=()=>changeView('library');
$('#replay').onclick=()=>{choosing=true;render();$('#direction-panel button').focus();};
$('#confirm').onclick=()=>{choosing=false;render();$('#replay').focus();};
$('#canvas-change').onclick=()=>{choosing=true;changeView('task');$('#direction-panel button').focus();};
$('#canvas-open').onclick=()=>openAsset(tasks[taskId].results[direction]);
$('#close-preview').onclick=()=>$('#preview-dialog').close();
$('#return-to-results').onclick=()=>$('#preview-dialog').close();
$('#preview-dialog').addEventListener('close',()=>{stopVideos();$('#preview-content').replaceChildren();});
render();
