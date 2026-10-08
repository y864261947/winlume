/* eslint-disable */
// Generated from the supplied design; managed by createDesignScope.
export default function initialize(lifetime) {
const { document, window, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, IntersectionObserver, ResizeObserver, MutationObserver } = lifetime;
/* Product story only: this does not connect to or control any device. */
(() => {
    const section = document.querySelector('#connected-work');
    if (!section)
        return;
    const demo = section.querySelector('.connected-demo');
    const buttons = [...section.querySelectorAll('[data-connect-step]')];
    const sticky = section.querySelector('.connected-sticky');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const scenes = [
        ['正在整理分镜…', '电脑正在处理', '等待确认'],
        ['分镜就绪，等待确认', '这个方向可以吗？', '确认，继续制作'],
        ['收到指令，继续制作…', '指令已送达', '电脑继续处理'],
        ['✓ 制作完成', '短视频已完成', '查看成果']
    ];
    const fields = ['[data-remote-plan]', '[data-remote-phone-title]', '[data-remote-phone-action]'].map(s => section.querySelector(s));
    let phase = 0, scheduled = false, inView = true;
    function paint() {
        demo.dataset.connectPhase = String(phase);
        buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === phase)));
        fields.forEach((field, i) => { field.textContent = scenes[phase][i]; });
    }
    function metrics() {
        const pinned = sticky && getComputedStyle(sticky).position === 'sticky';
        return { top: pinned ? 90 : innerHeight * .18, travel: pinned ? Math.max(1, section.offsetHeight - sticky.offsetHeight) : Math.max(300, section.offsetHeight - innerHeight * .45) };
    }
    function render() {
        scheduled = false;
        if (reduced.matches)
            return;
        const { top, travel } = metrics();
        const progress = Math.max(0, Math.min(1, (top - section.getBoundingClientRect().top) / travel));
        const next = Math.min(scenes.length - 1, Math.floor(progress * scenes.length));
        section.style.setProperty('--connect-progress', String(progress));
        if (next !== phase) {
            phase = next;
            paint();
        }
    }
    function schedule() { if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(render);
    } }
    function motion() { demo.classList.toggle('is-still', reduced.matches || document.hidden || !inView); }
    buttons.forEach((button, i) => lifetime.listen(button, 'click', () => {
        if (reduced.matches) {
            phase = i;
            paint();
            return;
        }
        const { top, travel } = metrics();
        window.scrollTo({ top: section.getBoundingClientRect().top + scrollY - top + (i + .15) / scenes.length * travel, behavior: 'smooth' });
    }));
    lifetime.listen(window, 'scroll', schedule, { passive: true });
    lifetime.listen(window, 'resize', schedule, { passive: true });
    lifetime.listen(window, 'pageshow', schedule);
    lifetime.listen(document, 'visibilitychange', motion);
    lifetime.listen(reduced, 'change', () => { motion(); schedule(); });
    if ('IntersectionObserver' in window)
        new IntersectionObserver(entries => { inView = entries.some(entry => entry.isIntersecting); motion(); }, { threshold: 0 }).observe(section);
    paint();
    motion();
    schedule();
})();

}
