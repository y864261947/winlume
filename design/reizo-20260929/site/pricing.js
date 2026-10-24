(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  // Draft monthly tiers supplied by REIZO. No checkout, billing or account mutation.
  const plans = Object.freeze({
    core: { name: 'Core 基础', price: 29, credits: 10000, concurrent: 1, rate: 975, discount: '9.75 折' },
    plus: { name: 'Plus 进阶', price: 69, credits: 30000, concurrent: 2, rate: 950, discount: '9.5 折' },
    pro: { name: 'Pro 专业', price: 129, credits: 80000, concurrent: 4, rate: 925, discount: '9.25 折' },
    max: { name: 'Max 旗舰', price: 229, credits: 180000, concurrent: 6, rate: 900, discount: '9 折' }
  });
  const number = value => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format(value);
  const planDialog = $('#plan-dialog');
  function showPlan(id) {
    if (id !== 'payg' && !Object.hasOwn(plans, id)) return;
    const plan = plans[id];
    $('#plan-dialog-title').textContent = plan ? plan.name : '按量使用';
    $('#plan-dialog-price').textContent = plan ? '¥' + plan.price + ' / 月' : '无订阅月费，按实际用量付费';
    const rows = plan ? [
      ['每月包含', number(plan.credits) + ' Credits'],
      ['工作台同时进行', plan.concurrent + ' 个任务，超出后排队'],
      ['每日登录体验额度', '100 点，当日有效，仅限工作台'],
      ['包含额度有效期', '当前订阅月'],
      ['超出套餐的用量', plan.discount + '（会员有效期内）'],
      ['另购余额', '长期有效，购买价不打折'],
      ['会员到期后', '另购余额恢复标准扣减'],
      ['使用范围', 'Agent 工作台与 API 共用']
    ] : [
      ['是否需要会员', '不需要'],
      ['每日登录体验额度', '100 点，当日有效，仅限工作台'],
      ['使用范围', 'Agent 工作台与 API 共用'],
      ['用量扣减', '标准费率'],
      ['购买额度有效期', '长期有效'],
      ['充值规格与价格', '尚待配置']
    ];
    $('#plan-summary').innerHTML = rows.map(([title, value]) => '<div><dt>' + title + '</dt><dd>' + value + '</dd></div>').join('');
    $('#plan-dialog-note').textContent = plan
      ? '当前页面尚未接入支付；选择方案不会创建订单或扣费。实际开通前需确认结算价格与规则。'
      : '当前页面尚未接入充值。Credit 兑换比例、充值金额和支付方式尚待配置，本次不会创建订单或扣费。';
    planDialog.showModal();
  }
  document.querySelectorAll('[data-plan]').forEach(button => button.addEventListener('click', () => showPlan(button.dataset.plan)));
  $('#plan-dialog-close').addEventListener('click', () => planDialog.close());
  $('#plan-dialog-back').addEventListener('click', () => planDialog.close());
  planDialog.addEventListener('click', e => { if (e.target === planDialog) { const r = planDialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) planDialog.close(); } });
  // Shared navigation and footer behavior; homepage animation script is intentionally not loaded.
  function closeNav(){$('#main-nav').classList.remove('open');$('.menu-toggle').setAttribute('aria-expanded','false');$('.menu-toggle').setAttribute('aria-label','展开导航');}
  $('.menu-toggle').addEventListener('click',e=>{const b=e.currentTarget;const open=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',String(open));b.setAttribute('aria-label',open?'收起导航':'展开导航');$('#main-nav').classList.toggle('open',open);});
  $('#main-nav').addEventListener('click',e=>{if(e.target.closest('a'))closeNav();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeNav();});
  const footerDialog=$('#footer-dialog');
  footerDialog.querySelector('.dialog-close').addEventListener('click',()=>footerDialog.close());
  document.addEventListener('click',e=>{const b=e.target.closest('[data-label],[data-info]');if(b){$('#footer-dialog-title').textContent=b.dataset.label||b.textContent.trim();footerDialog.showModal();}});
  const languageToggle=$('#language-toggle'),languageMenu=$('#language-menu');
  function closeLanguage(){if(languageMenu){languageMenu.hidden=true;languageToggle.setAttribute('aria-expanded','false');}}
  languageToggle?.addEventListener('click',()=>{const open=languageMenu.hidden;languageMenu.hidden=!open;languageToggle.setAttribute('aria-expanded',String(open));});
  $('#language-menu button')?.addEventListener('click',closeLanguage);
  document.addEventListener('click',e=>{if(!e.target.closest('.language-picker'))closeLanguage();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){const open=languageMenu&&!languageMenu.hidden;closeLanguage();if(open)languageToggle.focus();}});
  const socialIcons=[
    ['Facebook','<path d="M14 21v-8h3l.5-4H14V7c0-1 .4-1.7 1.8-1.7H18V2.2C17.5 2.1 16.2 2 15 2c-3 0-5 1.8-5 5v2H7v4h3v8z"/>'],
    ['X','<path d="M18.5 2H22l-7.6 8.7L23 22h-6.7l-5.2-6.8L5.2 22H1.7l7.8-9L1 2h6.8l4.7 6.3L18.5 2zm-1.2 18h1.9L6.7 4H4.8z"/>'],
    ['LinkedIn','<path d="M3 8h4v14H3V8zm2-6a2.3 2.3 0 1 0 0 4.6A2.3 2.3 0 0 0 5 2zm5 6h4v2c.8-1.4 2.1-2.3 4.2-2.3 4 0 4.8 2.6 4.8 6V22h-4v-7.3c0-1.8 0-4-2.4-4S14 12.7 14 14.5V22h-4z"/>'],
    ['GitHub','<path d="M12 2a10 10 0 0 0-3.16 19.5c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.64-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03A9.6 9.6 0 0 1 12 7c.85 0 1.71.11 2.51.34 1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.58c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/>'],
    ['Instagram','<g fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/></g><circle cx="17.5" cy="6.5" r="1"/>'],
    ['TikTok','<path d="M14 2h3c.2 2.3 1.5 4 4 4.3v3.3c-1.5 0-2.8-.5-4-1.2V16a6 6 0 1 1-6-6v3.4a2.7 2.7 0 1 0 3 2.6V2z"/>'],
    ['电话','<path d="M6.6 2.5 3.3 4.2c-3 5.1 8.3 17.5 14.1 16.8l3.8-3.7-4.8-4-2.6 2.4c-2.4-1.2-4.4-3.2-5.5-5.6l2-2.3z"/>'],
    ['WhatsApp','<g fill="none" stroke="currentColor" stroke-width="1.7"><path d="m3 21 1.5-5A9 9 0 1 1 8 20z"/><path d="M8 7c-3 3 4 10 7 7l-2-2-1 1-3-3 1-1z"/></g>']
  ];
  $('#socials').innerHTML=socialIcons.map(([name,svg])=>'<button data-label="'+name+'" aria-label="'+name+'" title="'+name+'"><svg viewBox="0 0 24 24" aria-hidden="true">'+svg+'</svg></button>').join('');

})();
