/* eslint-disable */
// Generated from the supplied design; managed by createDesignScope.
export default function initialize(lifetime) {
const { document, window, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, IntersectionObserver, ResizeObserver, MutationObserver } = lifetime;
/* One sequence drives the conversation and its connected canvas. Local product demo only. */
window.ReizoThought = '<span class="reizo-thought" aria-hidden="true"><i class="thought-seed"></i><i class="thought-core"></i><i class="thought-out"></i><b style="--dx:-13px;--dy:-8px"></b><b style="--dx:13px;--dy:-8px"></b><b style="--dx:13px;--dy:8px"></b><b style="--dx:-13px;--dy:8px"></b></span>';
window.initReizoWorkbench = ({ tasks, logo, escape, openInfo, toast, reducedMotion }) => {
    const $ = s => document.querySelector(s);
    const bench = $('.workbench'), pane = $('#task-pane'), canvas = $('#canvas-pane');
    const scenarios = [
        { question: '这周的内容，想先突出哪一种方向？', choices: ['产品种草', '实用攻略'], reading: '正在整理新品资料，提取受众需求与内容机会。', planning: '正在比较两种内容方向，准备配图与文案草案。', scene: '配图场景', sequence: '一周发布安排', visual: true },
        { question: '这次产品迭代，先推进哪一部分？', choices: ['核心体验', '性能优化'], reading: '正在对照需求文档与用户反馈，梳理问题边界。', planning: '正在比较实现路径，拆分开发与验收事项。', scene: '功能方案', sequence: '开发与测试计划' },
        { question: '这次审查，优先关注哪类风险？', choices: ['履约与付款', '税务与合规'], reading: '正在比对合同与税务资料，提取待核实条款。', planning: '正在整理两组审查重点，标记需要专业复核的问题。', scene: '条款对照', sequence: '风险与复核清单' },
        { question: '短视频想先尝试哪一种表达？', choices: ['生活场景', '产品特写'], reading: '正在读取产品资料，整理卖点与画面参考。', planning: '正在构思两种视频方向，先给你看画面草案。', scene: '拍摄场景', sequence: '短视频分镜', visual: true, video: true },
        { question: '这次会议内容，优先整理成什么？', choices: ['行动待办', '管理层汇报'], reading: '正在梳理会议记录，提取决策、负责人和时间点。', planning: '正在比较两种整理方式，组织汇报与执行重点。', scene: '决策提要', sequence: '负责人及时间表' },
        { question: '这次行业研究，更关注哪一方面？', choices: ['增长机会', '风险因素'], reading: '正在交叉阅读行业资料与市场数据，核对来源。', planning: '正在比较机会与风险，整理证据和不确定性。', scene: '证据对照', sequence: '研究结论与局限' }
    ];
    const durations = [1200, 2400, 2000, 6000, 2400, 2400, 5500];
    let index = 0, step = 0, choice = 0, timer, visible = false, paused = reducedMotion, awaiting = false;
    let surface, lines, response;
    const nodes = new Map(), edges = new Map();
    const textLines = '<div class="node-lines"><i></i><i></i><i></i></div>';
    const chart = '<div class="node-chart"><i style="height:35%"></i><i style="height:55%"></i><i style="height:47%"></i><i style="height:80%"></i></div>';
    const mood = n => '<div class="canvas-mood mood-' + n + '" aria-hidden="true"><i></i><b></b></div>';
    function queue() {
        clearTimeout(timer);
        const editing = bench.contains(document.activeElement) && document.activeElement.closest('.work-composer,.work-confirm');
        const running = visible && !document.hidden && !paused && !awaiting && !editing;
        bench.classList.toggle('is-running', running);
        if (!running)
            return;
        timer = setTimeout(() => { if (step === 6)
            selectTask(index + 1);
        else {
            step++;
            renderStep();
        } }, durations[step]);
    }
    function updateControls() {
        const button = $('#work-play');
        button.setAttribute('aria-label', paused ? '继续工作台演示' : '暂停工作台演示');
        button.setAttribute('aria-pressed', String(paused));
        button.textContent = paused ? '▷' : 'Ⅱ';
    }
    function connectCanvas() {
        if (!surface)
            return;
        if (!surface.clientWidth)
            return;
        lines.setAttribute('viewBox', `0 0 ${surface.clientWidth} ${surface.clientHeight}`);
        edges.forEach(({ path, from, to }) => {
            const a = nodes.get(from), b = nodes.get(to);
            const x1 = a.offsetLeft + a.offsetWidth / 2, y1 = a.offsetTop + a.offsetHeight;
            const x2 = b.offsetLeft + b.offsetWidth / 2, y2 = b.offsetTop;
            const middle = (y1 + y2) / 2;
            path.setAttribute('d', `M${x1} ${y1}C${x1} ${middle} ${x2} ${middle} ${x2} ${y2}`);
        });
    }
    function addEdge(from, to) {
        const key = from + '-' + to;
        if (edges.has(key))
            return;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('pathLength', '1');
        path.classList.add('canvas-wire');
        lines.append(path);
        edges.set(key, { path, from, to });
    }
    function addNode(id, title, type, body, parents = []) {
        if (nodes.has(id))
            return;
        const candidate = id === 'c' || id === 'd';
        const el = document.createElement(candidate ? 'button' : 'div');
        el.className = 'canvas-node flow-node flow-' + id;
        if (candidate) {
            el.type = 'button';
            el.dataset.direction = id === 'c' ? '0' : '1';
            el.setAttribute('aria-label', '选择' + title);
        }
        el.innerHTML = '<div class="node-type"><i>' + escape(type) + '</i></div>' + body + '<h3>' + escape(title) + '</h3>' + (candidate ? '<small class="node-selection">候选方向</small>' : '');
        surface.append(el);
        nodes.set(id, el);
        parents.forEach(parent => addEdge(parent, id));
    }
    function syncChoice() {
        ['c', 'd'].forEach((id, i) => {
            const node = nodes.get(id);
            if (!node)
                return;
            node.classList.toggle('is-chosen', i === choice);
            node.setAttribute('aria-pressed', String(i === choice));
            node.disabled = step > 3;
            node.querySelector('small').textContent = i === choice ? (step > 3 ? '已确认' : '当前方向') : '候选方向';
        });
        pane.querySelectorAll('[data-direction]').forEach(button => button.setAttribute('aria-pressed', String(+button.dataset.direction === choice)));
    }
    function revealCanvas() {
        const t = tasks[index], s = scenarios[index];
        addNode('a', t.inputs[0], '资料', textLines);
        if (step >= 1)
            addNode('b', t.inputs[1], s.visual ? '图像' : '资料', s.visual ? mood(0) : chart);
        if (step >= 2) {
            addNode('c', s.choices[0], '方向 01', s.visual ? mood(0) : textLines, ['a', 'b']);
            addNode('d', s.choices[1], '方向 02', s.visual ? mood(1) : textLines, ['a', 'b']);
        }
        if (step >= 4)
            addNode('e', s.scene, '生成', s.visual ? mood(choice) : chart, [choice ? 'd' : 'c']);
        if (step >= 5)
            addNode('f', s.sequence, s.visual ? '画面' : '文档', s.visual ? '<div class="canvas-storyboard">' + mood(choice) + mood(1 - choice) + mood(choice) + '</div>' : textLines, ['e']);
        if (step >= 6)
            addNode('g', t.result, '成果', s.video ? '<div class="canvas-final-video">' + mood(choice) + '<span>▶</span></div>' : s.visual ? mood(choice) : chart, ['f']);
        syncChoice();
        requestAnimationFrame(() => {
            connectCanvas();
            const target = nodes.get(step >= 6 ? 'g' : step >= 5 ? 'f' : step >= 4 ? 'e' : step >= 2 ? 'd' : 'a');
            // Scroll only the canvas viewport, never the user's page.
            const top = Math.max(0, target.offsetTop + target.offsetHeight - canvas.clientHeight + 28);
            canvas.scrollTo({ top, behavior: reducedMotion ? 'instant' : 'smooth' });
        });
    }
    function renderStep() {
        const t = tasks[index], s = scenarios[index];
        bench.dataset.workStep = step;
        const combo = pane.querySelector('.combo');
        combo.hidden = step === 0;
        pane.querySelector('.work-agent').hidden = step === 0;
        if (step === 1 || step === 2 || step === 4 || step === 5) {
            const message = step === 1 ? s.reading : step === 2 ? s.planning : step === 4 ? '已确认「' + s.choices[choice] + '」。正在展开' + s.scene + '。' : '正在整理' + s.sequence + '，连接资料与最终成果。';
            response.innerHTML = '<p>' + escape(message) + '</p><div class="work-thinking">' + window.ReizoThought + '<span>' + (step < 3 ? '正在整理与构思' : '正在生成与编排') + '</span></div>';
            if (step >= 4)
                response.innerHTML += '<div class="work-confirmed">✓ ' + escape(s.choices[choice]) + ' · 方向已确认</div>';
        }
        else if (step === 3) {
            response.innerHTML = '<p>已整理两种方向，请选择一个继续。</p><div class="work-confirm"><h3>' + escape(s.question) + '</h3><div class="work-directions">' + s.choices.map((label, i) => '<button type="button" data-direction="' + i + '" aria-pressed="' + (i === choice) + '">' + escape(label) + '</button>').join('') + '</div><button class="work-confirm-action" type="button">确认方向，继续生成 →</button></div>';
        }
        else if (step === 6) {
            response.innerHTML = '<p class="work-complete">✓ 成果已整理，可继续查看与编辑。</p><ol class="work-steps">' + t.steps.map(x => '<li>' + escape(x) + '</li>').join('') + '</ol><button class="work-file" id="open-result"><span class="file-icon">' + escape(t.file.split('.').pop().toUpperCase()) + '</span><span><b>' + escape(t.file) + '</b><small>' + escape(t.note) + '</small></span><span>↗</span></button>';
        }
        else
            response.innerHTML = '';
        revealCanvas();
        queue();
    }
    function selectTask(next) {
        clearTimeout(timer);
        index = (next + tasks.length) % tasks.length;
        step = reducedMotion ? 3 : 0;
        choice = 0;
        awaiting = false;
        const t = tasks[index];
        $('#recent-tasks').querySelectorAll('button').forEach((button, i) => { button.classList.toggle('active', i === index); button.setAttribute('aria-pressed', String(i === index)); });
        pane.innerHTML = '<div class="task-header"><span class="work-title">' + escape(t.title) + '</span><div class="work-playback"><button id="work-replay" type="button" aria-label="重新播放当前任务">↺</button><button id="work-play" type="button"></button></div></div><div class="task-content"><div class="work-request">' + escape(t.prompt) + '</div><details class="combo" hidden><summary>本次已组合：' + escape(t.combo.join(' + ')) + '</summary><div>根据任务内容，协同调用 ' + escape(t.combo.join('、')) + '。</div></details><div class="work-agent" hidden>' + logo + '<div class="work-agent-body"><strong>REIZO Agent</strong><div id="work-response"></div></div></div><form class="work-composer"><div class="composer-box"><input aria-label="补充任务需求" placeholder="继续补充你的想法…" maxlength="300"><button type="submit" aria-label="发送补充需求">↑</button></div></form></div>';
        response = $('#work-response');
        canvas.innerHTML = '<div class="canvas-surface flow-surface"><svg class="canvas-lines" aria-hidden="true"></svg></div>';
        surface = canvas.firstElementChild;
        lines = surface.firstElementChild;
        nodes.clear();
        edges.clear();
        canvas.scrollTop = 0;
        updateControls();
        renderStep();
    }
    $('#recent-tasks').innerHTML = tasks.map((t, i) => '<button type="button" data-task="' + i + '" aria-pressed="false"><span>' + t.icon + '</span><span>' + escape(t.title) + '<small>' + escape(t.kind) + '</small></span></button>').join('');
    lifetime.listen($('#recent-tasks'), 'click', e => { const b = e.target.closest('[data-task]'); if (b)
        selectTask(+b.dataset.task); });
    lifetime.listen(bench, 'click', e => {
        const direction = e.target.closest('[data-direction]');
        if (direction && step <= 3) {
            choice = +direction.dataset.direction;
            step = 3;
            awaiting = true;
            renderStep();
            return;
        }
        if (e.target.closest('.work-confirm-action')) {
            awaiting = false;
            step = reducedMotion ? 6 : 4;
            renderStep();
            return;
        }
        if (e.target.closest('#work-play')) {
            paused = !paused;
            updateControls();
            queue();
        }
        if (e.target.closest('#work-replay')) {
            paused = reducedMotion;
            selectTask(index);
        }
        if (e.target.closest('#open-result')) {
            const t = tasks[index];
            openInfo(t.file, '成果示例包含：' + t.steps.join('；') + '。正式工作台中可继续编辑与导出。');
        }
    });
    lifetime.listen($('#my-tasks'), 'click', () => selectTask(0));
    lifetime.listen($('#new-task'), 'click', () => { const input = pane.querySelector('input'); input.value = ''; input.placeholder = '告诉我你希望完成什么…'; input.focus(); });
    lifetime.listen(pane, 'submit', e => { e.preventDefault(); const input = pane.querySelector('input'); if (!input.value.trim())
        return input.focus(); toast('当前为工作台演示，暂不执行真实任务。'); });
    lifetime.listen(bench, 'focusin', e => { if (e.target.closest('.work-confirm,.work-composer'))
        queue(); });
    lifetime.listen(bench, 'focusout', () => setTimeout(queue, 0));
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; queue(); }, { threshold: .12 }).observe(bench);
    new ResizeObserver(connectCanvas).observe(canvas);
    lifetime.listen(document, 'visibilitychange', queue);
    selectTask(0);
};

}
