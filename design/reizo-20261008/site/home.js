/* Homepage demonstrations: deterministic examples, no generated claims or network calls. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  // Appearance is shared with all product pages through site-theme.js.
  const menu=$('.menu-toggle'),nav=$('#main-nav');
  function closeMenu(){nav.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','展开导航');}
  menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';nav.classList.toggle('open',open);menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'关闭导航':'展开导航');});
  nav.addEventListener('click',e=>{if(e.target.closest('a'))closeMenu();});
  document.addEventListener('click',e=>{if(!e.target.closest('.site-header'))closeMenu();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&nav.classList.contains('open')){closeMenu();menu.focus();}});
  matchMedia('(min-width: 851px)').addEventListener('change',e=>{if(e.matches)closeMenu();});
  const scenes=window.ReizoShowcaseScenes;
  let active='design',step=motion.matches?scenes.design.steps.length:1,paused=motion.matches,visible=false,timer=null;
  // Each preview is assembled in the same order as its conversation, rather than shown all at once.
  const canvasStages={
    design:[['.sports-primary figure:nth-child(2)','.sports-secondary figure:nth-child(3)'],['.sports-primary figure:nth-child(1)'],['.sports-primary figure:nth-child(3)','.sports-secondary figure:nth-child(1)','.sports-secondary figure:nth-child(2)'],['.sports-banner']],
    video:[['.drama-cover'],['.drama-frames>div:nth-child(1)'],['.drama-frames>div:nth-child(2)','.drama-frames>div:nth-child(3)','.drama-frames>div:nth-child(4)'],['.drama-play','.drama-controls'],['.showcase-file']],
    marketing:[['.preview-heading','.calendar-days>div:nth-child(-n+2)'],['.calendar-days>div:nth-child(3)','.calendar-days>div:nth-child(4)'],['.content-excerpt','.calendar-days>div:nth-child(n+5)'],['.showcase-file']],
    website:[['.winery-browser','.winery-page>header','.winery-landscape'],['.winery-page>footer'],['.winery-phone'],['.showcase-file:nth-child(1)'],['.showcase-file:nth-child(n+2)']],
    legal:[['.preview-heading','.contract-sheet'],['.contract-sheet mark','.contract-sheet .annotation'],['.payment-preview'],['.showcase-file']],
    product:[['.haircare-brief .preview-heading','.haircare-pack .bottle.tall'],['.haircare-brief dl'],['.haircare-pack .bottle.jar'],['.haircare-pack>small','.haircare-pack>em'],['.showcase-file']],
    office:[['.preview-heading','.kanban-columns>section:nth-child(1)'],['.kanban-columns>section:nth-child(2)'],['.kanban-columns>section:nth-child(3)'],['.showcase-file']],
    research:[['.preview-heading','.research-tables>div:nth-child(1)'],['.model-diagram'],['.research-tables>div:nth-child(2)'],['.showcase-file:nth-child(1)'],['.showcase-file:nth-child(n+2)']]
  };
  function prepareCanvas(){
    const canvas=$('#demo-canvas');
    canvasStages[active].forEach((selectors,i)=>selectors.forEach(selector=>{
      canvas.querySelectorAll(selector).forEach((node,j)=>{
        node.classList.add('canvas-reveal');node.dataset.revealStep=String(i+1);
        node.style.setProperty('--reveal-delay',`${Math.min(j,3)*100}ms`);
      });
    }));
  }
  function renderScene(){
    const s=scenes[active],group=active;
    $('#demo-conversation').innerHTML=`<div class="demo-conversation-title"><img src="assets/reizo-mark.png" alt=""><strong>${s.title}</strong><span aria-hidden="true">⌄</span></div><p class="demo-prompt">${s.prompt}</p><div class="demo-agent-card"><div class="demo-agent-label"><img src="assets/reizo-mark.png" alt=""><strong>REIZO Agent</strong><span class="demo-phase" aria-live="polite"></span></div><ol class="demo-steps">${s.steps.map(t=>`<li><i aria-hidden="true"></i><span>${t}</span></li>`).join('')}</ol><p class="demo-response" aria-live="polite"></p></div><div class="demo-file"><i>${s.type}</i><div>${s.file}<small>${s.note}</small></div></div>`;
    $('#demo-canvas').innerHTML=`<div class="canvas-content display-only-preview"><div class="canvas-meta"><span>${s.meta}</span><span data-canvas-progress aria-live="polite"></span></div>${s.canvas}</div>`;
    prepareCanvas();
    $('#demo-canvas').scrollTop=0;$('#demo-conversation').scrollTop=0;
    $$('[data-scene]').forEach(b=>{const selected=b.dataset.scene===group;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});
    $('#scene-panel').setAttribute('aria-labelledby',`tab-${group}`);paintStep();schedule();
  }
  function paintStep(){
    const s=scenes[active];
    $$('.demo-steps li').forEach((li,i)=>{const done=i<step-1||step>=s.steps.length;li.className=done?'done':i===step-1?'current':'pending';li.querySelector('i').textContent=done?'✓':'·';});
    const response=$('.demo-response');
    response.textContent=step>=s.steps.length?s.messages[s.messages.length-1]:s.messages[Math.max(0,step-1)];
    response.classList.remove('is-updating');void response.offsetWidth;response.classList.add('is-updating');
    $('.demo-phase').textContent=step>=s.steps.length?'已整理完成':`正在推进 ${Math.max(1,step)} / ${s.steps.length}`;
    $('.demo-file').hidden=step<s.steps.length;
    $$('.canvas-reveal').forEach(node=>node.classList.toggle('is-shown',Number(node.dataset.revealStep)<=step));
    $('[data-canvas-progress]').textContent=step>=s.steps.length?'成果预览':`正在构建 ${step} / ${s.steps.length}`;
  }
  function schedule(){
    clearTimeout(timer);
    if(paused||!visible||document.hidden||motion.matches)return;
    const complete=step>=scenes[active].steps.length;
    timer=setTimeout(()=>{
      if(complete){
        const tabs=$$('[data-scene]');
        const next=(tabs.findIndex(tab=>tab.dataset.scene===active)+1)%tabs.length;
        selectScene(tabs[next].dataset.scene);
        return;
      }
      step++;paintStep();schedule();
    },complete?1300:1200);
  }
  function selectScene(key){active=key;step=motion.matches?scenes[key].steps.length:1;renderScene();}
  motion.addEventListener('change',()=>{paused=motion.matches;if(motion.matches)step=scenes[active].steps.length;paintStep();schedule();});
  $$('[data-scene]').forEach(b=>b.addEventListener('click',()=>selectScene(b.dataset.scene)));
  $('.scene-tabs').addEventListener('keydown',e=>{
    const tabs=$$('[data-scene]'),i=tabs.indexOf(document.activeElement);if(i<0||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
    tabs[next].focus();tabs[next].click();tabs[next].scrollIntoView({block:'nearest',inline:'nearest',behavior:motion.matches?'instant':'smooth'});
  });
  // Pause off-screen; manual selection restarts that scene, and finished scenes advance in tab order.
  new IntersectionObserver(([e])=>{visible=e.isIntersecting;schedule();},{threshold:.15}).observe($('#scene-panel'));
  document.addEventListener('visibilitychange',schedule);renderScene();
  const code={
    python:'from openai import OpenAI\n\nclient = OpenAI(\n    api_key="YOUR_API_KEY",\n    base_url="YOUR_REIZO_API_BASE"\n)\n\nresponse = client.chat.completions.create(\n    model="YOUR_MODEL_ID",\n    messages=[{"role": "user", "content": "你好"}]\n)\nprint(response.choices[0].message.content)',
    javascript:'import OpenAI from "openai";\n\nconst client = new OpenAI({\n  apiKey: process.env.REIZO_API_KEY,\n  baseURL: process.env.REIZO_API_BASE\n});\n\nconst response = await client.chat.completions.create({\n  model: "YOUR_MODEL_ID",\n  messages: [{ role: "user", content: "你好" }]\n});\nconsole.log(response.choices[0].message.content);',
    curl:'curl "$REIZO_API_BASE/chat/completions" \\\n  -H "Authorization: Bearer $REIZO_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "model": "YOUR_MODEL_ID",\n    "messages": [\n      {"role": "user", "content": "你好"}\n    ]\n  }\''
  };
  let language='python',toastTimer;
  function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),2600);}
  function paintCode(){ $('#code-content').textContent=code[language];const pane=$('.api-example pre');pane.scrollTop=0;pane.scrollLeft=0;$$('[data-code]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.code===language))); }
  $$('[data-code]').forEach(b=>b.addEventListener('click',()=>{language=b.dataset.code;paintCode();}));
  $('#copy-code').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(code[language]);toast('代码已复制');}catch{toast('暂时无法复制，请选中代码手动复制。');}});paintCode();
  const models=[['jina','Jina Reader'],['minimax','MiniMax'],['openrouter','OpenRouter'],['groq','Groq'],['elevenlabs','ElevenLabs'],['gemini','Gemini'],['deepseek','DeepSeek'],['qwen','通义千问']];
  const modelLinks=models.map(([id,name])=>`<a class="model-card" href="api.html?ui=20261007#catalog" aria-label="查看 ${name} 的模型目录"><img src="assets/${id}.svg" alt="" loading="lazy"><strong>${name}</strong></a>`).join('');
  $('#home-model-track').innerHTML=`<div class="model-set">${modelLinks}</div><div class="model-set" aria-hidden="true">${modelLinks.replaceAll('<a class=','<a tabindex="-1" class=')}</div>`;
  let modelPaused=false;
  $('#model-motion').addEventListener('click',()=>{modelPaused=!modelPaused;$('.model-marquee').classList.toggle('is-paused',modelPaused);$('#model-motion').setAttribute('aria-pressed',String(modelPaused));$('#model-motion').textContent=modelPaused?'▷':'Ⅱ';$('#model-motion').setAttribute('aria-label',modelPaused?'继续模型滚动':'暂停模型滚动');});
  document.body.classList.add('has-api-reveal');
  new IntersectionObserver(([entry])=>{
    $('#developers').classList.toggle('is-active',entry.isIntersecting);
  },{rootMargin:'-25% 0px -25% 0px'}).observe($('#developers'));
  // Native scrolling drives three mutually replacing panels and the gallery reveal.
  let scrollPending=false;
  const clamp=n=>Math.max(0,Math.min(1,n));
  const ease=n=>{const t=clamp(n);return t*t*(3-2*t);};
  function updateScroll(){
    scrollPending=false;$('.site-header').classList.toggle('is-compact',scrollY>70);
    const section=$('.story-section'),rect=section.getBoundingClientRect(),sticky=$('.story-sticky');
    const p=clamp((90-rect.top)/Math.max(1,rect.height-sticky.offsetHeight-90));
    const first=ease((p-.18)/.22),second=ease((p-.56)/.22);
    const positions=[-first*115,(1-first)*115-second*115,(1-second)*115];
    const opacity=[1-first,first*(1-second),second];
    $$('.story-phase').forEach((panel,i)=>{
      panel.style.setProperty('--phase-y',`${positions[i]}%`);
      panel.style.setProperty('--phase-opacity',String(opacity[i]));
      panel.setAttribute('aria-hidden',String(!(motion.matches||innerHeight<=600)&&opacity[i]<.5));
    });
    const gallery=$('#results'),stage=$('.gallery-stage'),galleryRect=gallery.getBoundingClientRect();
    const progress=clamp((90-galleryRect.top)/Math.max(1,gallery.offsetHeight-stage.offsetHeight-90));
    const height=stage.clientHeight,stride=height*.72;
    const pieces=$$('.gallery-piece');
    const slots=Math.max(...pieces.map(card=>Number(card.dataset.gallerySlot)))+1;
    const travel=(slots-1)*stride+height*1.05;
    pieces.forEach(card=>{
      const side=Number(card.dataset.gallerySide),slot=Number(card.dataset.gallerySlot);
      const y=height*(side?.02:.36)+slot*stride-progress*travel;
      const visibility=clamp((height-y)/70)*clamp((y+card.offsetHeight)/70);
      card.style.setProperty('--gallery-y',`${y}px`);
      card.style.setProperty('--gallery-opacity',String(motion.matches?1:visibility));
      card.style.setProperty('--gallery-angle',`${side?3:-3}deg`);
      card.setAttribute('aria-hidden',String(!motion.matches&&visibility===0));
    });
  }
  function onScroll(){if(!scrollPending){scrollPending=true;requestAnimationFrame(updateScroll);}}
  addEventListener('scroll',onScroll,{passive:true});addEventListener('resize',onScroll);updateScroll();
  motion.addEventListener('change',()=>{if(motion.matches){step=scenes[active].steps.length+1;paused=true;paintStep();}schedule();updateScroll();});
  const langToggle=$('#language-toggle'),langMenu=$('#language-menu');
  langToggle.addEventListener('click',()=>{langMenu.hidden=!langMenu.hidden;langToggle.setAttribute('aria-expanded',String(!langMenu.hidden));});
  document.addEventListener('click',e=>{if(!e.target.closest('.language-picker')){langMenu.hidden=true;langToggle.setAttribute('aria-expanded','false');}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!langMenu.hidden){langMenu.hidden=true;langToggle.setAttribute('aria-expanded','false');langToggle.focus();}});
})();
