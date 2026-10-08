/* Workspace review layer. All examples are local; no API, upload or payment calls. */
(() => {
  'use strict';
  const api=window.ReizoStudio;if(!api)return;
  const $=s=>document.querySelector(s), esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=id=>`<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
  let view='workspace',filter='全部',category='全部',tab='tools',search='',project=null,mode='Agent',modelType='全部',returnFocus=null;
  const projects=[{id:'launch',name:'REIZO 上市计划'}];
  const expandedProjects=new Set(['launch']),fullProjects=new Set();
  let taskSearch='',taskCategory='全部';
  let activeRole=null,resultFilter='全部';
  const roles=[
    {id:'designer',name:'电商视觉设计师',initial:'视',cat:'视觉媒体',scene:'commerce',skills:['图片设计','电商运营'],note:'统一产品外观、构图和视觉语言。',deliver:'产品主图 / 卖点图 / 场景图'},
    {id:'director',name:'短视频编导',initial:'影',cat:'内容营销',scene:'video',skills:['视频创作','视觉叙事'],note:'从内容方向到镜头与字幕安排。',deliver:'选题 / 分镜 / 拍摄清单'},
    {id:'analyst',name:'经营分析师',initial:'数',cat:'法务财务',scene:'finance',skills:['财务分析','数据分析'],note:'核对数据口径，解释变化与风险。',deliver:'指标分析 / 管理层摘要'},
    {id:'researcher',name:'研究助理',initial:'研',cat:'数据科研',scene:'research',skills:['文献整理','汇报整理'],note:'梳理观点与证据，标注来源和局限。',deliver:'资料归纳 / 研究摘要'},
    {id:'engineer',name:'开发工程师',initial:'码',cat:'代码开发',scene:'code',skills:['开发排查','测试设计'],note:'明确问题边界，逐步排查与验证。',deliver:'排查路径 / 测试用例'},
    {id:'legal',name:'合同审查助理',initial:'法',cat:'法务财务',scene:'legal',skills:['合同梳理','汇报整理'],note:'标注待核实条款，辅助专业复核。',deliver:'条款对照 / 风险清单'}
  ];
  const skillNotes={'视频创作':'组织开场、镜头节奏与字幕。','视觉叙事':'将内容转成连续的画面表达。','图片设计':'规划构图、光线与画面风格。','电商运营':'组织商品卖点与平台交付规格。','社媒策划':'从受众出发规划选题和发布节奏。','合同梳理':'提取权责、付款及验收条款。','财务分析':'核对收入、成本与利润口径。','汇报整理':'将资料组织为清晰的结论摘要。','会议整理':'提取决策、责任人与行动项。','开发排查':'从复现条件逐步定位问题。','测试设计':'覆盖输入边界与异常路径。','文献整理':'按主题归纳观点并保留来源。','数据分析':'清洗字段、对比指标和趋势。'};
  const categories=["全部", "电商销售", "视觉媒体", "内容营销", "代码开发", "法务财务", "产品研发", "办公管理", "数据科研"];
  const tools=[
    {name:'电商产品套图',cat:'电商销售',note:'从主图到卖点图，保持产品与视觉一致。',scene:'commerce',icon:'files'},
    {name:'短视频分镜',cat:'视觉媒体',note:'先定方向，再组织镜头、旁白与制作清单。',scene:'video',icon:'canvas'},
    {name:'合同条款梳理',cat:'法务财务',note:'整理付款、验收与责任条款，留待专业复核。',scene:'legal',icon:'tasks'},
    {name:'经营数据分析',cat:'法务财务',note:'核对口径，梳理变化与下一步行动。',scene:'finance',icon:'tasks'},
    {name:'代码问题排查',cat:'代码开发',note:'从复现条件到排查路径与回归测试。',scene:'code',icon:'compose'},
    {name:'文献与资料整理',cat:'数据科研',note:'按主题整理观点、证据与来源。',scene:'research',icon:'files'},
    {name:'图片抠图与优化',cat:'视觉媒体',note:'明确主体范围与背景，准备透明底或替换背景。',scene:'commerce',icon:'canvas',prompt:'请帮我处理一张图片的主体抠图。先确认主体范围、透明底或替换背景，以及交付尺寸。'},
    {name:'图片变清晰',cat:'视觉媒体',note:'确认用途与目标尺寸，保留原有内容和细节。',scene:'commerce',icon:'canvas',prompt:'请帮我规划这张图片的清晰度优化，先确认用途、目标尺寸和需要保留的细节。'},
    {name:'图片融合',cat:'视觉媒体',note:'结合参考图，统一构图、光线与视觉风格。',scene:'commerce',icon:'canvas',prompt:'请根据两张参考图规划融合方案。先确认需要保留的主体、场景、构图和光线。'},
    {name:'画面清理',cat:'视觉媒体',note:'清理有权编辑的素材中的干扰元素。',scene:'commerce',icon:'canvas',prompt:'请帮我规划有权编辑的图片中的干扰元素清理。先让我确认处理区域和需要保留的内容。'},
    {"name": "品牌内容排期", "cat": "内容营销", "note": "安排选题、文案、素材与发布节奏。", "scene": "video", "icon": "files", "prompt": "为 NYNOR 运动品牌制定一周上新内容计划，按发布日、渠道、选题、配图和行动提示整理，先确认受众与目标。"},
    {"name": "需求与验收清单", "cat": "产品研发", "note": "从用户流程拆分需求、优先级与验收标准。", "scene": "code", "icon": "tasks", "prompt": "为运动社群的活动报名功能整理需求说明，覆盖名额、候补、取消和通知，列出优先级与验收标准，先确认流程。"},
    {"name": "会议行动清单", "cat": "办公管理", "note": "整理决策、责任人、截止日期与待确认事项。", "scene": "research", "icon": "files", "prompt": "将新品上线会议记录整理成行动清单，包含决策、任务、负责人、截止日期和依赖；未明确的信息标为待确认。"},
    {"name": "网站开发", "cat": "代码开发", "note": "梳理页面结构、响应式布局与开发交付。", "scene": "code", "icon": "compose", "prompt": "为运动品牌规划一个响应式网站，包含系列展示、品牌故事与联系入口，先确认页面结构，再拆分实现和验收步骤。"}
  ];
  const models=[
    {id:'auto',name:'REIZO 自动',type:'自动',logo:'reizo-mark.png',note:'按任务匹配不同模型，兼顾输出质量、速度与成本。'},
    {id:'openai',name:'OpenAI',type:'文字',logo:'openai.svg',note:'文字、推理与代码任务'},
    {id:'anthropic',name:'Claude',type:'文字',logo:'anthropic.svg',note:'写作、资料处理与代码任务'},
    {id:'gemini',name:'Gemini',type:'文字',logo:'gemini.svg',note:'多模态资料与内容任务'},
    {id:'deepseek',name:'DeepSeek',type:'文字',logo:'deepseek.svg',note:'推理、分析与代码任务'},
    {id:'kimi',name:'Kimi',type:'文字',logo:'kimi.svg',note:'长文资料与研究任务'}
  ];
  const modes=[['Agent','拆解任务、确认方向，并组织交付成果。'],['对话','围绕一个问题，进行问答与讨论。'],['图片','从参考资料开始，规划图片与视觉方案。'],['视频','确认内容方向，逐步生成分镜方案。'],['画布','把资料、任务与成果连接在同一画布。'],['表格','整理字段、分析口径与表格结构。']];
  const styleDialog=(id,title,body,cls='')=>{
    const d=document.createElement('dialog');d.id=id;d.className='review-dialog '+cls;d.setAttribute('aria-labelledby',id+'-title');
    d.innerHTML=`<div class="dialog-heading"><h2 id="${id}-title">${title}</h2><button class="icon-button" data-close="${id}" aria-label="关闭${title}">${icon('close')}</button></div>${body}`;document.body.append(d);
    d.addEventListener('click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();});
    d.addEventListener('close',()=>{const trigger=returnFocus;if(trigger?.isConnected)trigger.focus();});return d;
  };
  const dropdownTriggers={'model-dialog':'review-model-toggle','mode-dialog':'mode-toggle','task-settings':'settings-toggle'};
  function positionDropdown(d){
    const trigger=$('#'+dropdownTriggers[d.id]),r=trigger.getBoundingClientRect(),composer=$('#composer').getBoundingClientRect(),gap=8,edge=12;
    // Direction follows the conversation state, never an individual menu's height.
    const down=!$('#workspace-body').classList.contains('has-task');
    const width=Math.min(d.id==='model-dialog'?350:310,innerWidth-edge*2);
    d.style.width=width+'px';
    const space=down?innerHeight-composer.bottom-gap-edge:composer.top-gap-edge;
    d.style.maxHeight=Math.max(40,Math.min(420,space))+'px';
    d.style.left=Math.max(edge,Math.min(r.left,innerWidth-width-edge))+'px';
    d.style.top=(down?composer.bottom+gap:Math.max(edge,composer.top-gap-d.getBoundingClientRect().height))+'px';
    d.dataset.direction=down?'down':'up';
  }
  function styleDropdown(id,title,body){const d=document.createElement('div');d.id=id;d.className='composer-dropdown';d.setAttribute('popover','auto');d.setAttribute('role','dialog');d.setAttribute('aria-label',title);d.innerHTML=body;document.body.append(d);d.addEventListener('toggle',e=>{$('#'+dropdownTriggers[id])?.setAttribute('aria-expanded',String(e.newState==='open'));});d.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#'+dropdownTriggers[id]).focus();return;}if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key)||e.target.matches('input'))return;const options=[...d.querySelectorAll('button[data-model],button[data-mode]')];if(!options.length)return;e.preventDefault();const i=options.indexOf(document.activeElement);options[e.key==='Home'?0:e.key==='End'?options.length-1:(i+(e.key==='ArrowDown'?1:-1)+options.length)%options.length].focus();});return d;}
  const open=id=>{const d=$('#'+id);returnFocus=document.activeElement;if(dropdownTriggers[id]){if(d.matches(':popover-open')){d.hidePopover();return;}d.showPopover();positionDropdown(d);const focus=d.querySelector('input,select,button[aria-pressed="true"]')||d.querySelector('button');focus?.focus({preventScroll:true});d.scrollTop=0;}else d.showModal();};
  function dismissDropdown(id){$('#'+id).hidePopover();$('#'+dropdownTriggers[id]).focus();}
  window.addEventListener('resize',()=>Object.keys(dropdownTriggers).forEach(id=>{const d=$('#'+id);if(d.matches(':popover-open'))positionDropdown(d);}));
  styleDropdown('model-dialog','选择模型',`<label class="search-field">⌕ <input type="search" id="review-model-search" placeholder="搜索模型或提供商" aria-label="搜索模型或提供商"></label><div id="review-model-list" class="review-model-list"></div>`);
  styleDropdown('mode-dialog','任务方式',`<div class="mode-options">${modes.map(([n,d])=>`<button data-mode="${n}" aria-pressed="${n==='Agent'}"><span><strong>${n}</strong><small>${d}</small></span><span class="option-check">✓</span></button>`).join('')}</div>`);
  styleDropdown('task-settings','任务设置',`<div class="dropdown-title">任务设置</div><form id="task-settings-form"><label class="setting-field">图片模型<select id="image-preference"><option value="auto">REIZO 自动匹配</option><option value="openai">OpenAI 图像系列</option><option value="gemini">Gemini 图像系列</option></select></label><label class="setting-field">视频模型<select id="video-preference"><option value="auto">REIZO 自动匹配</option><option value="kling">可灵系列</option><option value="minimax">MiniMax 系列</option></select></label><label class="setting-field">执行偏好<select id="run-preference"><option>均衡质量与速度</option><option>优先输出质量</option><option>优先响应速度</option></select></label><div class="preference-footer"><small id="preference-status" role="status">用于下一次发送</small><button type="button" class="plain-button" id="reset-preferences">恢复默认</button></div></form>`);
  styleDialog('project-dialog','创建项目',`<form id="project-form"><label class="setting-field">项目名称<input id="project-name" maxlength="40" required placeholder="例如：秋季新品上市"></label><p class="dialog-intro">把同一目标下的任务归在一起，成果也更容易找到。</p><div class="dialog-footer"><span></span><button class="primary-button" type="submit">创建项目</button></div></form>`,'compact-dialog');
  styleDialog('move-project-dialog','整理到项目',`<div id="move-project-options" class="mode-options"></div>`,'compact-dialog');
  let movingTask=null;
  const nativeModel=$('.model-picker');nativeModel.classList.add('native-model-picker');
  const modelButton=document.createElement('button');modelButton.type='button';modelButton.id='review-model-toggle';modelButton.className='review-model-toggle';modelButton.setAttribute('aria-haspopup','dialog');modelButton.setAttribute('aria-controls','model-dialog');nativeModel.after(modelButton);
  const right=document.createElement('div');right.className='composer-right';right.innerHTML=`<button type="button" class="mode-toggle" id="mode-toggle" aria-haspopup="dialog" aria-controls="mode-dialog">Agent <span>⌄</span></button><button type="button" class="icon-button" id="settings-toggle" aria-label="任务设置" title="任务设置" aria-haspopup="dialog" aria-controls="task-settings">${icon('settings')}</button>`;
  $('#send').before(right);right.append($('#send'));
  const changeModel=()=>{const m=models.find(m=>m.id===$('#model-select').value)||models[0];modelButton.innerHTML=`<img src="/reizo/assets/${m.logo}" alt=""><span>${m.name}</span><span class="model-chevron">⌄</span>`;modelButton.setAttribute('aria-label','选择模型，当前为'+m.name);};
  function paintModels(){const q=$('#review-model-search').value.toLowerCase().trim();const shown=models.filter(m=>(modelType==='全部'||m.type===modelType)&&(m.name+' '+m.note).toLowerCase().includes(q));$('#review-model-list').innerHTML=shown.map(m=>`<button data-model="${m.id}" aria-pressed="${$('#model-select').value===m.id}"><img src="/reizo/assets/${m.logo}" alt=""><span><strong>${m.name}${m.id==='auto'?'<em>推荐</em>':''}</strong><small>${m.note}</small></span><span class="option-check">✓</span></button>`).join('')||'<p class="empty-note">没有匹配的模型，试试其他关键词。</p>';}
  modelButton.addEventListener('click',()=>{paintModels();open('model-dialog');});$('#model-select').addEventListener('change',changeModel);$('#review-model-search').addEventListener('input',paintModels);
  $('#mode-toggle').addEventListener('click',()=>open('mode-dialog'));$('#settings-toggle').addEventListener('click',()=>open('task-settings'));
  $('#task-settings-form').addEventListener('submit',e=>e.preventDefault());
  $('#task-settings-form').addEventListener('change',()=>{$('#settings-toggle').classList.add('has-preferences');$('#preference-status').textContent='已更新，用于下一次发送';});
  $('#reset-preferences').addEventListener('click',()=>{$('#task-settings-form').reset();$('#settings-toggle').classList.remove('has-preferences');$('#preference-status').textContent='已恢复默认';});
  function status(t){return t.stage===4?'已完成':t.stage===2?'待确认':t.paused?'已暂停':'进行中';}
  function badge(t){const s=status(t);return `<span class="task-status ${t.stage===4?'done':t.stage===2?'attention':'running'}"><i></i>${s}</span>`;}
  function nav(){document.querySelectorAll('.workspace-nav button').forEach(b=>{if(b.id===({tasks:'tasks-home',tools:'tools-home',results:'artifacts'})[view])b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});$('#studio-location').textContent=view==='workspace'?(api.active?.title||''):'';$('#studio-location').hidden=!$('#studio-location').textContent;$('#task-count').textContent=api.tasks.length;}
  function show(next){view=next;$('#studio-library').classList.toggle('task-dashboard',next==='tasks');$('#studio-library').hidden=next==='workspace';$('#workspace-body').hidden=next!=='workspace';$('#canvas-toggle').hidden=next!=='workspace';document.body.classList.remove('sidebar-open');$('#sidebar-scrim').hidden=true;$('#open-sidebar').setAttribute('aria-expanded','false');nav();if(next!=='workspace'){renderLibrary();$('#studio-library').scrollTop=0;}}
  window.ReizoStudioShell={show};
  function projectsList(){
    $('#recent-tasks').querySelectorAll('[data-task]').forEach(b=>{b.hidden=!!api.tasks.find(t=>t.id===b.dataset.task)?.project;});
    $('#recent-heading').hidden=!api.tasks.some(t=>!t.project);
    $('#project-list').innerHTML=projects.map(p=>{
      const opened=expandedProjects.has(p.id),items=api.tasks.filter(t=>t.project===p.id);
      const visible=fullProjects.has(p.id)?items:items.slice(0,4);
      return `<div class="project-branch"><div class="project-folder"><button data-project="${p.id}" aria-expanded="${opened}" aria-controls="branch-${p.id}" title="${esc(p.name)}"><span class="tree-chevron">${opened?'⌄':'›'}</span>${icon('files')}<span>${esc(p.name)}</span></button><button class="folder-add" data-project-new="${p.id}" aria-label="在${esc(p.name)}中新建对话" title="新建对话">＋</button></div><div class="project-children" id="branch-${p.id}" ${opened?'':'hidden'}>${visible.map(t=>`<button class="project-task ${api.active?.id===t.id&&view==='workspace'?'active':''}" data-review-task="${t.id}" ${api.active?.id===t.id&&view==='workspace'?'aria-current="page"':''} title="${esc(t.title)}"><span>${esc(t.title)}</span></button>`).join('')||'<span class="project-empty">还没有对话</span>'}${items.length>4?`<button class="project-more" data-project-more="${p.id}">${fullProjects.has(p.id)?'收起':'显示更多'}</button>`:''}</div></div>`;
    }).join('');
  }
  const compactNumber=n=>n>=1000000?(n/1000000).toFixed(2)+'M':n>=1000?(n/1000).toFixed(1)+'K':String(n);
  const taskProgress=t=>t.stage===4?100:[12,35,50,78][t.stage]||0;
  function dashboardRows(){
    const list=api.tasks.filter(t=>(filter==='全部'||status(t)===filter)&&(taskCategory==='全部'||t.scenario.category===taskCategory)&&t.title.toLowerCase().includes(taskSearch.toLowerCase().trim()));
    $('#dashboard-task-list').innerHTML=list.map(t=>{
      const s=status(t),pct=taskProgress(t),note=t.stage===4?'成果已整理，可以继续修改':t.paused?'任务已暂停，可返回对话继续':t.stage===2?'等待你确认方向后继续':t.stage===3?'正在组织内容与交付成果':'正在梳理需求与任务步骤';
      return `<article class="dashboard-task"><div class="dashboard-task-icon">${icon(t.scenario.visual?'canvas':'tasks')}</div><div class="dashboard-task-main"><button class="dashboard-task-title" data-review-task="${t.id}">${esc(t.title)}</button><span class="dashboard-category">${esc(t.scenario.category)}</span><p>${esc(models.find(m=>m.id===t.model)?.name||'REIZO 自动')} · ${note}</p><div class="dashboard-progress"><div role="progressbar" aria-label="${esc(t.title)}的阶段进度" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div><span>${pct}%</span></div><div class="dashboard-task-meta"><span>${t.example?'示例任务':'本次会话'} · ${t.stage===4?'已交付':t.stage===2?'确认方向':t.stage===3?'整理成果':'需求分析'}</span><span>${t.usageTokens?compactNumber(t.usageTokens)+' Tokens':'用量待同步'}</span></div></div><div class="dashboard-task-actions">${badge(t)}<button class="dashboard-open" data-review-task="${t.id}">${s==='待确认'?'确认方向':s==='已完成'?'查看成果':'进入对话'} <span>→</span></button><button class="text-link" data-move-task="${t.id}">整理到项目</button></div></article>`;
    }).join('')||'<div class="review-empty">没有匹配的任务。<button data-clear-tasks>清除筛选</button></div>';
  }
  function dashboard(){
    const all=api.tasks,count=s=>all.filter(t=>status(t)===s).length;
    const groups=[['进行中','#5276ed'],['待确认','#9a8ae3'],['已暂停','#aebedc'],['已完成','#55a58c']].map(([name,color])=>({name,color,value:all.filter(t=>status(t)===name).reduce((n,t)=>n+(t.usageTokens||0),0)}));
    const total=groups.reduce((n,g)=>n+g.value,0);let cursor=0;
    const slices=groups.map(g=>{const from=cursor;cursor+=total?g.value/total*100:0;return `${g.color} ${from}% ${cursor}%`;}).join(',');
    return `<header class="library-heading"><div><h1>任务看板</h1></div><button class="dashboard-refresh" id="refresh-dashboard">↻ 刷新</button></header><div class="dashboard-metrics">${[['全部任务',all.length,'全部','tasks'],['进行中',count('进行中'),'进行中','canvas'],['已完成',count('已完成'),'已完成','files']].map(([label,n,s,i])=>`<button data-status="${s}"><span class="metric-icon">${icon(i)}</span><span><small>${label}</small><strong>${n}</strong><em>${s==='全部'?`待确认 ${count('待确认')} · 已暂停 ${count('已暂停')}`:`占全部 ${all.length?Math.round(n/all.length*100):0}%`}</em></span></button>`).join('')}<button id="dashboard-quota"><span class="metric-icon">◔</span><span><small>会员剩余额度</small><strong>80<small>%</small></strong><em>本期可用 · 示例</em></span></button></div><div class="dashboard-columns"><div class="dashboard-work"><div class="dashboard-filters"><div class="review-tabs">${['全部','进行中','待确认','已暂停','已完成'].map(s=>`<button data-status="${s}" aria-pressed="${filter===s}">${s} <small>${s==='全部'?all.length:count(s)}</small></button>`).join('')}</div><div class="dashboard-search"><label class="search-field">⌕ <input type="search" id="task-search" aria-label="搜索任务" placeholder="搜索任务名称" value="${esc(taskSearch)}"></label><select id="task-category" aria-label="筛选任务类型">${['全部',...new Set(all.map(t=>t.scenario.category))].map(c=>`<option ${taskCategory===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div></div><div id="dashboard-task-list"></div></div><aside class="dashboard-insights"><section class="insight-card"><div class="insight-heading"><h2>Token 消耗概览</h2><span>本次会话</span></div><small>累计消耗 · 示例用量</small><strong class="token-total">${compactNumber(total)}</strong><div class="token-donut" style="--slices:conic-gradient(${total?slices:'#e6ecf5 0% 100%'})" role="img" aria-label="累计示例用量 ${total} Tokens"><div><strong>${compactNumber(total)}</strong><span>Tokens</span></div></div><div class="token-legend">${groups.map(g=>`<div><i style="background:${g.color}"></i><span>${g.name}</span><strong>${compactNumber(g.value)} <small>(${total?(g.value/total*100).toFixed(1):'0'}%)</small></strong></div>`).join('')}</div></section><button class="insight-card quota-card" id="review-dashboard"><span class="quota-ring">80%</span><span><strong>会员剩余额度</strong><small>64,000 / 80,000 Credits · 示例</small><em>查看钱包与会员 →</em></span></button><section class="insight-card"><div class="insight-heading"><h2>并发任务</h2><span>示例方案</span></div><strong class="concurrency-total">${count('进行中')} <small>/ 4</small></strong><div class="concurrency-slots">${Array.from({length:4},(_,i)=>`<i class="${i<count('进行中')?'used':''}"></i>`).join('')}</div><p>待确认与已暂停任务不占执行名额。</p></section></aside></div>`;
  }
  function taskRows(list){return list.map(t=>`<article class="task-row"><button class="task-open" data-review-task="${t.id}"><span class="task-glyph">${icon(t.scenario.visual?'canvas':'tasks')}</span><span><strong>${esc(t.title)}</strong><small>${esc(t.scenario.category)}${t.example?' · 示例任务':''}</small></span></button>${badge(t)}<button class="row-project" data-move-task="${t.id}" aria-label="将${esc(t.title)}整理到项目" title="整理到项目">${icon('files')}</button><button class="task-arrow" data-review-task="${t.id}" aria-label="打开${esc(t.title)}">↗</button></article>`).join('')||'<div class="review-empty">暂时没有这类任务。<button data-review-new>开始一个新任务 →</button></div>';}
  function renderLibrary(){const library=$('#studio-library');
    if(view==='tasks'){
      library.innerHTML=dashboard();dashboardRows();
    }else if(view==='tools'){
      library.innerHTML=`<header class="library-heading"><div><h1>工具与技能</h1></div><button class="plain-button" id="use-selected-skills" ${api.selectedSkills.length?'':'hidden'}>带入任务 · ${api.selectedSkills.length} 项能力 →</button></header><div class="library-toolbar"><div class="review-tabs">${[['tools','任务工具'],['roles','角色'],['skills','技能']].map(([id,label])=>`<button data-tool-tab="${id}" aria-pressed="${tab===id}">${label}</button>`).join('')}</div><label class="search-field">⌕ <input id="tools-search" type="search" value="${esc(search)}" placeholder="搜索${tab==='roles'?'角色':tab==='skills'?'技能':'任务工具'}" aria-label="搜索工具与技能"></label></div><div class="category-tabs">${categories.map(c=>`<button data-category="${c}" aria-pressed="${category===c}">${c}</button>`).join('')}</div><div id="tool-grid" class="tool-grid"></div>`;paintTools();
    }else if(view==='results'){
      const done=api.tasks.filter(t=>t.stage===4);
      const type=t=>t.scenario.visual?'视觉方案':t.scenario.id==='code'?'代码':'分析文档';
      library.innerHTML=`<header class="library-heading"><div><h1>我的成果</h1></div></header><div class="library-toolbar"><div class="review-tabs">${['全部','视觉方案','分析文档','代码'].map(x=>`<button data-result-filter="${x}" aria-pressed="${resultFilter===x}">${x}</button>`).join('')}</div></div><div class="results-grid editorial-results">${done.filter(t=>resultFilter==='全部'||type(t)===resultFilter).map(t=>`<article class="deliverable-card"><button class="deliverable-preview content-preview" data-preview-result="${t.id}" aria-label="预览${esc(t.scenario.result)}">${resultArtwork(t)}</button><div class="deliverable-info"><small>${type(t)}${t.example?' · 示例':''}</small><h2>${esc(t.scenario.result.replace(/\.[a-z]+$/i,''))}</h2><div><button class="text-link" data-preview-result="${t.id}">查看成果 ↗</button><button data-review-task="${t.id}" class="text-link">来源对话</button></div></div></article>`).join('')||'<div class="review-empty">这里还没有成果。</div>'}</div>`;
    }projectsList();
  }
  function resultArtwork(t){return t.example?window.ReizoSamples.markup(t.scenario.id):`<div class="sample-output sample-document"><header>任务交付</header><h3>${esc(t.title)}</h3>${t.scenario.sections.slice(0,3).map((s,i)=>`<div class="research-point"><b>0${i+1}</b><p>${esc(s)}</p></div>`).join('')}</div>`;}
  function paintTools(){
    const q=search.toLowerCase().trim(),entries=tab==='tools'?tools:tab==='roles'?roles:api.skills.map(([name,cat])=>({name,cat,note:skillNotes[name],icon:'skill'}));
    const shown=entries.filter(t=>(category==='全部'||category===t.cat)&&(t.name+t.cat+t.note).toLowerCase().includes(q)).sort((a,b)=>categories.indexOf(a.cat)-categories.indexOf(b.cat));
    $('#tool-grid').className='tool-grid library-'+tab;
    $('#tool-grid').innerHTML=shown.map(t=>{
      if(tab==='roles')return `<article class="role-card"><div class="role-heading"><span class="role-avatar role-${t.id}">${t.initial}</span><span><small>${t.cat}</small><h2>${t.name}</h2></span></div><p>${t.note}</p><div class="role-skills">${t.skills.map(s=>`<span>${s}</span>`).join('')}</div><div class="role-bottom"><small>${t.deliver}</small><button data-use-role="${t.id}" aria-pressed="${activeRole===t.id}">${activeRole===t.id?'继续使用':'使用角色'} ↗</button></div></article>`;
      if(tab==='skills')return `<article class="skill-card"><span class="skill-glyph">${icon('skill')}</span><div><small>${t.cat}</small><h2>${esc(t.name)}</h2><p>${t.note}</p></div><button class="skill-add" data-add-skill="${esc(t.name)}" aria-pressed="${api.selectedSkills.includes(t.name)}" aria-label="${api.selectedSkills.includes(t.name)?'移除':'添加'}${t.name}">${api.selectedSkills.includes(t.name)?'✓':'＋'}</button></article>`;
      const featured=tools.indexOf(t)<6;
      return `<article class="tool-card designed-tool ${featured?'featured-tool':'utility-tool'}">${featured?`<div class="tool-art" aria-hidden="true">${window.ReizoSamples.markup(t.scene)}</div>`:`<span class="tool-card-icon">${icon(t.icon)}</span>`}<div class="tool-body"><small>${t.cat}</small><h2>${esc(t.name)}</h2><p>${t.note}</p><button data-use-tool="${esc(t.name)}" class="text-link">开始任务 <span>↗</span></button></div></article>`;
    }).join('')||'<div class="review-empty">没有匹配的内容。试试其他分类。</div>';
  }
  const roleChip=document.createElement('div');roleChip.className='selected-role';roleChip.hidden=true;$('#composer').prepend(roleChip);
  function paintRole(){const role=roles.find(r=>r.id===activeRole);roleChip.hidden=!role;roleChip.innerHTML=role?`<span>${role.initial}</span><strong>${role.name}</strong><button type="button" id="remove-role" aria-label="移除角色">×</button>`:'';}
  function openTask(id){project=api.tasks.find(t=>t.id===id)?.project||null;show('workspace');api.openTask(id);activeRole=api.active?.role||null;paintRole();changeModel();nav();projectsList();$('#composer-hint').hidden=true;}
  function newTask(){show('workspace');api.newTask();activeRole=null;paintRole();changeModel();nav();$('#composer-hint').hidden=false;}
  function preset(id){show('workspace');const chosen=api.selectedSkills;if(api.active)api.newTask();api.setSkills(chosen);api.selectPreset(id);nav();}
  $('#tools-home').addEventListener('click',()=>show('tools'));$('#tasks-home').addEventListener('click',()=>{project=null;filter='全部';show('tasks');});
  $('#new-task').addEventListener('click',()=>{project=null;activeRole=null;paintRole();$('#composer-hint').hidden=false;nav();projectsList();});
  function createProject(){$('#project-form').reset();$('#project-dialog-title').textContent='创建项目';$('#project-dialog .dialog-intro').textContent='同一项目中的对话，直接在侧栏展开。';open('project-dialog');}
  $('#create-project').addEventListener('click',()=>createProject());
  $('#project-form').addEventListener('submit',e=>{e.preventDefault();const name=$('#project-name').value.trim();if(!name){$('#project-name').setCustomValidity('请输入项目名称');$('#project-name').reportValidity();return;}const id='project-'+Date.now();projects.push({id,name});expandedProjects.add(id);$('#project-dialog').close();$('#project-list').hidden=false;$('#projects-toggle').setAttribute('aria-expanded','true');project=id;newTask();projectsList();$('#prompt').focus();});$('#project-name').addEventListener('input',()=>$('#project-name').setCustomValidity(''));
  $('#projects-toggle').addEventListener('click',()=>{const open=$('#project-list').hidden;$('#project-list').hidden=!open;$('#projects-toggle').setAttribute('aria-expanded',String(open));});
  $('#theme-toggle').addEventListener('click',()=>window.ReizoTheme.toggle());
  $('#close-sidebar').addEventListener('click',()=>{if(innerWidth>760)document.body.classList.add('sidebar-collapsed');});$('#open-sidebar').addEventListener('click',()=>document.body.classList.remove('sidebar-collapsed'));
  let downloadTask=null;
  const resultFooter=$('#artifact-dialog .dialog-footer');const download=document.createElement('button');download.id='download-result';download.className='plain-button';download.textContent='下载文档 ↓';download.hidden=true;resultFooter.prepend(download);
  const origin=document.createElement('button');origin.id='result-origin';origin.className='plain-button';origin.textContent='回到来源任务 ↗';origin.hidden=true;resultFooter.prepend(origin);
  function previewResult(t){downloadTask=t;api.result(t);$('#artifact-content').insertAdjacentHTML('afterbegin',`<div class="result-detail-preview">${resultArtwork(t)}</div>${t.example&&t.scenario.visual?`<div class="sample-downloads"><a href="${window.ReizoSamples.studio}" download="产品主图.png">下载产品主图 ↓</a><a href="${window.ReizoSamples.lifestyle}" download="生活场景.png">下载场景图 ↓</a></div>`:''}`);download.hidden=origin.hidden=false;}
  download.addEventListener('click',()=>{if(!downloadTask)return;const t=downloadTask;const content='# '+t.scenario.result+'\n\n> 交互原型中的预写方案，非模型生成结果。\n\n'+t.scenario.sections.join('\n\n');const url=URL.createObjectURL(new Blob([content],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=t.scenario.result;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  origin.addEventListener('click',()=>{if(!downloadTask)return;$('#artifact-dialog').close();openTask(downloadTask.id);});$('#artifact-dialog').addEventListener('close',()=>{download.hidden=origin.hidden=true;downloadTask=null;});
  document.addEventListener('input',e=>{if(e.target.id==='tools-search'){search=e.target.value;paintTools();}if(e.target.id==='task-search'){taskSearch=e.target.value;dashboardRows();}});
  document.addEventListener('change',e=>{if(e.target.id==='task-category'){taskCategory=e.target.value;dashboardRows();}});
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;
    if(d.reviewNew!==undefined)newTask();
    if(d.reviewTask)openTask(d.reviewTask);
    if(d.task){project=api.active?.project||null;activeRole=api.active?.role||null;paintRole();show('workspace');changeModel();nav();projectsList();}
    if(d.scenario){show('workspace');nav();}
    if(d.status){filter=d.status;renderLibrary();}
    if(d.project){if(expandedProjects.has(d.project))expandedProjects.delete(d.project);else expandedProjects.add(d.project);projectsList();$(`[data-project="${d.project}"]`).focus();}
    if(d.projectMore){if(fullProjects.has(d.projectMore))fullProjects.delete(d.projectMore);else fullProjects.add(d.projectMore);projectsList();}
    if(d.projectNew){project=d.projectNew;newTask();$('#studio-location').textContent=projects.find(p=>p.id===project).name+' / 新任务';projectsList();$('#prompt').focus();}
    if(d.clearTasks!==undefined){taskSearch='';taskCategory='全部';filter='全部';renderLibrary();}
    if(d.toolTab){tab=d.toolTab;category='全部';search='';renderLibrary();}
    if(d.resultFilter){resultFilter=d.resultFilter;renderLibrary();}
    if(d.category){category=d.category;renderLibrary();}
    if(d.useTool){const t=tools.find(t=>t.name===d.useTool);preset(t.scene);if(t.prompt){$('#prompt').value=t.prompt;$('#prompt').dispatchEvent(new Event('input'));}}
    if(d.addSkill){const values=api.selectedSkills;const removing=values.includes(d.addSkill);api.setSkills(removing?values.filter(s=>s!==d.addSkill):[...values,d.addSkill]);paintTools();const action=$('#use-selected-skills');action.hidden=!api.selectedSkills.length;action.textContent='带入任务 · '+api.selectedSkills.length+' 项能力 →';api.notify(removing?'已移除能力':'已添加能力');}
    if(d.useRole){const role=roles.find(r=>r.id===d.useRole);const retained=api.selectedSkills.filter(s=>!roles.find(r=>r.id===activeRole)?.skills.includes(s));preset(role.scene);activeRole=role.id;api.setSkills([...new Set([...retained,...role.skills])]);paintRole();$('#prompt').focus();}
    if(b.id==='use-selected-skills'){const skills=api.selectedSkills;if(api.active)newTask();api.setSkills(skills);show('workspace');$('#prompt').focus();}
    if(b.id==='remove-role'){activeRole=null;paintRole();}
    if(d.model){api.setModel(d.model);changeModel();dismissDropdown('model-dialog');}
    if(d.mode){mode=d.mode;$('#mode-toggle').innerHTML=esc(mode)+' <span>⌄</span>';$('#mode-dialog').querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));dismissDropdown('mode-dialog');$('#prompt').placeholder=mode==='Agent'?'描述目标，或添加你要处理的资料…':mode==='对话'?'你想聊些什么？':'描述你想完成的'+mode+'任务…';if(mode==='画布')api.showCanvas(true);}
    if(d.moveTask){movingTask=d.moveTask;$('#move-project-options').innerHTML=[{id:'none',name:'不归属项目'},...projects].map(p=>`<button data-assign-project="${p.id}"><span>${esc(p.name)}</span><span>→</span></button>`).join('');open('move-project-dialog');}
    if(d.assignProject){const t=api.tasks.find(t=>t.id===movingTask);if(t)t.project=d.assignProject==='none'?null:d.assignProject;$('#move-project-dialog').close();if(view==='tasks')renderLibrary();projectsList();}
    if(d.previewResult){const t=api.tasks.find(t=>t.id===d.previewResult);if(t)previewResult(t);}
    if(d.result){downloadTask=api.tasks.find(t=>t.id===d.result);download.hidden=origin.hidden=!downloadTask;}
    if(b.id==='review-dashboard'||b.id==='dashboard-quota')api.openAccount('billing');
    if(b.id==='refresh-dashboard'){renderLibrary();api.notify('任务看板已更新');}
  });
  $('#composer').addEventListener('submit',()=>{if(!api.active)return;api.active.mode=mode;api.active.role=activeRole;api.active.preferences={image:$('#image-preference').value,video:$('#video-preference').value,execution:$('#run-preference').value};api.active.project=project;$('#composer-hint').hidden=true;nav();projectsList();});
  // Useful examples are explicitly labelled, rather than impersonating account history.
  new MutationObserver(()=>{nav();if(view==='tasks'||view==='results')renderLibrary();}).observe($('#conversation'),{childList:true});
  Object.values(dropdownTriggers).forEach(id=>$('#'+id).setAttribute('aria-expanded','false'));
  api.seed();api.tasks.forEach((t,i)=>{if(t.example){t.usageTokens=[186000,92000,56000,34000,118000,74000][i]||0;if(i<4)t.project='launch';}});projectsList();changeModel();nav();
})();
