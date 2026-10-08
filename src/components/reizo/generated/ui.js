/* eslint-disable */
// Generated from the supplied design; managed by createDesignScope.
export default function initialize(lifetime) {
const { document, window, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, IntersectionObserver, ResizeObserver, MutationObserver } = lifetime;
(() => {
    'use strict';
    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const logo = '<img class="agent-icon" src="/reizo/assets/reizo-mark.png" alt="">';
    const film = '<div class="film-art" aria-label="品牌短片示意画面"><span class="play">▶</span></div>';
    const report = '<div class="mini-report" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>';
    let toastTimer;
    function toast(message) {
        clearTimeout(toastTimer);
        $('#toast').textContent = message;
        $('#toast').classList.add('visible');
        toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3200);
    }
    const dialog = $('#info-dialog');
    const info = {
        start: ['从一项任务开始', '欢迎体验 REIZO。这是产品展示页，你可以先在工作台中切换任务，查看 Agent 如何组织资料与交付成果。'],
        enterprise: ['企业级 AI 解决方案', '面向团队与企业，提供 AI 能力集成、定制功能开发、咨询与培训。企业方案详情即将上线。'],
        api: ['REIZO API', '统一接入多种模型，按实际用量付费。开发文档即将上线，你可以先查看本页的调用示例。'],
        membership: ['一个会员，多种先进能力', '多模型会员、无需 VPN、友好的 Token 成本。具体方案与额度说明即将上线。']
    };
    let dialogDestination = '#workspace';
    function openInfo(title, copy, destination = '#workspace', action = '体验工作台演示') {
        $('#dialog-title').textContent = title;
        $('#dialog-copy').textContent = copy;
        $('#dialog-action').innerHTML = escape(action) + ' <span>→</span>';
        dialogDestination = destination;
        if (!dialog.open)
            dialog.showModal();
    }
    lifetime.listen(document, 'click', event => {
        const trigger = event.target.closest('[data-info],[data-label]');
        if (!trigger)
            return;
        const kind = trigger.dataset.info;
        if (kind && info[kind]) {
            const [title, copy] = info[kind];
            openInfo(title, copy, kind === 'api' ? '#developers' : '#workspace', kind === 'api' ? '查看调用示例' : '体验工作台演示');
        }
        else {
            const label = trigger.dataset.label;
            openInfo(label, label + '内容即将上线。你可以先体验 REIZO 的工作台与任务示例。');
        }
    });
    lifetime.listen($('.dialog-close'), 'click', () => dialog.close());
    lifetime.listen(dialog, 'click', event => {
        if (event.target !== dialog)
            return;
        const r = dialog.getBoundingClientRect();
        if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)
            dialog.close();
    });
    lifetime.listen($('#dialog-action'), 'click', () => { dialog.close(); $(dialogDestination).scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth' }); });
    // Local logo assets keep the marquee reliable in a file preview.
    const brands = [['OpenAI', 'openai'], ['Anthropic', 'anthropic'], ['Kimi', 'kimi'], ['Jev', null], ['可灵', 'kling'], ['Suno', 'suno'], ['Jina Reader', 'jina'], ['MiniMax', 'minimax'], ['OpenRouter', 'openrouter'], ['Groq', 'groq'], ['ElevenLabs', 'elevenlabs'], ['Gemini', 'gemini'], ['DeepSeek', 'deepseek'], ['通义千问', 'qwen'], ['Llama', 'meta']];
    const brandGroup = brands.map(([name, icon]) => '<span class="model-item">' + (icon ? '<img src="/reizo/assets/' + icon + '.svg" alt="" width="23" height="23">' : '<span class="word-icon" aria-hidden="true">J</span>') + name + '</span>').join('');
    $('#model-track').innerHTML = '<div class="model-group">' + brandGroup + '</div><div class="model-group" aria-hidden="true">' + brandGroup + '</div>';
    // One timed state machine for the hero, with cancellation and manual confirmation.
    const flows = [
        { title: '短视频创作', request: '把这份产品资料做成 3 条社媒短视频，配好开场、字幕和封面。', thinking: '正在提炼产品卖点，拆分三个选题，规划开场与镜头节奏。', confirm: '确认短视频内容方向', options: ['产品种草', '实用教程', '使用测评'], generating: '正在生成三条短视频的分镜、画面、字幕与封面。', filename: '社媒短视频合集 · 3 条', meta: '短视频 · 配套字幕 · 发布封面', video: true },
        { title: '电商套图', request: '根据产品照片和卖点，生成一套风格统一的电商主图、卖点图和场景图。', thinking: '正在识别产品外观、整理核心卖点，并规划整套图片的视觉风格。', confirm: '确认产品套图风格', options: ['简洁质感', '自然生活', '鲜明撞色'], generating: '正在生成主图、卖点图和场景图，检查产品外观与排版一致性。', filename: '电商产品套图.zip', meta: '产品主图 · 卖点展示 · 使用场景', artifact: 'commerce' },
        { title: '资料研究', request: '整理这 38 份调研资料，生成一份有结论的行业机会分析。', thinking: '正在阅读资料、提取关键信号，并拆分研究步骤。', confirm: '确认报告的分析重点', options: ['市场机会', '竞品差异', '行动建议'], generating: '正在交叉分析资料，并形成结论与行动建议。', filename: '行业机会分析报告.docx', meta: '结论摘要 · 对比分析 · 行动建议' },
        { title: '合同审查', request: '审查这份合作合同，标出风险条款，并整理修改建议。', thinking: '正在比对权责、付款条件与违约条款，整理待确认事项。', confirm: '确认合同审查重点', options: ['履约风险', '付款条件', '知识产权'], generating: '正在逐条标注疑点，整理修改建议与专业复核清单。', filename: '合同风险审查清单.docx', meta: '风险标注 · 修改建议 · 待专业复核', artifact: 'DOC' },
        { title: '经营分析', request: '分析上月财务与经营数据，找出收入、成本和现金流的变化。', thinking: '正在核对数据口径、对比收支趋势，并定位异常波动。', confirm: '确认经营分析重点', options: ['利润变化', '成本结构', '现金流'], generating: '正在整理指标对比、异常说明与待核实事项。', filename: '上月财务经营分析.xlsx', meta: '指标对比 · 变化归因 · 待核实事项', artifact: 'chart' },
        { title: '代码开发', request: '根据需求补全接口代码，排查报错，并整理对应的测试用例。', thinking: '正在梳理接口需求、追踪调用链，并对照日志分析报错原因。', confirm: '确认代码开发重点', options: ['功能实现', '报错修复', '测试覆盖'], generating: '正在整理接口实现、修复代码示例与待运行的测试用例。', filename: '接口开发与测试建议.md', meta: '接口实现 · 修复示例 · 待验证用例', artifact: '</>' },
    ];
    $('#hero-task-list').innerHTML = flows.map((flow, i) => '<button type="button" data-hero-task="' + i + '" aria-controls="hero-stage" aria-pressed="' + (i === 0) + '">' + escape(flow.title) + '</button>').join('');
    function heroArtifact(f) {
        if (f.video)
            return '<div class="short-video-set" aria-label="三条社媒短视频示意"><span><i>▶</i></span><span><i>▶</i></span><span><i>▶</i></span></div>';
        if (f.artifact === 'commerce')
            return '<div class="commerce-set" aria-label="电商主图、卖点图与场景图示意"><span><i></i><small>主图</small></span><span><i></i><small>卖点</small></span><span><i></i><small>场景</small></span></div>';
        if (f.artifact === 'chart')
            return '<div class="hero-artifact chart" aria-hidden="true"><i></i><i></i><i></i><i></i></div>';
        if (f.artifact)
            return '<div class="hero-artifact" aria-hidden="true"><b>' + escape(f.artifact) + '</b><i></i><i></i></div>';
        return report;
    }
    let heroIndex = 0, heroStep = 0, heroTimer, heroPaused = reducedMotion;
    let heroVisible = true, renderedHeroIndex = -1;
    const durations = [1200, 1900, 4400, 1900, 3300];
    function queueHero() {
        clearTimeout(heroTimer);
        if (heroPaused || !heroVisible || document.hidden)
            return;
        heroTimer = setTimeout(() => { if (heroStep === 4) {
            heroIndex = (heroIndex + 1) % flows.length;
            heroStep = 0;
        }
        else
            heroStep++; renderHero(); }, durations[heroStep]);
    }
    function renderHero() {
        const f = flows[heroIndex];
        let content = '<div class="hero-request">' + escape(f.request) + '</div>';
        if (heroStep > 0) {
            let body = '';
            if (heroStep === 1)
                body = '<p>' + escape(f.thinking) + '</p><div class="thinking-line">' + window.ReizoThought + ' 正在理解与拆解任务</div>';
            if (heroStep === 2)
                body = '<p>已完成任务拆解，先确认方向。</p><div class="confirm-box"><h3>' + escape(f.confirm) + '</h3><div class="confirm-options">' + f.options.map((x, i) => '<button aria-pressed="' + (i === 0) + '">' + escape(x) + '</button>').join('') + '</div><button class="confirm-action">确认并继续 →</button></div>';
            if (heroStep === 3)
                body = '<p>' + escape(f.generating) + '</p><div class="thinking-line">' + window.ReizoThought + ' 正在生成成果</div>';
            if (heroStep === 4)
                body = '<p class="delivery-status">✓ 成果已交付，可继续编辑。</p><div class="hero-delivery">' + heroArtifact(f) + '<div><h3>' + escape(f.filename) + '</h3><p>' + escape(f.meta) + '</p></div><span>↗</span></div>';
            content += '<div class="hero-agent">' + logo + '<div class="hero-agent-content"><strong>REIZO Agent</strong>' + body + '</div></div>';
        }
        $('#hero-stage').innerHTML = content;
        $('#hero-stage').scrollTop = 0;
        $$('[data-hero-task]').forEach((button, i) => button.setAttribute('aria-pressed', String(i === heroIndex)));
        if (renderedHeroIndex !== heroIndex) {
            const list = $('#hero-task-list'), selected = $$('[data-hero-task]')[heroIndex];
            list.scrollTo({ left: Math.max(0, selected.offsetLeft - (list.clientWidth - selected.offsetWidth) / 2), behavior: reducedMotion ? 'instant' : 'smooth' });
            renderedHeroIndex = heroIndex;
        }
        $$('.stage-progress span').forEach((span, i) => span.classList.toggle('complete', heroStep >= i * 2));
        queueHero();
    }
    $$('[data-hero-task]').forEach(button => lifetime.listen(button, 'click', () => { heroIndex = Number(button.dataset.heroTask); heroStep = reducedMotion ? 2 : 0; renderHero(); }));
    lifetime.listen($('#hero-task-list'), 'keydown', event => {
        const buttons = $$('[data-hero-task]');
        const current = buttons.indexOf(document.activeElement);
        if (current < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
            return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next].focus();
        buttons[next].click();
    });
    lifetime.listen($('#hero-stage'), 'click', event => {
        const option = event.target.closest('.confirm-options button');
        if (option) {
            $$('.confirm-options button').forEach(b => b.setAttribute('aria-pressed', String(b === option)));
            queueHero();
        }
        if (event.target.closest('.confirm-action')) {
            heroStep = 3;
            renderHero();
            if (heroPaused) {
                clearTimeout(heroTimer);
                heroTimer = setTimeout(() => { heroStep = 4; renderHero(); }, reducedMotion ? 0 : 1600);
            }
        }
    });
    lifetime.listen($('.pause-hero'), 'click', () => {
        heroPaused = !heroPaused;
        $('.pause-hero').textContent = heroPaused ? '▶' : 'Ⅱ';
        $('.pause-hero').setAttribute('aria-label', heroPaused ? '继续演示' : '暂停演示');
        $('.pause-hero').setAttribute('aria-pressed', String(heroPaused));
        $('.hero-demo').classList.toggle('is-paused', heroPaused);
        queueHero();
    });
    if (reducedMotion) {
        heroStep = 2;
        $('.pause-hero').textContent = '▶';
        $('.pause-hero').setAttribute('aria-label', '继续演示');
        $('.pause-hero').setAttribute('aria-pressed', 'true');
    }
    renderHero();
    new IntersectionObserver(entries => { heroVisible = entries[0].isIntersecting; queueHero(); }, { threshold: .2 }).observe($('.hero-demo'));
    const tasks = [
        { title: '新品社媒运营计划', kind: '内容与营销', icon: '✦', prompt: '为新品制定一周社媒内容计划，并输出三组配图方向。', combo: ['内容运营助手', '写作模型', '图像模型'], steps: ['梳理产品卖点与目标受众', '安排内容节奏与配图方向', '整理发布计划与转化建议'], file: '新品社媒运营计划.docx', inputs: ['新品资料', '品牌调性'], output: '内容计划', result: '配图方向', note: '内容节奏 · 配图方向 · 转化建议', visual: true },
        { title: '产品需求与测试清单', kind: '产品与研发', icon: '⌘', prompt: '梳理这个需求的产品方案，并列出开发与测试要点。', combo: ['产品经理助手', '开发助手', '测试助手'], steps: ['梳理用户路径与关键需求', '拆分开发任务与接口要求', '生成验收标准和测试清单'], file: '产品需求与测试清单.docx', inputs: ['需求文档', '用户反馈'], output: '产品方案', result: '测试清单', note: '需求拆解 · 开发要点 · 测试清单' },
        { title: '合规与税务风险简报', kind: '法务与财务', icon: '◇', prompt: '分析这份合作合同与税务资料，标记需要重点确认的风险。', combo: ['法务助手', '税务助手', '分析模型'], steps: ['比对合作合同与补充条款', '整理税务资料中的待确认项', '输出风险简报与审查清单'], file: '合规与税务风险简报.pdf', inputs: ['合作合同', '税务资料'], output: '风险条款', result: '审查清单', note: '风险条款 · 税务提示 · 待确认事项' },
        { title: '社媒短视频创作', kind: '视觉与媒体', icon: '▷', prompt: '把产品资料制作成社媒短视频，先确认画面方向，再生成场景、分镜与字幕。', combo: ['视频创作助手', '视觉叙事助手', '多模态模型'], steps: ['确认选题与画面方向', '生成场景分镜与旁白字幕', '整理短视频与配套发布素材'], file: '社媒短视频与发布素材.zip', inputs: ['产品资料', '视觉参考'], output: '分镜脚本', result: '短视频合集', note: '短视频 · 旁白字幕 · 发布素材', visual: true },
        { title: '会议纪要与汇报提纲', kind: '管理与办公', icon: '▤', prompt: '整理会议内容，输出决策摘要、待办与下周汇报框架。', combo: ['会议助手', '汇报助手', '文档助手'], steps: ['提取会议议题与关键决策', '整理负责人和行动待办', '生成下周汇报的内容提纲'], file: '会议纪要与汇报提纲.docx', inputs: ['会议记录', '项目进展'], output: '决策摘要', result: '汇报提纲', note: '会议摘要 · 行动待办 · 汇报框架' },
        { title: '行业趋势与投资分析', kind: '数据与科研', icon: '↗', prompt: '结合行业资料，分析投资机会、风险与未来趋势。', combo: ['趋势研究助手', '投资行业助手', '分析模型'], steps: ['整理行业资料与市场数据', '分析发展趋势与潜在风险', '形成研究结论与行动建议'], file: '行业趋势与投资分析报告.pdf', inputs: ['行业资料', '市场数据'], output: '趋势分析', result: '研究报告', note: '趋势洞察 · 风险分析 · 投资建议' }
    ];
    window.initReizoWorkbench({ tasks, logo, escape, openInfo, toast, reducedMotion });
    lifetime.listen(document, 'visibilitychange', queueHero);
    const codeSamples = {
        python: 'from openai import OpenAI\n\nclient = OpenAI(\n    api_key="YOUR_REIZO_API_KEY",\n    base_url="YOUR_REIZO_API_BASE"\n)\n\nresponse = client.chat.completions.create(\n    model="YOUR_MODEL_ID",\n    messages=[{"role": "user", "content": "开始创作"}]\n)',
        javascript: 'import OpenAI from "openai";\n\nconst client = new OpenAI({\n  apiKey: "YOUR_REIZO_API_KEY",\n  baseURL: "YOUR_REIZO_API_BASE"\n});\n\nconst response = await client.chat.completions.create({\n  model: "YOUR_MODEL_ID",\n  messages: [{ role: "user", content: "开始创作" }]\n});',
        curl: "curl \"$YOUR_REIZO_API_BASE/chat/completions\" \\\n  -H \"Authorization: Bearer $YOUR_REIZO_API_KEY\" \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\n    \"model\": \"YOUR_MODEL_ID\",\n    \"messages\": [{\n      \"role\": \"user\",\n      \"content\": \"开始创作\"\n    }]\n  }'"
    };
    let activeCode = 'python';
    function renderCode(key) { activeCode = key; $('#code-content').innerHTML = codeSamples[key].split(/("(?:[^"\\]|\\.)*")/g).map((token, i) => i % 2 ? '<span class="code-string">' + escape(token) + '</span>' : escape(token)).join(''); $$('[data-code]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.code === key))); }
    $$('[data-code]').forEach(b => lifetime.listen(b, 'click', () => renderCode(b.dataset.code)));
    lifetime.listen($('#copy-code'), 'click', async () => {
        try {
            await navigator.clipboard.writeText(codeSamples[activeCode]);
            $('#copy-code').textContent = '已复制';
            setTimeout(() => $('#copy-code').textContent = '复制', 1600);
        }
        catch {
            toast('无法自动复制，请选中代码后复制。');
        }
    });
    renderCode('python');
    const languageToggle = $('#language-toggle'), languageMenu = $('#language-menu');
    function closeLanguage() { languageMenu.hidden = true; languageToggle.setAttribute('aria-expanded', 'false'); }
    lifetime.listen(languageToggle, 'click', () => { const open = languageMenu.hidden; languageMenu.hidden = !open; languageToggle.setAttribute('aria-expanded', String(open)); });
    lifetime.listen($('#language-menu button'), 'click', closeLanguage);
    lifetime.listen(document, 'click', e => { if (!e.target.closest('.language-picker'))
        closeLanguage(); });
    lifetime.listen(document, 'keydown', e => { if (e.key === 'Escape') {
        const wasOpen = !languageMenu.hidden;
        closeLanguage();
        if (wasOpen)
            languageToggle.focus();
    } });
    // Monochrome social marks, kept local rather than depending on a remote icon CDN.
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
