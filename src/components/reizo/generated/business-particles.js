/* eslint-disable */
// Generated from the supplied design; managed by createDesignScope.
export default function initialize(lifetime) {
const { document, window, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, IntersectionObserver, ResizeObserver, MutationObserver } = lifetime;
/* Soft continuous ribbons. No dotted orbit, marching pattern or random dust.
 * Three translucent streams travel right to left at gently varying speeds. */
(() => {
    'use strict';
    const canvas = document.getElementById('enterprise-particles');
    const hero = document.querySelector('.business-hero');
    if (!canvas || !hero)
        return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx)
        return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0, height = 0, ratio = 1, frame = 0, lastTime = 0, lastDraw = 0, time = 0;
    let inView = true, reduced = motion.matches;
    const motionEnabled = () => !reduced;
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const ribbons = [
        { base: .65, amplitude: .19, phase: .45, slope: -.11, speed: .36, colour: '86,129,195' },
        { base: .67, amplitude: .15, phase: 2.65, slope: .15, speed: .31, colour: '130,159,205' },
        { base: .72, amplitude: .12, phase: 4.4, slope: -.08, speed: .27, colour: '106,149,214' }
    ];
    // Speed gently varies but its derivative stays positive: no centre/right bounce.
    function phaseAt(band, t = time) { return t * ribbons[band].speed + .15 * Math.sin(t * .23 + band * 1.8); }
    function glintProgress(band, t = time) { return .84 - band * .31 - t * (.057 - band * .007) - .016 * Math.sin(t * .29 + band); }
    function point(u, band, offset = 0) {
        const r = ribbons[band];
        const travel = phaseAt(band);
        const breathing = Math.sin(time * .18 + band * 2.1) * .018;
        return {
            x: (u * 1.4 - .2) * width,
            y: height * (r.base + Math.sin(u * Math.PI * 1.55 + r.phase + travel) * (r.amplitude + breathing)
                + Math.sin(u * Math.PI * 3.1 + r.phase * 1.3 + travel * 2) * .012 + (u - .5) * r.slope)
                + offset + pointer.y * Math.sin(u * Math.PI) * 5
        };
    }
    function gradient(band, alpha) {
        const g = ctx.createLinearGradient(0, 0, width, height * .15), colour = ribbons[band].colour;
        g.addColorStop(0, 'rgba(' + colour + ',0)');
        g.addColorStop(.16, 'rgba(' + colour + ',' + (alpha * .8) + ')');
        g.addColorStop(.48, 'rgba(' + colour + ',' + alpha + ')');
        g.addColorStop(.81, 'rgba(' + colour + ',' + (alpha * .65) + ')');
        g.addColorStop(1, 'rgba(' + colour + ',0)');
        return g;
    }
    function stroke(band, lineWidth, alpha, offset = 0) {
        ctx.beginPath();
        for (let i = 0; i <= 96; i++) {
            const p = point(i / 96, band, offset);
            if (i === 0)
                ctx.moveTo(p.x, p.y);
            else
                ctx.lineTo(p.x, p.y);
        }
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = gradient(band, alpha);
        ctx.stroke();
    }
    function draw() {
        ctx.clearRect(0, 0, width, height);
        const scale = Math.min(width / 1200, 1);
        for (let band = 0; band < ribbons.length; band++) {
            // Layered wide washes, then closely blended fibres — never dash arrays.
            stroke(band, 76 * scale + 22, .035);
            stroke(band, 43 * scale + 15, .06);
            stroke(band, 22 * scale + 9, .085);
            for (let strand = 0; strand < 14; strand++) {
                const offset = (strand - 6.5) * (1.1 + scale * .35);
                stroke(band, 1.7, .05 + Math.sin(strand / 13 * Math.PI) * .035, offset);
            }
            stroke(band, 1, .15, -9 * scale);
        }
        // One soft highlight per stream; each wraps only beyond the viewport edges.
        for (let i = 0; i < 3; i++) {
            const u = ((glintProgress(i) % 1) + 1) % 1;
            const p = point(u, i, -3);
            const edgeFade = Math.min(1, u / .18, (1 - u) / .18);
            const alpha = (.32 + .06 * Math.sin(time * .3 + i)) * edgeFade;
            const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 18);
            glow.addColorStop(0, 'rgba(154,185,231,' + alpha + ')');
            glow.addColorStop(.3, 'rgba(176,200,235,' + (alpha * .5) + ')');
            glow.addColorStop(1, 'rgba(176,200,235,0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    function resize() {
        const r = hero.getBoundingClientRect();
        width = Math.max(1, r.width);
        height = Math.max(1, r.height);
        ratio = Math.min(devicePixelRatio || 1, 1.7);
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        draw();
        sync();
    }
    function shouldRun() { return motionEnabled() && inView && !document.hidden; }
    function tick(stamp) {
        frame = 0;
        if (!shouldRun()) {
            lastTime = 0;
            return;
        }
        if (lastTime)
            time += Math.min((stamp - lastTime) / 1000, .1);
        lastTime = stamp;
        pointer.x += (pointer.targetX - pointer.x) * .025;
        pointer.y += (pointer.targetY - pointer.y) * .025;
        if (stamp - lastDraw > 40) {
            draw();
            lastDraw = stamp;
        }
        frame = requestAnimationFrame(tick);
    }
    function sync() {
        if (shouldRun()) {
            if (!frame) {
                lastTime = 0;
                frame = requestAnimationFrame(tick);
            }
        }
        else {
            if (frame)
                cancelAnimationFrame(frame);
            frame = 0;
            lastTime = 0;
            draw();
        }
    }
    lifetime.listen(hero, 'pointermove', e => {
        if (e.pointerType === 'touch' || !motionEnabled())
            return;
        const r = hero.getBoundingClientRect();
        pointer.targetY = Math.max(-1, Math.min(1, (e.clientY - r.top) / r.height * 2 - 1));
    }, { passive: true });
    lifetime.listen(hero, 'pointerleave', () => { pointer.targetY = 0; }, { passive: true });
    lifetime.listen(document, 'visibilitychange', sync);
    lifetime.listen(motion, 'change', () => { reduced = motion.matches; sync(); });
    if ('IntersectionObserver' in window)
        new IntersectionObserver(entries => { inView = entries[0].isIntersecting; sync(); }, { threshold: .02 }).observe(hero);
    if ('ResizeObserver' in window)
        new ResizeObserver(resize).observe(hero);
    else
        lifetime.listen(window, 'resize', resize, { passive: true });
    resize();
})();

}
