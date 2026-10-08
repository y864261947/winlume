/* eslint-disable */
// Generated from the supplied design; managed by createDesignScope.
export default function initialize(lifetime) {
const { document, window, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, IntersectionObserver, ResizeObserver, MutationObserver } = lifetime;
/* Credits prices are intentionally null until REIZO confirms its own rate card.
   USD catalogue prices and competitor Credits cannot be substituted here. */
(() => {
    'use strict';
    const root = document.querySelector('#compare');
    if (!root)
        return;
    const models = {
        image: [
            { name: 'GPT Image 2.5', specs: ['1K · Low', '2K · Low', '4K · Low', '1K · Medium', '2K · Medium', '4K · Medium'], credits: null },
            { name: 'GPT Image 2', specs: ['标准质量', '高质量'], credits: null },
            { name: 'Gemini 3.1 Flash Image', specs: ['1K', '2K', '4K'], credits: null }
        ],
        video: [
            { name: 'Wan 3.0 Video', specs: ['720p · 5 秒', '720p · 10 秒', '1080p · 5 秒', '1080p · 10 秒'], credits: null },
            { name: 'MiniMax H3', specs: ['720p · 5 秒', '720p · 10 秒', '2K · 5 秒', '2K · 10 秒'], credits: null },
            { name: 'Grok Imagine Video', specs: ['5 秒片段', '10 秒片段'], credits: null }
        ]
    };
    // Read the existing plan cards so this comparison cannot drift from their allowances.
    const plans = [{ name: 'Free', credits: 100, period: '每日体验', concurrent: null, discount: '标准扣减' }, ...['core', 'plus', 'pro', 'max'].map(id => {
            const card = document.querySelector('#plan-' + id).closest('.plan-card');
            return { name: id[0].toUpperCase() + id.slice(1), credits: Number(card.querySelector('.plan-allocation strong').textContent.replace(/,/g, '')), period: '每月包含', concurrent: parseInt(card.querySelector('.plan-concurrency strong').textContent, 10), discount: card.querySelector('.plan-discount strong').textContent.trim() };
        })];
    const $ = id => document.getElementById(id);
    const fmt = n => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format(n);
    const model = $('usage-model'), spec = $('usage-spec'), cost = $('usage-cost');
    let kind = 'image';
    function specs() {
        const item = models[kind][Number(model.value)];
        spec.replaceChildren(...item.specs.map((label, i) => new Option(label, String(i))));
        cost.value = item.credits === null ? '' : String(item.credits);
        render();
    }
    function chooseKind(next) {
        kind = next;
        root.querySelectorAll('[data-usage-kind]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.usageKind === kind)));
        model.replaceChildren(...models[kind].map((item, i) => new Option(item.name, String(i))));
        $('usage-cost-label').textContent = kind === 'image' ? '试算单价 · Credits / 张' : '试算单价 · Credits / 秒';
        cost.placeholder = kind === 'image' ? '填写每张扣点' : '填写每秒扣点';
        $('usage-model-rows').innerHTML = models[kind].map(item => '<tr><th scope="row">' + item.name + '</th><td>' + (kind === 'image' ? '分辨率 / 质量' : '分辨率 / 时长 / 音频') + '</td><td>' + (kind === 'image' ? 'Credits / 张' : 'Credits / 秒，或按片段') + '</td><td>扣点与开放规格待公布</td></tr>').join('');
        specs();
    }
    function render() {
        const rate = cost.value.trim() ? Number(cost.value) : NaN;
        const valid = Number.isFinite(rate) && rate >= 0.001 && rate <= 1e9;
        cost.setAttribute('aria-invalid', String(cost.value !== '' && !valid));
        const duration = kind === 'video' ? Number(spec.selectedOptions[0].textContent.match(/(\d+)\s*秒/)[1]) : 1;
        const charge = rate * duration;
        $('usage-rate-note').textContent = valid
            ? '按你输入的试算单价计算，非正式报价。' + (kind === 'video' ? '每段 ' + duration + ' 秒需 ' + fmt(charge) + ' Credits；若模型按次收费，请以单次报价换算。' : '每张需 ' + fmt(charge) + ' Credits。')
            : cost.value ? '请输入 0.001 至 1,000,000,000 之间的有效单价。' : '正式模型扣点待公布。可填入单价试算，不代表平台报价。';
        $('usage-results').innerHTML = plans.map(plan => {
            const count = valid ? Math.floor((plan.credits + 1e-9) / charge) : null;
            return '<article' + (plan.name === 'Pro' ? ' class="usage-pro"' : '') + '><h3>' + plan.name + '</h3><p class="usage-allowance">' + fmt(plan.credits) + ' 点 / ' + (plan.name === 'Free' ? '日' : '月') + '</p><p class="usage-quantity">' + (count === null ? '<span class="usage-pending">待试算</span>' : fmt(count) + '<small>' + (kind === 'image' ? '张' : '段') + '</small>') + '</p><p class="usage-period">' + (valid && kind === 'video' ? '共 ' + fmt(count * duration) + ' 秒 · 每段 ' + duration + ' 秒' : plan.period) + '</p></article>';
        }).join('');
        $('usage-formula').textContent = kind === 'image' ? '可生成数量 = 可用额度 ÷ 单张扣点，向下取整。' : '可生成段数 = 可用额度 ÷（每秒扣点 × 片段时长），向下取整。';
    }
    const rows = [
        ['额度与优惠', null],
        ['月度包含额度', ['—', ...plans.slice(1).map(p => fmt(p.credits) + ' 点')]],
        ['每日登录额度', Array(5).fill('100 点 / 日')],
        ['另购余额扣减', plans.map(p => p.discount)],
        ['充值优惠', Array(5).fill('购买价一致')],
        ['会员额度有效期', ['不适用', ...Array(4).fill('当前订阅月')]],
        ['另购额度有效期', Array(5).fill('长期有效')],
        ['执行与速度', null],
        ['工作台并发任务', plans.map(p => p.concurrent === null ? '待公布' : p.concurrent + ' 个')],
        ['超出并发数量', Array(5).fill('排队执行')],
        ['单次生成速度', Array(5).fill('随模型与负载变化')],
        ['优先队列', Array(5).fill('规则待公布')],
        ['经济 / 慢速模式', Array(5).fill('筹备中')],
        ['无限生成', Array(5).fill('不包含')],
        ['权限与功能', null],
        ['Agent 工作台', Array(5).fill('按用量使用')],
        ['图片与视频模型', Array(5).fill('以开放目录为准')],
        ['API 调用', ['另购额度可用', ...Array(4).fill('月度 / 另购额度可用')]],
        ['API 并发 / 限流', Array(5).fill('独立核定')],
        ['商业使用', Array(5).fill('依模型与素材授权')]
    ];
    $('benefit-comparison-rows').innerHTML = rows.map(([label, values]) => values
        ? '<tr><th scope="row">' + label + '</th>' + values.map((value, i) => '<td' + (i === 3 ? ' class="compare-pro"' : '') + '>' + value + '</td>').join('') + '</tr>'
        : '<tr class="benefit-group"><th colspan="6" scope="colgroup">' + label + '</th></tr>').join('');
    root.querySelectorAll('[data-usage-kind]').forEach(button => lifetime.listen(button, 'click', () => chooseKind(button.dataset.usageKind)));
    lifetime.listen(model, 'change', specs);
    lifetime.listen(spec, 'change', () => { cost.value = ''; render(); });
    lifetime.listen(cost, 'input', render);
    chooseKind('image');
})();

}
