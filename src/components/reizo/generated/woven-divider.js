/* eslint-disable */
// Generated from the supplied design; managed by createDesignScope.
export default function initialize(lifetime) {
const { document, window, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, IntersectionObserver, ResizeObserver, MutationObserver } = lifetime;
(() => {
    const divider = document.querySelector('[data-woven-divider]');
    if (!divider)
        return;
    const svg = divider.querySelector('svg');
    const ns = 'http://www.w3.org/2000/svg';
    const make = (tag, attrs, parent = svg) => {
        const node = document.createElementNS(ns, tag);
        Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
        parent.append(node);
        return node;
    };
    const render = width => {
        svg.replaceChildren();
        svg.setAttribute('viewBox', `0 0 ${width} 112`);
        const defs = make('defs', {});
        const strands = [];
        // The two diagonal families alternate over/under; the horizontal threads bind them.
        for (let i = 0; i < Math.ceil(width / 38) + 3; i++) {
            const x = -76 + i * 38;
            const delay = Math.max(0, x / width) * 4.2;
            strands.push({ x, y: 18, dx: 76, dy: 76, tone: i % 2 ? 'sage' : 'cream', family: 0, index: i, delay });
            strands.push({ x, y: 94, dx: 76, dy: -76, tone: '', family: 1, index: i, delay: delay + .18 });
        }
        [31, 57, 83].forEach((y, i) => strands.push({ x: -8, y, dx: width + 16, dy: 0, tone: i === 1 ? 'sage' : '', family: 2, index: i, delay: i * .16 }));
        const path = (s, from = 0, to = 1) => `M${s.x + s.dx * from},${s.y + s.dy * from}L${s.x + s.dx * to},${s.y + s.dy * to}`;
        const base = make('g', {});
        const crossings = make('g', {});
        strands.forEach((s, i) => {
            s.length = Math.hypot(s.dx, s.dy);
            s.clip = `weave-thread-${i}`;
            const clip = make('clipPath', { id: s.clip, clipPathUnits: 'userSpaceOnUse', transform: `translate(${s.x} ${s.y}) rotate(${Math.atan2(s.dy, s.dx) * 180 / Math.PI})` }, defs);
            make('rect', { x: -4, y: -5, width: s.length + 8, height: 10, class: `woven-reveal${s.family === 2 ? ' woven-spine' : ''}`, style: `--thread-delay:${s.delay.toFixed(2)}s` }, clip);
            const group = make('g', { 'clip-path': `url(#${s.clip})` }, base);
            make('path', { d: path(s), class: `woven-thread ${s.tone}` }, group);
            make('path', { d: path(s), class: 'woven-glint' }, group);
        });
        // Draw short bridges, not a flat lattice: each intersection has a visible underpass.
        strands.forEach((a, i) => strands.slice(i + 1).forEach(b => {
            if (a.family === b.family)
                return;
            const cross = (x, y, u, v) => x * v - y * u;
            const det = cross(a.dx, a.dy, b.dx, b.dy);
            const t = cross(b.x - a.x, b.y - a.y, b.dx, b.dy) / det;
            const u = cross(b.x - a.x, b.y - a.y, a.dx, a.dy) / det;
            if (t < .035 || t > .965 || u < .035 || u > .965)
                return;
            const over = (a.index + b.index + a.family + b.family) % 2 === 0 ? a : b;
            const center = over === a ? t : u;
            const d = path(over, center - 5 / over.length, center + 5 / over.length);
            const bridge = make('g', { 'clip-path': `url(#${over.clip})` }, crossings);
            make('path', { d, class: 'woven-clearance' }, bridge);
            make('path', { d, class: `woven-thread ${over.tone}` }, bridge);
            make('path', { d, class: 'woven-glint' }, bridge);
        }));
    };
    // Repeat at a consistent scale rather than stretching a small motif.
    let lastWidth = 0;
    new ResizeObserver(([entry]) => {
        const scale = innerWidth <= 600 ? 112 / 88 : 1;
        const width = Math.round(entry.contentRect.width * scale);
        if (width && width !== lastWidth) {
            lastWidth = width;
            render(width);
        }
    }).observe(svg);
    const pause = divider.querySelector('button');
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    let paused = false;
    const sync = () => divider.classList.toggle('is-running', visible && !paused && !document.hidden && !motion.matches);
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }, { threshold: .2 }).observe(divider);
    lifetime.listen(document, 'visibilitychange', sync);
    lifetime.listen(motion, 'change', sync);
    lifetime.listen(pause, 'click', () => {
        paused = !paused;
        pause.setAttribute('aria-pressed', String(paused));
        pause.setAttribute('aria-label', paused ? '播放编织动画' : '暂停编织动画');
        pause.firstElementChild.textContent = paused ? '▷' : 'Ⅱ';
        sync();
    });
})();

}
