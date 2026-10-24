/* Local profile-photo preview. Images stay in this tab's browser session. */
(() => {
  const session=window.ReizoDemoSession;
  if(!session)return;
  const key='reizo:profile-avatar:Jason:v1',maxBytes=2*1024*1024;
  const valid=value=>typeof value==='string' && value.length<=Math.ceil(maxBytes*4/3)+100 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
  let avatar='',revision=0;
  try{const saved=sessionStorage.getItem(key);if(valid(saved))avatar=saved;}catch{}
  const input=document.querySelector('#profile-avatar-file'),status=document.querySelector('#profile-avatar-status');
  const defaultIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>';
  function circle(node,guestIcon=false){
    if(!node)return;
    node.replaceChildren();
    if(session.active && avatar){
      const image=document.createElement('img');image.src=avatar;image.alt='';node.append(image);
    }else if(session.active)node.textContent='J';
    else if(guestIcon)node.innerHTML=defaultIcon;
    else node.textContent='J';
  }
  function paint(){
    document.querySelectorAll('.site-account-link').forEach(link=>{
      link.classList.toggle('has-custom-avatar',session.active && !!avatar);
      const label=link.querySelector('span');
      if(session.active)circle(label);
      else if(label)label.textContent='登录';
    });
    document.querySelectorAll('.site-account-avatar').forEach(node=>circle(node));
    document.querySelectorAll('.ac-avatar, #account-toggle .account-avatar, #profile-avatar-preview').forEach(node=>circle(node,true));
    document.querySelectorAll('[data-avatar-choose]').forEach(button=>{button.disabled=!session.active;});
    const remove=document.querySelector('#profile-avatar-remove');
    if(remove)remove.hidden=!session.active || !avatar;
  }
  const targetOrigin=location.origin==='null'?'*':location.origin;
  function notify(){
    const payload={type:'reizo:avatar-change',avatar};
    if(window.parent!==window)window.parent.postMessage(payload,targetOrigin);
    const frame=document.querySelector('#account-frame');
    frame?.contentWindow?.postMessage(payload,targetOrigin);
  }
  function save(value,propagate=true){
    if(!session.active || (value!==''&&!valid(value)))return false;
    avatar=value;let persisted=true;
    try{if(avatar)sessionStorage.setItem(key,avatar);else sessionStorage.removeItem(key);}catch{persisted=false;}
    paint();if(propagate)notify();return persisted;
  }
  document.querySelectorAll('[data-avatar-choose]').forEach(button=>button.addEventListener('click',()=>{if(session.active)input?.click();}));
  input?.addEventListener('change',()=>{
    const file=input.files?.[0];input.value='';
    if(!file || !session.active)return;
    const ticket=++revision;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){status.textContent='请选择 JPG、PNG 或 WebP 图片。';return;}
    if(!file.size || file.size>maxBytes){status.textContent='图片需小于或等于 2 MB，请换一张图片。';return;}
    status.textContent='正在读取图片…';
    const reader=new FileReader();
    reader.onerror=()=>{if(ticket===revision)status.textContent='图片读取失败，请重试。';};
    reader.onload=()=>{
      if(ticket!==revision || !session.active)return;
      if(!valid(reader.result)){status.textContent='无法识别这张图片，请重新选择。';return;}
      const picture=new Image();
      picture.onerror=()=>{if(ticket===revision)status.textContent='图片无法打开，请换一张有效的图片。';};
      picture.onload=()=>{
        if(ticket!==revision || !session.active)return;
        if(!picture.naturalWidth || !picture.naturalHeight || picture.naturalWidth>8192 || picture.naturalHeight>8192){status.textContent='图片尺寸过大或无效，请选择边长不超过 8192 像素的图片。';return;}
        const stored=save(reader.result);
        status.textContent=stored?'头像已更新。':'头像已更新，当前页面有效。';
      };
      picture.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
  document.querySelector('#profile-avatar-remove')?.addEventListener('click',()=>{revision++;save('');if(status)status.textContent='已恢复默认头像。';});
  window.addEventListener('reizo:demo-session',()=>{revision++;if(status)status.textContent='';paint();});
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin || !session.active)return;
    const frame=document.querySelector('#account-frame');
    const fromChild=frame?.contentWindow && event.source===frame.contentWindow;
    const fromParent=window.parent!==window && event.source===window.parent;
    if(!fromChild && !fromParent)return;
    if(event.data?.type==='reizo:avatar-ready' && fromChild)frame.contentWindow.postMessage({type:'reizo:avatar-change',avatar},targetOrigin);
    if(event.data?.type==='reizo:avatar-change' && (event.data.avatar===''||valid(event.data.avatar))){revision++;save(event.data.avatar,false);}
  });
  window.addEventListener('pageshow',paint);
  paint();
  if(window.parent!==window)window.parent.postMessage({type:'reizo:avatar-ready'},targetOrigin);
})();
