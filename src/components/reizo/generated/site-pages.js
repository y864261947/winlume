/* eslint-disable */
// Generated from the supplied design; managed by createDesignScope.
export default function initialize(lifetime) {
const { document, window, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, IntersectionObserver, ResizeObserver, MutationObserver } = lifetime;
/* New-site navigation and local briefing drafts. No network submission or persistence. */
(() => {
    document.querySelectorAll('[data-draft-form]').forEach(form => {
        const scope = form.querySelector('[data-draft-result]') || document.querySelector('[data-draft-result]');
        lifetime.listen(form, 'submit', event => {
            event.preventDefault();
            if (!form.reportValidity())
                return;
            const rows = [...new FormData(form)].map(([key, value]) => key + '：' + (String(value).trim() || '未填写'));
            scope.querySelector('[data-draft-output]').textContent = form.dataset.draftForm + '\n\n' + rows.join('\n\n') + '\n\n本页草稿，尚未发送。';
            scope.querySelector('[data-copy-status]').textContent = '';
            scope.hidden = false;
            scope.scrollIntoView({ block: 'nearest' });
        });
        form.querySelector('[type="submit"]').disabled = false;
        lifetime.listen(scope.querySelector('.sub-copy'), 'click', async () => {
            const status = scope.querySelector('[data-copy-status]');
            try {
                await navigator.clipboard.writeText(scope.querySelector('[data-draft-output]').textContent);
                status.textContent = '已复制。内容未向外发送。';
            }
            catch {
                status.textContent = '无法自动复制，请手动选中上方摘要。';
            }
        });
    });
})();

}
