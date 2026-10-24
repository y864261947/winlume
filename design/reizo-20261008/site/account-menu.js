/* Shared account disclosure. Identity and sign-out stay local to the design preview. */
(() => {
  const session = window.ReizoDemoSession;
  if (!session) return;
  const controls = [];
  function signOut() {
    session.set(false);
    // Remain on the page; only an open account centre returns to its login panel.
    document.querySelector('[data-account-section="login"]')?.click();
  }
  document.querySelectorAll('.site-account-link').forEach((trigger,index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'site-account-control';
    trigger.before(wrapper);wrapper.append(trigger);
    const panel = document.createElement('div');
    panel.className = 'site-account-dropdown';panel.id = 'site-account-dropdown-'+index;
    panel.hidden = true;panel.setAttribute('role','menu');panel.setAttribute('aria-label','账户菜单');
    panel.innerHTML = '<div class="site-account-summary" role="presentation"><span class="site-account-avatar" aria-hidden="true">J</span><div><strong>Jason</strong><small>Pro 专业</small></div></div><a role="menuitem" tabindex="-1" href="account.html#overview"><span>我的账户</span><span aria-hidden="true">↗</span></a><a role="menuitem" tabindex="-1" href="account.html#billing"><span>钱包与会员</span><span aria-hidden="true">↗</span></a><a role="menuitem" tabindex="-1" href="account.html#developer"><span>开发与协作</span><span aria-hidden="true">↗</span></a><div class="site-account-menu-divider" role="separator"></div><button type="button" role="menuitem" tabindex="-1" class="site-account-signout"><span>退出登录</span><span aria-hidden="true">↗</span></button>';
    wrapper.append(panel);
    const items = [...panel.querySelectorAll('[role="menuitem"]')];
    function close(focus=false){panel.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus();}
    function open(last=false){
      controls.forEach(control=>control.close());
      panel.hidden=false;trigger.setAttribute('aria-expanded','true');
      items[last?items.length-1:0].focus();
    }
    function paint(){
      close();
      trigger.href='account.html#login';
      trigger.setAttribute('aria-expanded','false');
      if(session.active){
        trigger.setAttribute('role','button');trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-controls',panel.id);
      }else{
        trigger.removeAttribute('role');trigger.removeAttribute('aria-haspopup');trigger.removeAttribute('aria-controls');trigger.removeAttribute('aria-expanded');
      }
    }
    trigger.addEventListener('click',event=>{
      if(!session.active){
        if(window.ReizoSiteLogin){event.preventDefault();window.ReizoSiteLogin.open(trigger);}
        return;
      }
      event.preventDefault();if(panel.hidden)open();else close(true);
    });
    trigger.addEventListener('keydown',event=>{
      if(!session.active){
        if(event.key===' ' && window.ReizoSiteLogin){event.preventDefault();window.ReizoSiteLogin.open(trigger);}
        return;
      }
      if(['ArrowDown','ArrowUp',' '].includes(event.key)){event.preventDefault();open(event.key==='ArrowUp');}
    });
    panel.addEventListener('keydown',event=>{
      const index=items.indexOf(document.activeElement);
      if(event.key==='Escape'){event.preventDefault();close(true);return;}
      if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
      event.preventDefault();
      const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
      items[next].focus();
    });
    panel.querySelector('button').addEventListener('click',()=>{close();signOut();trigger.focus();});
    panel.querySelectorAll('a').forEach(link=>link.addEventListener('click',event=>{
      const name=link.getAttribute('href').split('#')[1];
      const local=document.querySelector('[data-account-section="'+name+'"]');
      close();
      if(local){event.preventDefault();local.click();}
    }));
    document.addEventListener('click',event=>{if(!wrapper.contains(event.target))close();});
    document.addEventListener('focusin',event=>{if(!wrapper.contains(event.target))close();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden)close(true);});
    window.addEventListener('reizo:demo-session',paint);
    window.addEventListener('pageshow',paint);
    controls.push({close});paint();
  });
  // The workspace already has an account menu; add sign-out in the same place.
  const studioMenu=document.querySelector('#account-menu');
  if(studioMenu){
    const logout=document.createElement('button');logout.type='button';logout.className='studio-account-signout';logout.textContent='退出登录';
    studioMenu.append(logout);
    const paint=()=>{logout.hidden=!session.active;};
    logout.addEventListener('click',()=>{signOut();studioMenu.hidden=true;const trigger=document.querySelector('#account-toggle');trigger?.setAttribute('aria-expanded','false');trigger?.focus();});
    window.addEventListener('reizo:demo-session',paint);paint();
  }
})();
