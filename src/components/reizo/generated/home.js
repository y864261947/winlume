/* eslint-disable */
// Generated from the supplied design; managed by createDesignScope.
export default function initialize(lifetime) {
const { document, window, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, IntersectionObserver, ResizeObserver, MutationObserver } = lifetime;
/* Homepage demonstrations: deterministic examples, no generated claims or network calls. */
(() => {
    'use strict';
    const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    // Appearance is shared with all product pages through site-theme.js.
    // The desktop experience owns scene tabs, conversation playback, and canvas.
    const code = {
        python: 'from openai import OpenAI\n\nclient = OpenAI(\n    api_key="YOUR_API_KEY",\n    base_url="YOUR_REIZO_API_BASE"\n)\n\nresponse = client.chat.completions.create(\n    model="YOUR_MODEL_ID",\n    messages=[{"role": "user", "content": "你好"}]\n)\nprint(response.choices[0].message.content)',
        javascript: 'import OpenAI from "openai";\n\nconst client = new OpenAI({\n  apiKey: process.env.REIZO_API_KEY,\n  baseURL: process.env.REIZO_API_BASE\n});\n\nconst response = await client.chat.completions.create({\n  model: "YOUR_MODEL_ID",\n  messages: [{ role: "user", content: "你好" }]\n});\nconsole.log(response.choices[0].message.content);',
        curl: 'curl "$REIZO_API_BASE/chat/completions" \\\n  -H "Authorization: Bearer $REIZO_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "model": "YOUR_MODEL_ID",\n    "messages": [\n      {"role": "user", "content": "你好"}\n    ]\n  }\''
    };
    let language = 'python', toastTimer;
    function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2600); }
    function paintCode() { $('#code-content').textContent = code[language]; const pane = $('.api-example pre'); pane.scrollTop = 0; pane.scrollLeft = 0; $$('[data-code]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.code === language))); }
    $$('[data-code]').forEach(b => lifetime.listen(b, 'click', () => { language = b.dataset.code; paintCode(); }));
    lifetime.listen($('#copy-code'), 'click', async () => { try {
        await navigator.clipboard.writeText(code[language]);
        toast('代码已复制');
    }
    catch {
        toast('暂时无法复制，请选中代码手动复制。');
    } });
    paintCode();
    const models = [['jina', 'Jina Reader'], ['minimax', 'MiniMax'], ['openrouter', 'OpenRouter'], ['groq', 'Groq'], ['elevenlabs', 'ElevenLabs'], ['gemini', 'Gemini'], ['deepseek', 'DeepSeek'], ['qwen', '通义千问']];
    const modelLinks = models.map(([id, name]) => `<a class="model-card" href="/models?ui=20261007#catalog" aria-label="查看 ${name} 的模型目录"><img src="/reizo/assets/${id}.svg" alt="" loading="lazy"><strong>${name}</strong></a>`).join('');
    $('#home-model-track').innerHTML = `<div class="model-set">${modelLinks}</div><div class="model-set" aria-hidden="true">${modelLinks.replaceAll('<a class=', '<a tabindex="-1" class=')}</div>`;
    let modelPaused = false;
    lifetime.listen($('#model-motion'), 'click', () => { modelPaused = !modelPaused; $('.model-marquee').classList.toggle('is-paused', modelPaused); $('#model-motion').setAttribute('aria-pressed', String(modelPaused)); $('#model-motion').textContent = modelPaused ? '▷' : 'Ⅱ'; $('#model-motion').setAttribute('aria-label', modelPaused ? '继续模型滚动' : '暂停模型滚动'); });
    document.body.classList.add('has-api-reveal');
    new IntersectionObserver(([entry]) => {
        $('#developers').classList.toggle('is-active', entry.isIntersecting);
    }, { rootMargin: '-25% 0px -25% 0px' }).observe($('#developers'));
    // Native scrolling drives three mutually replacing panels and the gallery reveal.
    let scrollPending = false;
    const clamp = n => Math.max(0, Math.min(1, n));
    const ease = n => { const t = clamp(n); return t * t * (3 - 2 * t); };
    function updateScroll() {
        scrollPending = false;
        const section = $('.story-section'), rect = section.getBoundingClientRect(), sticky = $('.story-sticky');
        const p = clamp((90 - rect.top) / Math.max(1, rect.height - sticky.offsetHeight - 90));
        const first = ease((p - .18) / .22), second = ease((p - .56) / .22);
        const positions = [-first * 115, (1 - first) * 115 - second * 115, (1 - second) * 115];
        const opacity = [1 - first, first * (1 - second), second];
        $$('.story-phase').forEach((panel, i) => {
            panel.style.setProperty('--phase-y', `${positions[i]}%`);
            panel.style.setProperty('--phase-opacity', String(opacity[i]));
            panel.setAttribute('aria-hidden', String(!(motion.matches || innerHeight <= 600) && opacity[i] < .5));
        });
        const gallery = $('#results'), stage = $('.gallery-stage'), galleryRect = gallery.getBoundingClientRect();
        const progress = clamp((90 - galleryRect.top) / Math.max(1, gallery.offsetHeight - stage.offsetHeight - 90));
        const height = stage.clientHeight, stride = height * .72;
        const pieces = $$('.gallery-piece');
        const slots = Math.max(...pieces.map(card => Number(card.dataset.gallerySlot))) + 1;
        const travel = (slots - 1) * stride + height * 1.05;
        pieces.forEach(card => {
            const side = Number(card.dataset.gallerySide), slot = Number(card.dataset.gallerySlot);
            const y = height * (side ? .02 : .36) + slot * stride - progress * travel;
            const visibility = clamp((height - y) / 70) * clamp((y + card.offsetHeight) / 70);
            card.style.setProperty('--gallery-y', `${y}px`);
            card.style.setProperty('--gallery-opacity', String(motion.matches ? 1 : visibility));
            card.style.setProperty('--gallery-angle', `${side ? 3 : -3}deg`);
            card.setAttribute('aria-hidden', String(!motion.matches && visibility === 0));
        });
    }
    function onScroll() { if (!scrollPending) {
        scrollPending = true;
        requestAnimationFrame(updateScroll);
    } }
    lifetime.listen(window, 'scroll', onScroll, { passive: true });
    lifetime.listen(window, 'resize', onScroll);
    updateScroll();
    lifetime.listen(motion, 'change', updateScroll);
    const langToggle = $('#language-toggle'), langMenu = $('#language-menu');
    lifetime.listen(langToggle, 'click', () => { langMenu.hidden = !langMenu.hidden; langToggle.setAttribute('aria-expanded', String(!langMenu.hidden)); });
    lifetime.listen(document, 'click', e => { if (!e.target.closest('.language-picker')) {
        langMenu.hidden = true;
        langToggle.setAttribute('aria-expanded', 'false');
    } });
    lifetime.listen(document, 'keydown', e => { if (e.key === 'Escape' && !langMenu.hidden) {
        langMenu.hidden = true;
        langToggle.setAttribute('aria-expanded', 'false');
        langToggle.focus();
    } });
})();

}
