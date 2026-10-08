/* eslint-disable */
// Generated from the supplied design; managed by createDesignScope.
export default function initialize(lifetime) {
const { document, window, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, IntersectionObserver, ResizeObserver, MutationObserver } = lifetime;
/* Illustrative timelines only. No business requests or approvals are performed. */
(() => {
    'use strict';
    const scene = document.querySelector('.capability-scene');
    const workflow = document.querySelector('.solution-workflow');
    if (!scene || !workflow)
        return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const duration = 14500;
    const boundaries = [2000, 4400, 7000, 10000];
    const storyDuration = 16000;
    const storyBoundaries = [3300, 6500, 10000];
    const phaseAt = state => (state.kind === 'scene' ? storyBoundaries : boundaries).filter(time => state.elapsed >= time).length;
    const thinking = '<span class="motion-thinking" aria-label="处理中"><i></i><i></i><i></i></span>';
    const states = [
        { element: scene, kind: 'scene', elapsed: 0, stage: -1, visible: !('IntersectionObserver' in window), hover: false, focus: false },
        { element: workflow, kind: 'workflow', elapsed: 0, stage: -1, visible: !('IntersectionObserver' in window), hover: false, focus: false }
    ];
    const setText = (element, text) => { if (element)
        element.textContent = text; };
    function render(state, force = false) {
        const stage = media.matches ? (state.kind === 'scene' ? 3 : 4) : phaseAt(state);
        if (state.kind !== 'scene')
            state.element.style.setProperty('--motion-progress', media.matches ? 1 : state.elapsed / duration);
        if (stage === state.stage && !force)
            return;
        state.stage = stage;
        state.element.dataset.motionStage = String(stage);
        if (state.kind === 'scene') {
            scene.querySelectorAll('[data-story-frame]').forEach((item, i) => {
                item.classList.toggle('is-current', i === stage);
                item.setAttribute('aria-hidden', String(i !== stage));
            });
        }
        else {
            const active = stage < 2 ? 0 : stage === 2 ? 1 : stage === 3 ? 2 : 3;
            workflow.querySelectorAll('#scenario-steps li').forEach((item, i) => {
                item.classList.toggle('is-active', i === active);
                item.classList.toggle('is-done', i < active);
                item.classList.toggle('is-pending', i > active);
                const badge = item.querySelector('b');
                if (badge)
                    badge.innerHTML = i < active ? '✓' : i > active ? '待处理' : i === 2 ? '模拟确认' : thinking;
            });
            setText(workflow.querySelector('.workflow-top>span:last-child'), ['资料接入 · 示意', '正在整理资料', '正在分析依据', '人工复核 · 示意', '结果已整理 · 示意'][stage]);
        }
    }
    let frame = 0;
    let lastTime = null;
    const running = state => !media.matches && !document.hidden && state.visible && !state.hover && !state.focus;
    function tick(now) {
        frame = 0;
        const delta = lastTime === null ? 0 : Math.min(now - lastTime, 100);
        lastTime = now;
        states.forEach(state => {
            if (running(state)) {
                state.elapsed = (state.elapsed + delta) % (state.kind === 'scene' ? storyDuration : duration);
                render(state);
            }
        });
        if (states.some(running))
            frame = requestAnimationFrame(tick);
        else
            lastTime = null;
    }
    function sync() {
        states.forEach(state => state.element.classList.toggle('motion-held', !running(state)));
        if (!states.some(running)) {
            cancelAnimationFrame(frame);
            frame = 0;
            lastTime = null;
        }
        else if (!frame) {
            lastTime = null;
            frame = requestAnimationFrame(tick);
        }
    }
    states.forEach(state => {
        if (state.kind !== 'scene') {
            const controls = document.createElement('div');
            controls.className = 'motion-controls';
            const replay = document.createElement('button');
            replay.type = 'button';
            replay.className = 'motion-replay';
            replay.textContent = '↻ 重看流程';
            replay.setAttribute('aria-label', state.kind === 'scene' ? '重看从资料到行动的流程示意' : '重看当前行业流程示意');
            lifetime.listen(replay, 'click', () => {
                // An explicit replay starts immediately, even while its button has focus.
                state.elapsed = 0;
                state.hover = false;
                state.focus = false;
                render(state, true);
                sync();
            });
            controls.append(replay);
            state.element.append(controls);
        }
        lifetime.listen(state.element, 'pointerenter', event => { if (event.pointerType !== 'touch') {
            state.hover = true;
            sync();
        } });
        lifetime.listen(state.element, 'pointerleave', () => { state.hover = false; sync(); });
        lifetime.listen(state.element, 'focusin', () => { state.focus = true; sync(); });
        lifetime.listen(state.element, 'focusout', event => { state.focus = state.element.contains(event.relatedTarget); sync(); });
        render(state);
    });
    // business.js replaces the list on tab selection; restart only that demonstration.
    const steps = document.querySelector('#scenario-steps');
    if (steps)
        new MutationObserver(() => { states[1].elapsed = 0; render(states[1], true); sync(); }).observe(steps, { childList: true });
    const reveals = document.querySelectorAll('.case-reading li, .deployment-options article, .delivery-steps li');
    reveals.forEach((item, i) => item.style.setProperty('--enter-delay', `${(i % 3) * 110}ms`));
    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                const state = states.find(candidate => candidate.element === entry.target);
                if (state)
                    state.visible = entry.isIntersecting;
                else if (entry.isIntersecting) {
                    if (!media.matches)
                        entry.target.classList.add('enterprise-enter');
                    observer.unobserve(entry.target);
                }
            });
            sync();
        }, { threshold: 0.12 });
        states.forEach(state => observer.observe(state.element));
        reveals.forEach(item => observer.observe(item));
    }
    lifetime.listen(document, 'visibilitychange', sync);
    lifetime.listen(media, 'change', () => {
        states.forEach(state => { state.elapsed = 0; render(state, true); });
        sync();
    });
    sync();
})();

}
