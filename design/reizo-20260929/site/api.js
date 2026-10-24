(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const catalog = window.REIZO_API_CATALOG;
  const categories = {all:'全部',text:'文本与推理',image:'图像',video:'视频',audio:'音频',rag:'向量与重排',search:'搜索与读取'};
  const icons = {'OpenAI':'openai','Anthropic':'anthropic','Google Gemini':'gemini','DeepSeek':'deepseek','通义万相':'qwen','MiniMax':'minimax','ElevenLabs':'elevenlabs','Groq':'groq','Jina':'jina','Jina Reader':'jina','OpenRouter':'openrouter'};
  const statuses = {reference:'有参考价',preview:'展示预览',review:'价格待核对'};
  const docsRoot = 'docs.html';
  const docs = {
    text:docsRoot+'#text',
    image:docsRoot+'#image',
    gemini:docsRoot+'#gemini',
    video:docsRoot+'#video'
  };
  const escape = value => String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = m => icons[m.provider] ? '<img class="provider-icon" src="assets/'+icons[m.provider]+'.svg" alt="">' : '<span class="provider-icon provider-initial" aria-hidden="true">'+escape(m.provider==='xAI'?'𝕏':'T')+'</span>';
  const state = {category:'all',provider:'all',q:'',preview:true,page:1,language:'curl',model:catalog.models[0]};
  const pageSize = 8;
  let toastTimer;
  function toast(message) { $('#toast').textContent=message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),2500); }
  async function copy(text, button) {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else { const field=document.createElement('textarea');field.value=text;field.style.cssText='position:fixed;opacity:0;';document.body.append(field);field.select();const ok=document.execCommand('copy');field.remove();if(!ok)throw Error('copy'); }
      const old=button.textContent;button.textContent='已复制';setTimeout(()=>{button.textContent=old;},1500);toast('已复制到剪贴板');
    } catch { toast('无法自动复制，请选中内容手动复制。'); }
  }
  function priceHTML(m, raw=false) {
    if (m.status==='preview') return '<span class="price-unit">正式调用与计费尚未开放</span>';
    if (m.status==='review'&&!raw) return '<span class="price-unit">计费单位待确认</span>';
    const p=m.price, from=p.from?'起':'';
    if(p.unit==='token') return '<div class="price-pair"><span><small>输入</small><strong>$'+p.input+from+'</strong></span><span><small>输出</small><strong>$'+p.output+from+'</strong></span></div><div class="price-unit">/ 1M tokens（百万 Token）</div>';
    return '<div class="price-single"><strong>$'+p.amount+from+' <small>/ 次</small></strong><small>参数与分组条件见详情</small></div>';
  }
  function writeURL() {
    const url=new URL(location.href);
    [['q',state.q],['category',state.category==='all'?'':state.category],['provider',state.provider==='all'?'':state.provider],['previews',state.preview?'':'0'],['model',state.model.id]].forEach(([key,value])=>value?url.searchParams.set(key,value):url.searchParams.delete(key));
    try { history.replaceState(null,'',url); } catch { /* Some local-file browsers restrict History API. Filtering still works. */ }
  }
  function renderRows() {
    const query=state.q.trim().toLowerCase();
    const models=catalog.models.filter(m=>(state.category==='all'||m.category===state.category)&&(state.provider==='all'||m.provider===state.provider)&&(state.preview||m.status!=='preview')&&(!query||(m.id+' '+m.provider+' '+categories[m.category]).toLowerCase().includes(query)));
    const pages=Math.max(1,Math.ceil(models.length/pageSize));state.page=Math.min(state.page,pages);
    $('#result-count').textContent=models.length+' 个模型';
    $('#page-count').textContent=state.page+' / '+pages;
    $('#previous-page').disabled=state.page===1;$('#next-page').disabled=state.page===pages;
    $('#empty-results').hidden=Boolean(models.length);
    $('#model-rows').innerHTML=models.slice((state.page-1)*pageSize,state.page*pageSize).map(m=>'<tr><td><div class="model-identity">'+icon(m)+'<div><button class="model-title" data-detail="'+escape(m.id)+'" aria-label="查看 '+escape(m.id)+' 详情">'+escape(m.id)+'</button><span class="provider-name">'+escape(m.provider)+'</span></div></div></td><td>'+categories[m.category]+'</td><td>'+priceHTML(m)+'</td><td><span class="model-status '+m.status+'">'+statuses[m.status]+'</span></td><td><button class="row-example" '+(m.status==='preview'?'data-detail':'data-example')+'="'+escape(m.id)+'">'+(m.status==='preview'?'查看状态':'接入说明')+' ↗</button></td></tr>').join('');
    $$('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===state.category)));
    writeURL();
  }
  function refreshFilters() {state.page=1;renderRows();}
  [...new Set(catalog.models.map(m=>m.provider))].forEach(name=>$('#provider-filter').add(new Option(name,name)));
  catalog.models.filter(m=>m.status!=='preview').forEach(m=>$('#example-model').add(new Option(m.id,m.id)));
  $('#model-search').addEventListener('input',e=>{state.q=e.target.value;refreshFilters();});
  $('#provider-filter').addEventListener('change',e=>{state.provider=e.target.value;refreshFilters();});
  $('#preview-filter').addEventListener('change',e=>{state.preview=e.target.checked;refreshFilters();});
  $$('[data-category]').forEach(b=>b.addEventListener('click',()=>{state.category=b.dataset.category;refreshFilters();}));
  $('#reset-filters').addEventListener('click',()=>{state.q='';state.category='all';state.provider='all';state.preview=true;$('#model-search').value='';$('#provider-filter').value='all';$('#preview-filter').checked=true;refreshFilters();$('#model-search').focus();});
  [['#previous-page',-1],['#next-page',1]].forEach(([selector,delta])=>$(selector).addEventListener('click',()=>{state.page+=delta;renderRows();$('#catalog').scrollIntoView({block:'start'});}));

  const drawer=$('#model-detail');
  function showDetail(m) {
    $('#detail-title').textContent=m.id;
    const preview=m.status==='preview';
    $('#detail-content').innerHTML='<div class="detail-provider">'+icon(m)+'<span>'+escape(m.provider)+' · '+categories[m.category]+'</span><span class="model-status '+m.status+'">'+statuses[m.status]+'</span></div><div class="detail-id"><code>'+escape(m.id)+'</code><button data-copy-id="'+escape(m.id)+'" aria-label="复制 Model ID">复制 ID</button></div><div class="detail-price"><p>'+(m.status==='review'?'原目录标注 · 尚待核对':'目录参考价格 · USD 美元')+'</p>'+priceHTML(m,true)+'</div>'+(preview?'<p class="detail-copy">原目录标注为展示预览，正式调用与计费尚未开放。请勿将此条目视为已可用 API。</p>':'<div class="detail-copy"><p><strong>价格对应分组</strong><br>'+escape(m.group)+'</p><p>以上价格已按原目录分组展示，无需再乘一次倍率。实际扣费受调用分组、缓存、模型参数及用量影响，最终以控制台为准。</p></div>')+(m.note?'<p class="detail-warning">'+escape(m.note)+'</p>':'')+(!preview?'<p class="detail-copy">目录收录不等于已验证所有 API 路径。接入前，请确认账户权限、实际 Model ID 和该模型支持的接口。</p>':'')+'<div class="detail-actions">'+(!preview?'<button class="button" data-example="'+escape(m.id)+'">查看接入说明 <span>→</span></button>':'')+'<a class="api-doc-link" href="docs.html#billing">查看计费说明 ↗</a></div>';
    drawer.showModal();
  }
  drawer.querySelector('.dialog-close').addEventListener('click',()=>drawer.close());
  drawer.addEventListener('click',e=>{if(e.target===drawer&&e.clientX<drawer.getBoundingClientRect().left)drawer.close();});
  function selectModel(m, scroll=false) {
    if(m.status==='preview'){showDetail(m);return;}
    state.model=m;$('#example-model').value=m.id;renderExample();writeURL();
    if(scroll){if(drawer.open)drawer.close();$('#quickstart').scrollIntoView({block:'start'});$('#example-model').focus({preventScroll:true});}
  }
  document.addEventListener('click',e=>{
    const detail=e.target.closest('[data-detail]'), example=e.target.closest('[data-example]'), copier=e.target.closest('[data-copy-id]');
    if(detail)showDetail(catalog.models.find(m=>m.id===detail.dataset.detail));
    if(example)selectModel(catalog.models.find(m=>m.id===example.dataset.example),true);
    if(copier)copy(copier.dataset.copyId,copier);
  });
  $('#example-model').addEventListener('change',e=>selectModel(catalog.models.find(m=>m.id===e.target.value)));
  $$('[data-language]').forEach(b=>b.addEventListener('click',()=>{state.language=b.dataset.language;renderExample();}));
  function renderExample() {
    const m=state.model, geminiImage=m.category==='image'&&m.provider==='Google Gemini';
    const referenceOnly=geminiImage||m.status==='review';
    const endpoint=m.category==='video'?'/v1/video/generations':m.category==='image'?'/v1/images/generations':'/v1/chat/completions';
    const url=geminiImage?docs.gemini:docs[m.category]||docsRoot;
    $('#endpoint-doc').href=url;
    $('#endpoint-label').textContent=referenceOnly?'请先确认模型专用接口与参数':'POST '+endpoint+' · 接口格式模板';
    $('#example-note').textContent=referenceOnly?(geminiImage?'Gemini 图像使用专用协议，请按对应文档接入，不直接套用 OpenAI Images 路径。':'该模型的计费单位尚待核对。请先确认调用接口、参数与费用，再接入生产环境。'):'已选择 '+m.id+'。下面演示'+(m.category==='video'?'通用视频任务流程':'对应能力的请求格式')+'，并非该模型的已验证调用；请先确认模型支持此接口。';
    $$('[data-language]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.language===state.language));b.disabled=referenceOnly;});
    $('#copy-example').disabled=referenceOnly;
    if(referenceOnly){$('#api-code-content').textContent='接入前需要确认\n\n模型  '+m.id+'\n能力  '+categories[m.category]+'\n\n'+(geminiImage?'请查看 Gemini 专用图像接口文档，\n确认模型 ID、请求协议与图像参数。':'原目录的计费单位存在疑问，\n暂不提供可直接复制的调用模板。')+'\n\n通过下方「接口文档」继续查看。';return;}
    const body={model:m.id,...(m.category==='text'?{messages:[{role:'user',content:'用三句话介绍这个产品的核心价值。'}]}:m.category==='image'?{prompt:'一张自然光下的产品摄影，简洁背景。',size:'1024x1024'}:{prompt:'自然光下的产品特写，镜头缓慢推进。',seconds:5})};
    const json=JSON.stringify(body,null,2);
    let code='';
    if(state.language==='curl'){
      code='# 服务端环境变量：REIZO_API_KEY\n# REIZO_API_BASE = 已确认的网关根地址（不含 /v1）\n# 请先确认模型支持此接口与参数\n\ncurl --fail-with-body "${REIZO_API_BASE}'+endpoint+'" \\\n  -H "Authorization: Bearer $REIZO_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \''+json+'\'';
      if(m.category==='video')code+='\n\n# 取创建响应中的 id，设置为 TASK_ID，再查询\ncurl --fail-with-body "${REIZO_API_BASE}/v1/video/generations/${TASK_ID}" \\\n  -H "Authorization: Bearer $REIZO_API_KEY"\n\n# status 为 succeeded 时，从 result.url 获取结果\n# 未完成请稍后查询；失败请查日志，不要无限重试';
    }else if(state.language==='python'){
      code='# Python 3 · 标准库，无需额外依赖\n# 先配置已确认的网关根地址（不含 /v1）与密钥\nimport os, json\nfrom urllib.request import Request, urlopen\n\nbase = os.environ["REIZO_API_BASE"].rstrip("/")\nheaders = {\n    "Authorization": "Bearer " + os.environ["REIZO_API_KEY"],\n    "Content-Type": "application/json",\n}\npayload = '+json+'\nrequest = Request(\n    base + "'+endpoint+'",\n    data=json.dumps(payload).encode(),\n    headers=headers, method="POST",\n)\nwith urlopen(request, timeout=120) as response:\n    result = json.load(response)\nprint(result)';
      if(m.category==='video')code+='\n\n# 稍后用任务 id 查询；不要把 queued 当作生成完成\nfrom urllib.parse import quote\nquery = Request(base + "/v1/video/generations/" +\n    quote(result["id"], safe=""), headers=headers)\nwith urlopen(query, timeout=30) as response:\n    task = json.load(response)\nif task.get("status") == "succeeded":\n    print(task["result"]["url"])\nelse:\n    print(task)  # 根据状态决定稍后查询或处理失败';
    }else{
      code='// Node.js 18+ · 只在服务端运行，勿将密钥放入前端\n// REIZO_API_BASE：已确认的网关根地址，不含 /v1\nconst base = process.env.REIZO_API_BASE?.replace(/\\/$/, "");\nconst key = process.env.REIZO_API_KEY;\nif (!base || !key) throw new Error("请先配置网关与密钥");\nconst headers = {\n  Authorization: `Bearer ${key}`,\n  "Content-Type": "application/json",\n};\nconst response = await fetch(base + "'+endpoint+'", {\n  method: "POST", headers,\n  body: JSON.stringify('+json+'),\n  signal: AbortSignal.timeout(120000),\n});\nif (!response.ok) throw new Error(`HTTP ${response.status}`);\nconst result = await response.json();\nconsole.log(result);';
      if(m.category==='video')code+='\n\n// 稍后查询任务；此处不做无限轮询\nconst status = await fetch(base + "/v1/video/generations/"\n  + encodeURIComponent(result.id), {headers,\n  signal: AbortSignal.timeout(30000)});\nif (!status.ok) throw new Error(`HTTP ${status.status}`);\nconst task = await status.json();\nconsole.log(task.status === "succeeded"\n  ? task.result.url : task);';
    }
    $('#api-code-content').textContent=code;
  }
  $('#copy-example').addEventListener('click',e=>copy($('#api-code-content').textContent,e.currentTarget));

  // Shared navigation and footer behavior; homepage animation script is intentionally not loaded.
  function closeNav(){$('#main-nav').classList.remove('open');$('.menu-toggle').setAttribute('aria-expanded','false');$('.menu-toggle').setAttribute('aria-label','展开导航');}
  $('.menu-toggle').addEventListener('click',e=>{const b=e.currentTarget;const open=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',String(open));b.setAttribute('aria-label',open?'收起导航':'展开导航');$('#main-nav').classList.toggle('open',open);});
  $('#main-nav').addEventListener('click',e=>{if(e.target.closest('a'))closeNav();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeNav();});
  const footerDialog=$('#footer-dialog');
  footerDialog.querySelector('.dialog-close').addEventListener('click',()=>footerDialog.close());
  document.addEventListener('click',e=>{const b=e.target.closest('[data-label],[data-info]');if(b){$('#footer-dialog-title').textContent=b.dataset.label||b.textContent.trim();footerDialog.showModal();}});
  const languageToggle=$('#language-toggle'),languageMenu=$('#language-menu');
  function closeLanguage(){if(languageMenu){languageMenu.hidden=true;languageToggle.setAttribute('aria-expanded','false');}}
  languageToggle?.addEventListener('click',()=>{const open=languageMenu.hidden;languageMenu.hidden=!open;languageToggle.setAttribute('aria-expanded',String(open));});
  $('#language-menu button')?.addEventListener('click',closeLanguage);
  document.addEventListener('click',e=>{if(!e.target.closest('.language-picker'))closeLanguage();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){const open=languageMenu&&!languageMenu.hidden;closeLanguage();if(open)languageToggle.focus();}});
  const socialIcons=[
    ['Facebook','<path d="M14 21v-8h3l.5-4H14V7c0-1 .4-1.7 1.8-1.7H18V2.2C17.5 2.1 16.2 2 15 2c-3 0-5 1.8-5 5v2H7v4h3v8z"/>'],
    ['X','<path d="M18.5 2H22l-7.6 8.7L23 22h-6.7l-5.2-6.8L5.2 22H1.7l7.8-9L1 2h6.8l4.7 6.3L18.5 2zm-1.2 18h1.9L6.7 4H4.8z"/>'],
    ['LinkedIn','<path d="M3 8h4v14H3V8zm2-6a2.3 2.3 0 1 0 0 4.6A2.3 2.3 0 0 0 5 2zm5 6h4v2c.8-1.4 2.1-2.3 4.2-2.3 4 0 4.8 2.6 4.8 6V22h-4v-7.3c0-1.8 0-4-2.4-4S14 12.7 14 14.5V22h-4z"/>'],
    ['GitHub','<path d="M12 2a10 10 0 0 0-3.16 19.5c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.64-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03A9.6 9.6 0 0 1 12 7c.85 0 1.71.11 2.51.34 1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.58c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/>'],
    ['Instagram','<g fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/></g><circle cx="17.5" cy="6.5" r="1"/>'],
    ['TikTok','<path d="M14 2h3c.2 2.3 1.5 4 4 4.3v3.3c-1.5 0-2.8-.5-4-1.2V16a6 6 0 1 1-6-6v3.4a2.7 2.7 0 1 0 3 2.6V2z"/>'],
    ['电话','<path d="M6.6 2.5 3.3 4.2c-3 5.1 8.3 17.5 14.1 16.8l3.8-3.7-4.8-4-2.6 2.4c-2.4-1.2-4.4-3.2-5.5-5.6l2-2.3z"/>'],
    ['WhatsApp','<g fill="none" stroke="currentColor" stroke-width="1.7"><path d="m3 21 1.5-5A9 9 0 1 1 8 20z"/><path d="M8 7c-3 3 4 10 7 7l-2-2-1 1-3-3 1-1z"/></g>']
  ];
  $('#socials').innerHTML=socialIcons.map(([name,svg])=>'<button data-label="'+name+'" aria-label="'+name+'" title="'+name+'"><svg viewBox="0 0 24 24" aria-hidden="true">'+svg+'</svg></button>').join('');
  const params=new URLSearchParams(location.search);
  state.q=params.get('q')||'';state.category=Object.hasOwn(categories,params.get('category'))?params.get('category'):'all';
  state.provider=catalog.models.some(m=>m.provider===params.get('provider'))?params.get('provider'):'all';state.preview=params.get('previews')!=='0';
  $('#model-search').value=state.q;$('#provider-filter').value=state.provider;$('#preview-filter').checked=state.preview;
  const initialModel=catalog.models.find(m=>m.id===params.get('model')&&m.status!=='preview');if(initialModel)state.model=initialModel;
  $('#example-model').value=state.model.id;renderRows();renderExample();
})();
