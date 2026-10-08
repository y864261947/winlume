/* eslint-disable */
// Generated from the supplied design; managed by createDesignScope.
export default function initialize(lifetime) {
const { document, window, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, IntersectionObserver, ResizeObserver, MutationObserver } = lifetime;
(() => {
    'use strict';
    const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
    // Native details grouping, with a fallback for browsers without name support.
    const services = $$('.service-list > details');
    services.forEach(item => lifetime.listen(item, 'toggle', () => {
        if (item.open)
            services.forEach(other => { if (other !== item)
                other.open = false; });
    }));
    const scenarios = {
        finance: { title: '把对账与审核，<br>从反复核对变成有据可查。', copy: '整理订单、票据与流水，辅助识别差异；需要判断的异常，交给对应人员确认。', input: '订单 · 发票 · 收付款流水', output: '差异清单 · 审核意见 · 对账报告', metric: '核对耗时、异常定位与复核效率', steps: [['读取并整理业务资料', '统一订单、票据与流水口径'], ['识别差异与异常项目', '汇总匹配结果，保留来源'], ['负责人确认异常', '关键判断保留人工复核']], result: '月度对账与差异报告', meta: '关联原始凭据 · 可继续复核' },
        manufacturing: { title: '让运维与调度，<br>更快找到依据和下一步。', copy: '连接设备记录、操作手册与业务数据，辅助梳理故障、维护与调度信息，让现场判断有据可依。', input: '设备记录 · 操作手册 · 调度数据', output: '问题摘要 · 维护建议 · 待办清单', metric: '资料查找时间、响应周期与交接效率', steps: [['读取设备与业务记录', '汇总日志、手册与相关历史'], ['关联问题与处理依据', '整理线索，引用适用资料'], ['现场负责人确认方案', '涉及操作的决策保留人工确认']], result: '设备问题与维护建议清单', meta: '引用操作资料 · 待负责人复核' },
        professional: { title: '让专业审核，<br>从大海捞针变成聚焦重点。', copy: '辅助解析合同、项目材料与内部规范，提取条款与疑点，帮助专业人员更快定位需要审阅的内容。', input: '合同文件 · 项目材料 · 内部规范', output: '条款摘要 · 疑点标注 · 审核清单', metric: '材料阅读时间、问题定位与复核效率', steps: [['解析材料与关键条款', '保留页码、段落与原文依据'], ['比对规范，汇总疑点', '整理差异，不替代专业判断'], ['专业人员复核结论', '确认适用性与最终处理意见']], result: '条款疑点与专业审核清单', meta: '附原文位置 · 结论由专业人员确认' },
        operations: { title: '让内容与经营分析，<br>从重复整理走向持续协作。', copy: '围绕产品资料、内容需求与经营数据，辅助产出内容草案、发布计划与分析摘要，保持团队协作的连续性。', input: '产品资料 · 内容需求 · 经营数据', output: '内容草案 · 发布计划 · 经营摘要', metric: '内容准备时间、协作周期与分析效率', steps: [['整理目标与业务资料', '明确受众、渠道及数据口径'], ['生成草案与分析摘要', '组织内容、计划与关键变化'], ['团队审核内容与结论', '确认品牌表达与业务判断']], result: '内容计划与经营分析摘要', meta: '可编辑草案 · 发布前由团队审核' }
    };
    const tabs = $$('[data-scenario]'), panel = $('#solution-panel');
    let animationTimer;
    function selectScenario(key, focus = false) {
        const scenario = scenarios[key];
        if (!scenario)
            return;
        tabs.forEach(tab => { const active = tab.dataset.scenario === key; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; if (active && focus)
            tab.focus(); });
        panel.setAttribute('aria-labelledby', 'tab-' + key);
        $('#solution-title').innerHTML = scenario.title;
        for (const prop of ['copy', 'input', 'output', 'metric'])
            $('#solution-' + prop).textContent = scenario[prop];
        $('#scenario-result').textContent = scenario.result;
        $('#scenario-result-meta').textContent = scenario.meta;
        $('#scenario-steps').innerHTML = scenario.steps.map(([title, note], i) => '<li' + (i === 2 ? ' class="human-step"' : '') + '><span>0' + (i + 1) + '</span><div><strong>' + title + '</strong><small>' + note + '</small></div><b>' + (i === 2 ? '确认' : '✓') + '</b></li>').join('');
        clearTimeout(animationTimer);
        panel.classList.remove('is-changing');
        // One small transition after user choice; no automatic scenario changes.
        animationTimer = setTimeout(() => { panel.classList.add('is-changing'); }, 16);
    }
    tabs.forEach((tab, index) => {
        lifetime.listen(tab, 'click', () => selectScenario(tab.dataset.scenario));
        lifetime.listen(tab, 'keydown', e => { let next; if (e.key === 'ArrowRight')
            next = (index + 1) % tabs.length;
        else if (e.key === 'ArrowLeft')
            next = (index - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home')
            next = 0;
        else if (e.key === 'End')
            next = tabs.length - 1;
        else
            return; e.preventDefault(); selectScenario(tabs[next].dataset.scenario, true); });
    });
    const closeNav = () => { };
    const dialog = $('#business-info');
    lifetime.listen(dialog.querySelector('.dialog-close'), 'click', () => dialog.close());
    lifetime.listen(dialog, 'click', e => { if (e.target === dialog) {
        const r = dialog.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
            dialog.close();
    } });
    lifetime.listen(document, 'click', e => { const trigger = e.target.closest('[data-label],[data-info]'); if (trigger) {
        $('#business-info-title').textContent = trigger.dataset.label || trigger.textContent.trim();
        dialog.showModal();
    } });
    const languageToggle = $('#language-toggle'), languageMenu = $('#language-menu');
    function closeLanguage() { languageMenu.hidden = true; languageToggle.setAttribute('aria-expanded', 'false'); }
    lifetime.listen(languageToggle, 'click', () => { const open = languageMenu.hidden; languageMenu.hidden = !open; languageToggle.setAttribute('aria-expanded', String(open)); });
    lifetime.listen($('#language-menu button'), 'click', closeLanguage);
    lifetime.listen(document, 'click', e => { if (!e.target.closest('.language-picker'))
        closeLanguage(); });
    lifetime.listen(document, 'keydown', e => { if (e.key === 'Escape') {
        closeNav();
        const open = !languageMenu.hidden;
        closeLanguage();
        if (open)
            languageToggle.focus();
    } });
    const socialIcons = [
        ['Facebook', '<path d="M14 21v-8h3l.5-4H14V7c0-1 .4-1.7 1.8-1.7H18V2.2C17.5 2.1 16.2 2 15 2c-3 0-5 1.8-5 5v2H7v4h3v8z"/>'],
        ['X', '<path d="M18.5 2H22l-7.6 8.7L23 22h-6.7l-5.2-6.8L5.2 22H1.7l7.8-9L1 2h6.8l4.7 6.3L18.5 2zm-1.2 18h1.9L6.7 4H4.8z"/>'],
        ['LinkedIn', '<path d="M3 8h4v14H3V8zm2-6a2.3 2.3 0 1 0 0 4.6A2.3 2.3 0 0 0 5 2zm5 6h4v2c.8-1.4 2.1-2.3 4.2-2.3 4 0 4.8 2.6 4.8 6V22h-4v-7.3c0-1.8 0-4-2.4-4S14 12.7 14 14.5V22h-4z"/>'],
        ['GitHub', '<path d="M12 2a10 10 0 0 0-3.16 19.5c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.64-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03A9.6 9.6 0 0 1 12 7c.85 0 1.71.11 2.51.34 1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.58c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/>'],
        ['Instagram', '<g fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/></g><circle cx="17.5" cy="6.5" r="1"/>'],
        ['TikTok', '<path d="M14 2h3c.2 2.3 1.5 4 4 4.3v3.3c-1.5 0-2.8-.5-4-1.2V16a6 6 0 1 1-6-6v3.4a2.7 2.7 0 1 0 3 2.6V2z"/>'],
        ['电话', '<path d="M6.6 2.5 3.3 4.2c-3 5.1 8.3 17.5 14.1 16.8l3.8-3.7-4.8-4-2.6 2.4c-2.4-1.2-4.4-3.2-5.5-5.6l2-2.3z"/>'],
        ['WhatsApp', '<g fill="none" stroke="currentColor" stroke-width="1.7"><path d="m3 21 1.5-5A9 9 0 1 1 8 20z"/><path d="M8 7c-3 3 4 10 7 7l-2-2-1 1-3-3 1-1z"/></g>']
    ];
    $('#socials').innerHTML = socialIcons.map(([name, svg]) => '<button data-label="' + name + '" aria-label="' + name + '" title="' + name + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + svg + '</svg></button>').join('');
})();

}
