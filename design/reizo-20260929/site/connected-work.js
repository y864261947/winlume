/* Product story only: this does not connect to or control any device. */
(() => {
  const section=document.querySelector('#connected-work');
  if(!section)return;
  const demo=section.querySelector('.connected-demo');
  const buttons=[...section.querySelectorAll('[data-connect-step]')];
  const toggle=section.querySelector('[data-connect-toggle]');
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const scenes=[
    ['正在拆分分镜与节奏','任务已开始','随时查看电脑上的处理进度。','等待确认方向','从电脑客户端发起，开始整理素材。'],
    ['分镜已就绪，等待你的确认','请确认视频风格','产品特写为主，搭配简洁的场景。','确认，采用这个方向','手机确认风格，把下一步指令发回电脑。'],
    ['已收到确认，继续生成与剪辑','指令已送达','电脑正在按确认的方向继续制作。','电脑继续处理中','不重开任务，电脑根据远程指令接续执行。'],
    ['✓ 视频已完成，等待验收','成果已同步','手机查看通知，网页接着验收成果。','短视频已完成','电脑完成制作，手机与网页同步查看成果。']
  ];
  const fields=['[data-remote-plan]','[data-remote-phone-title]','[data-remote-phone-copy]','[data-remote-phone-action]','[data-connect-caption]'].map(s=>section.querySelector(s));
  let phase=reduced.matches?3:0,paused=false,inView=!('IntersectionObserver' in window),timer=null;
  function paint(){
    demo.dataset.connectPhase=String(phase);
    buttons.forEach((button,i)=>button.setAttribute('aria-pressed',String(i===phase)));
    fields.forEach((field,i)=>{field.textContent=scenes[phase][i];});
  }
  function schedule(){
    clearTimeout(timer);timer=null;
    const stopped=paused||reduced.matches||document.hidden||!inView;
    demo.classList.toggle('is-still',stopped);
    toggle.hidden=reduced.matches;
    toggle.textContent=paused?'▶':'Ⅱ';
    toggle.setAttribute('aria-label',paused?'播放协同演示':'暂停协同演示');
    toggle.setAttribute('aria-pressed',String(paused));
    if(!stopped)timer=setTimeout(()=>{phase=(phase+1)%scenes.length;paint();schedule();},phase===3?5500:4200);
  }
  buttons.forEach((button,i)=>button.addEventListener('click',()=>{phase=i;paused=true;paint();schedule();}));
  toggle.addEventListener('click',()=>{paused=!paused;schedule();});
  document.addEventListener('visibilitychange',schedule);
  window.addEventListener('pagehide',()=>{clearTimeout(timer);timer=null;});
  window.addEventListener('pageshow',schedule);
  reduced.addEventListener('change',()=>{if(reduced.matches)phase=3;paint();schedule();});
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{inView=entries.some(entry=>entry.isIntersecting);schedule();},{threshold:.12}).observe(section);
  paint();schedule();
})();
