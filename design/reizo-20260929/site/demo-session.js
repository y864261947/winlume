/* Explicit design preview only. Never use this flag for real authentication. */
(() => {
  const key = 'reizo:design-demo:v1';
  let active = false;
  try { active = sessionStorage.getItem(key) === 'Jason'; } catch {}
  function paint() {
    document.querySelectorAll('.site-account-link').forEach(link => {
      const label = link.querySelector('span');
      if (label) label.textContent = active ? 'J' : '登录';
      link.classList.toggle('is-signed-in',active);
      link.setAttribute('aria-label', active ? '打开 Jason 的账户菜单' : '登录账户');
    });
    const account = document.querySelector('#account-toggle');
    if (account) {
      account.querySelector('strong').textContent = active ? 'Jason' : '我的账户';
      account.querySelector('small').textContent = active ? 'Pro 专业' : '未登录';
    }
  }
  function set(value, notify = true) {
    active = value === true;
    try { if (active) sessionStorage.setItem(key, 'Jason'); else sessionStorage.removeItem(key); } catch {}
    paint();
    window.dispatchEvent(new CustomEvent('reizo:demo-session', {detail:{active}}));
    if (!active) document.dispatchEvent(new CustomEvent('reizo:demo-logout'));
    // Only the non-sensitive preview flag is sent; the parent validates the iframe source.
    if (notify && window.parent !== window) window.parent.postMessage({type:'reizo:demo-session',active}, '*');
    const frame = document.querySelector('#account-frame');
    if (notify && frame?.contentWindow) frame.contentWindow.postMessage({type:'reizo:demo-session',active}, '*');
  }
  window.ReizoDemoSession = { get active() { return active; }, set };
  window.addEventListener('message', event => {
    const frame = document.querySelector('#account-frame');
    if (frame && event.source === frame.contentWindow && event.data?.type === 'reizo:demo-session' && typeof event.data.active === 'boolean') set(event.data.active, false);
    if (window.parent !== window && event.source === window.parent && event.data?.type === 'reizo:demo-session' && typeof event.data.active === 'boolean') set(event.data.active, false);
  });
  window.addEventListener('pageshow', () => {
    try { const saved = sessionStorage.getItem(key) === 'Jason'; if (saved !== active) { set(saved, false); return; } } catch {}
    paint();
  });
  paint();
})();
