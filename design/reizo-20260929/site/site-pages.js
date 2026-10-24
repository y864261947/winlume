/* New-site navigation and local briefing drafts. No network submission or persistence. */
(() => {
  const menu = document.querySelector('.menu-toggle'), nav = document.querySelector('#main-nav');
  const close = () => { nav.classList.remove('open'); menu.setAttribute('aria-expanded','false'); };
  menu?.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; nav.classList.toggle('open',open); menu.setAttribute('aria-expanded',String(open)); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  nav?.addEventListener('click', event => { if (event.target.closest('a')) close(); });
  document.querySelectorAll('[data-draft-form]').forEach(form => {
    const scope = form.querySelector('[data-draft-result]') || document.querySelector('[data-draft-result]');
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const rows = [...new FormData(form)].map(([key,value]) => key + '：' + (String(value).trim() || '未填写'));
      scope.querySelector('[data-draft-output]').textContent = form.dataset.draftForm + '\n\n' + rows.join('\n\n') + '\n\n本页草稿，尚未发送。';
      scope.querySelector('[data-copy-status]').textContent = '';
      scope.hidden = false;
      scope.scrollIntoView({block:'nearest'});
    });
    form.querySelector('[type="submit"]').disabled = false;
    scope.querySelector('.sub-copy').addEventListener('click', async () => {
      const status = scope.querySelector('[data-copy-status]');
      try { await navigator.clipboard.writeText(scope.querySelector('[data-draft-output]').textContent); status.textContent = '已复制。内容未向外发送。'; }
      catch { status.textContent = '无法自动复制，请手动选中上方摘要。'; }
    });
  });
})();
