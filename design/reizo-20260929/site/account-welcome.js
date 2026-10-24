/* Review mode: once per login. Release configuration: frequency: 'daily'.
   No server tracking; greetings use the visitor's computer clock. */
(() => {
  // Embedded account login is presented by the workspace's top-level surface.
  if (window.parent !== window || !window.ReizoDemoSession) return;
  const key='reizo:welcome-day:Jason:v1';
  const frequency=window.REIZO_WELCOME_CONFIG?.frequency === 'daily' ? 'daily' : 'login';
  let memoryDay='',overlay=null,glassTimer=null,holdTimer=null,removeTimer=null;
  let wasActive=window.ReizoDemoSession.active,pendingLogin=false,leaving=false;
  let exitDuration=900;
  const day=()=>{const now=new Date();return [now.getFullYear(),now.getMonth()+1,now.getDate()].join('-');};
  const greetingText=()=>{
    const hour=new Date().getHours();
    const greeting=hour>=5&&hour<11?'早上好':hour>=11&&hour<14?'中午好':hour>=14&&hour<18?'下午好':'晚上好';
    return greeting+'，Jason';
  };
  const read=store=>{try{return store.getItem(key)||'';}catch{return '';}};
  const write=(store,value)=>{try{store.setItem(key,value);}catch{}};
  // Accessing storage itself may throw in privacy-restricted contexts.
  const storage=name=>{try{return window[name];}catch{return null;}};
  function remove(){
    clearTimeout(glassTimer);clearTimeout(holdTimer);clearTimeout(removeTimer);
    overlay?.close();overlay?.remove();overlay=null;leaving=false;
  }
  function dismiss(immediate=false){
    if(!overlay)return;
    clearTimeout(glassTimer);clearTimeout(holdTimer);
    if(immediate){remove();return;}
    if(leaving)return;
    leaving=true;
    overlay.classList.add('is-leaving');
    clearTimeout(removeTimer);removeTimer=setTimeout(remove,exitDuration);
  }
  function showIfDue(){
    if(!window.ReizoDemoSession.active || document.visibilityState==='hidden')return;
    const today=day();
    if(overlay)return;
    if(frequency==='login'){
      if(!pendingLogin)return;
      pendingLogin=false;
    }else{
      if(memoryDay===today || read(storage('localStorage'))===today || read(storage('sessionStorage'))===today)return;
      memoryDay=today;write(storage('localStorage'),today);write(storage('sessionStorage'),today);
    }
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timing=reduced?{glass:150,text:150,hold:2000,exit:200}:{glass:720,text:900,hold:2000,exit:900};
    exitDuration=timing.exit;
    const text=greetingText();
    const layer=document.createElement('dialog');layer.className='account-welcome';
    layer.setAttribute('aria-label',text);
    const greeting=document.createElement('p');greeting.setAttribute('role','status');greeting.textContent=text;layer.append(greeting);
    overlay=layer;document.body.append(layer);
    layer.showModal();
    layer.addEventListener('click',()=>dismiss());
    layer.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(overlay!==layer)return;
      layer.classList.add('is-visible');
      // Glass first, then falling text, then two full seconds of stable reading.
      glassTimer=setTimeout(()=>{
        if(overlay!==layer || leaving)return;
        layer.classList.add('is-readable');
        holdTimer=setTimeout(()=>dismiss(),timing.text+timing.hold);
      },timing.glass);
    }));
  }
  window.addEventListener('reizo:demo-session',()=>{
    const active=window.ReizoDemoSession.active;
    if(active && !wasActive)pendingLogin=true;
    wasActive=active;
    if(active)showIfDue();
    else{pendingLogin=false;dismiss(true);}
  });
  window.addEventListener('pageshow',showIfDue);
  window.addEventListener('pagehide',remove);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')dismiss(true);else showIfDue();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&overlay){event.preventDefault();event.stopImmediatePropagation();dismiss();}},true);
  showIfDue();
})();
