/* Homepage-only local sign-in preview. No account request or navigation. */
(() => {
  const dialog=document.querySelector('#site-login-dialog'),session=window.ReizoDemoSession;
  if(!dialog || !session)return;
  const $=selector=>dialog.querySelector(selector);
  const form=$('#site-login-form'),username=$('#site-login-user'),password=$('#site-login-password'),error=$('#site-login-error');
  let opener=null;
  function paint(){
    document.querySelectorAll('.site-account-link').forEach(trigger=>{
      if(!session.active){trigger.setAttribute('role','button');trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls',dialog.id);trigger.removeAttribute('aria-expanded');}
    });
  }
  function open(trigger){
    if(session.active || dialog.open)return;
    opener=trigger;form.reset();username.value='Jason';password.value='Reizo2026!';password.type='password';error.textContent='';
    $('#site-login-visibility').setAttribute('aria-label','显示密码');
    $('#site-login-visibility').setAttribute('aria-pressed','false');
    dialog.showModal();document.body.classList.add('site-login-open');username.focus();
  }
  function close(){dialog.close();}
  function complete(){
    // Close login before opening the welcome overlay, preserving the homepage.
    close();session.set(true);
  }
  form.addEventListener('submit',event=>{
    event.preventDefault();if(!form.reportValidity())return;
    if(username.value.trim().toLowerCase()!=='jason'||password.value!=='Reizo2026!'){
      error.textContent='账户或密码不正确，请重试。';password.focus();return;
    }
    complete();
  });
  $('#site-login-close').addEventListener('click',close);
  dialog.querySelectorAll('[data-site-login-provider]').forEach(button=>button.addEventListener('click',complete));
  $('#site-login-visibility').addEventListener('click',()=>{
    const visible=password.type==='password';password.type=visible?'text':'password';
    $('#site-login-visibility').setAttribute('aria-label',visible?'隐藏密码':'显示密码');
    $('#site-login-visibility').setAttribute('aria-pressed',String(visible));
  });
  dialog.addEventListener('click',event=>{
    if(event.target!==dialog)return;
    const rect=dialog.getBoundingClientRect();
    if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();
  });
  dialog.addEventListener('close',()=>{
    password.value='';error.textContent='';document.body.classList.remove('site-login-open');opener?.focus();
  });
  window.addEventListener('reizo:demo-session',()=>{paint();if(session.active&&dialog.open)close();});
  window.addEventListener('pageshow',paint);
  window.ReizoSiteLogin={open};paint();
})();
