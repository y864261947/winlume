(() => {
  const menu=document.querySelector('.menu-toggle'),nav=document.querySelector('#main-nav');
  const close=()=>{menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','展开导航');nav.classList.remove('open');};
  menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'收起导航':'展开导航');nav.classList.toggle('open',open);});
  nav.addEventListener('click',e=>{if(e.target.closest('a'))close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
})();
