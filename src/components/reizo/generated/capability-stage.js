/* eslint-disable */
// Generated from the supplied design; managed by createDesignScope.
export default function initialize(lifetime) {
const { document, window, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, IntersectionObserver, ResizeObserver, MutationObserver } = lifetime;
(() => {
    'use strict';
    const section = document.querySelector('.capability-section');
    if (!section)
        return;
    const stage = section.querySelector('.capability-stage');
    const cards = [...stage.querySelectorAll('.capability-card')];
    const caption = document.querySelector('#capability-caption');
    const pause = document.querySelector('#capability-pause');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    // Presentation labels only; these previews do not make model/API calls.
    const models = [
        ['GPT Image 2', 'openai'], ['GPT Image 2', 'openai'],
        ['Gemini', 'gemini'], ['Claude', 'anthropic'],
        ['Claude', 'anthropic'], ['DeepSeek', 'deepseek'], ['Claude', 'anthropic']
    ];
    cards.forEach((card, index) => {
        const footer = card.querySelector('footer');
        const type = footer.querySelector('span').textContent;
        footer.replaceChildren();
        const label = document.createElement('span');
        label.textContent = models[index][0];
        const icon = document.createElement('img');
        icon.src = `/reizo/assets/${models[index][1]}.svg`;
        icon.alt = '';
        footer.append(label, icon);
        card.setAttribute('aria-label', `${type} · ${models[index][0]}`);
    });
    function setCaption(index) {
        const model = document.createElement('strong');
        const icon = document.createElement('img');
        icon.src = `/reizo/assets/${models[index][1]}.svg`;
        icon.alt = '';
        model.append(icon, models[index][0]);
        caption.replaceChildren('用 ', model, ' 在 REIZO 制作');
    }
    let scheduled = false;
    let active = -1;
    let progress = 0;
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    function render() {
        scheduled = false;
        if (reduced.matches)
            return;
        const rect = section.getBoundingClientRect();
        const distance = Math.max(1, section.offsetHeight - innerHeight);
        progress = clamp(-rect.top / distance, 0, 1) * (cards.length - 1);
        const narrow = innerWidth <= 600;
        const focusX = narrow ? 8 : 6 + Math.min(progress / 2, 1) * 23;
        const spacing = narrow ? 70 : innerWidth <= 850 ? 43 : 32;
        cards.forEach((card, index) => {
            const depth = index - progress;
            const scale = Math.pow(.69, Math.abs(depth));
            const offset = Math.sign(depth) * spacing * (1 - Math.pow(.76, Math.abs(depth))) / .24;
            const x = stage.clientWidth * (focusX + offset) / 100;
            card.style.transform = `translate3d(${x}px,-50%,0) scale(${scale})`;
            card.style.zIndex = String(100 - Math.round(Math.abs(depth) * 10));
            card.style.opacity = Math.abs(depth) > 5 ? '0' : '1';
        });
        const next = Math.round(progress);
        if (next !== active) {
            active = next;
            cards.forEach((card, i) => card.classList.toggle('is-front', i === active));
            setCaption(active);
        }
    }
    function schedule() {
        if (!scheduled) {
            scheduled = true;
            requestAnimationFrame(render);
        }
    }
    lifetime.listen(window, 'scroll', schedule, { passive: true });
    lifetime.listen(window, 'resize', schedule, { passive: true });
    lifetime.listen(reduced, 'change', () => { updateMotion(); schedule(); });
    let visible = false;
    function updateMotion() {
        section.classList.toggle('is-running', visible && !document.hidden && !reduced.matches);
    }
    new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        updateMotion();
    }).observe(section);
    lifetime.listen(document, 'visibilitychange', updateMotion);
    lifetime.listen(pause, 'click', () => {
        const paused = section.classList.toggle('is-paused');
        pause.setAttribute('aria-pressed', String(paused));
        pause.setAttribute('aria-label', paused ? '播放画面动效' : '暂停画面动效');
        pause.textContent = paused ? '▶' : 'Ⅱ';
    });
    lifetime.listen(stage, 'keydown', event => {
        if (reduced.matches || !['ArrowLeft', 'ArrowRight'].includes(event.key))
            return;
        event.preventDefault();
        const next = clamp(Math.round(progress) + (event.key === 'ArrowRight' ? 1 : -1), 0, cards.length - 1);
        const top = section.getBoundingClientRect().top + scrollY;
        scrollTo({ top: top + next / (cards.length - 1) * (section.offsetHeight - innerHeight), behavior: 'smooth' });
    });
    const benefits = document.querySelector('.api-benefits-stage');
    if (benefits)
        new IntersectionObserver(entries => {
            benefits.classList.toggle('is-running', entries[0].isIntersecting && !reduced.matches);
        }).observe(benefits);
    cards[0].classList.add('is-front');
    setCaption(0);
    render();
})();

}
