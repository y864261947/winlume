/* Account navigation only. Demo identity is isolated in demo-session/account-demo. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const embedded = new URLSearchParams(location.search).get('embedded') === '1';
  document.body.classList.toggle('account-embedded', embedded);
  const sections = ['overview','billing','membership','settings','developer','keys','logs','team','settlement','security','preferences','login','referrals'];
  const links = [...document.querySelectorAll('[data-account-section]')];
  function showSection(name, focus = false) {
    if (!sections.includes(name)) name = 'overview';
    sections.forEach(id => { $('#' + id).hidden = id !== name; });
    links.forEach(link => {
      if (link.dataset.accountSection === name) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.title = $('#' + name + '-title').textContent + ' — 睿舟 REIZO';
    if (focus) $('#' + name + '-title').focus({ preventScroll: false });
  }
  links.forEach(link => link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const name = link.dataset.accountSection;
    if (!sections.includes(name)) return;
    history.pushState(null, '', '#' + name);
    showSection(name, true);
  }));
  window.addEventListener('hashchange', () => showSection(location.hash.slice(1)));
  window.addEventListener('popstate', () => showSection(location.hash.slice(1)));
  if (embedded) {
    document.querySelectorAll('[data-account-exit]').forEach(link => {
      link.setAttribute('target', '_blank');link.setAttribute('rel', 'noopener');
    });
    document.addEventListener('keydown', event => {
      // Only an Escape signal, never account data. File previews have an opaque origin.
      if (event.key === 'Escape' && !$('#account-action-dialog')?.open) window.parent.postMessage({ type: 'reizo:close-account' }, '*');
    });
  }
  const menu = $('.menu-toggle'), nav = $('#main-nav');
  function closeNav(){nav.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','展开导航');}
  menu.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true';nav.classList.toggle('open',open);menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'收起导航':'展开导航'); });
  nav.addEventListener('click', event => { if(event.target.closest('a')) closeNav(); });
  document.addEventListener('keydown', event => { if(event.key === 'Escape') closeNav(); });
  showSection(location.hash.slice(1));
})();
