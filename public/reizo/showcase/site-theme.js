/* One appearance preference for the homepage, product pages and embedded studio. */
(() => {
  'use strict';
  const key = 'reizo-theme', system = matchMedia('(prefers-color-scheme: dark)');
  const valid = value => ['auto', 'light', 'dark'].includes(value);
  let preference = 'auto';
  function read() { try { const value = localStorage.getItem(key); preference = valid(value) ? value : 'auto'; } catch {} }
  function apply() {
    const effective = preference === 'auto' ? (system.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = effective;
    if (document.body) document.body.dataset.theme = effective;
    document.querySelectorAll('[data-theme-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.themeChoice === preference)));
    const toggle = document.getElementById('theme-toggle');
    if (toggle) toggle.setAttribute('aria-label', effective === 'dark' ? '切换到浅色外观' : '切换到深色外观');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = effective === 'dark' ? '#15171b' : '#f7f8fa';
  }
  function set(value) { if (!valid(value)) return; preference = value; try { localStorage.setItem(key, value); } catch {} apply(); }
  window.ReizoTheme = { set, toggle: () => set(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark') };
  read(); apply();
  system.addEventListener('change', apply);
  window.addEventListener('storage', event => { if (event.key === key || event.key === null) { read(); apply(); } });
  window.addEventListener('pageshow', () => { read(); apply(); });
  document.addEventListener('DOMContentLoaded', () => {
    // Keep the electric-blue mark unchanged; only lift its black dots on dark surfaces.
    if (!document.getElementById('reizo-light-dots')) {
      const filters = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      filters.setAttribute('aria-hidden', 'true');
      filters.setAttribute('width', '0'); filters.setAttribute('height', '0');
      filters.style.position = 'absolute'; filters.style.pointerEvents = 'none';
      filters.innerHTML = '<defs><filter id="reizo-light-dots" color-interpolation-filters="sRGB"><feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -10 2 0" result="dark-pixels"/><feFlood flood-color="#fff" result="white"/><feComposite in="white" in2="dark-pixels" operator="in" result="white-dots"/><feComposite in="white-dots" in2="SourceAlpha" operator="in" result="clipped-dots"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="clipped-dots"/></feMerge></filter></defs>';
      document.body.prepend(filters);
    }
    apply();
    document.querySelectorAll('[data-theme-choice]').forEach(button => button.addEventListener('click', () => set(button.dataset.themeChoice)));
  });
})();
