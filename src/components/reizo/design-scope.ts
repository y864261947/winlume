/** Give the original presentation animations a React lifetime, without global patches. */
export function createDesignScope(root: HTMLElement, surface: HTMLElement = root) {
  let disposed = false;
  const cleanups: Array<() => void> = [];
  const timers = new Set<number>();
  const intervals = new Set<number>();
  const frames = new Set<number>();
  const localGlobals: Record<PropertyKey, unknown> = {};
  const scopedDocument = new Proxy(document, {
    get(target, key) {
      if (key === "querySelector") return root.querySelector.bind(root);
      if (key === "querySelectorAll") return root.querySelectorAll.bind(root);
      if (key === "getElementById") return (id: string) => root.querySelector(`#${CSS.escape(id)}`);
      if (key === "body") return surface;
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const scopedWindow = new Proxy(window, {
    get(target, key) {
      if (key in localGlobals) return localGlobals[key];
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(_target, key, value) { localGlobals[key] = value; return true; },
  });
  const scope = {
    document: scopedDocument,
    window: scopedWindow,
    listen(target: EventTarget | null | undefined, event: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean) {
      if (!target || disposed) return;
      // Proxies cannot be EventTarget receivers.
      const actual = target === scopedDocument ? document : target === scopedWindow ? window : target;
      actual.addEventListener(event, listener, options);
      cleanups.push(() => actual.removeEventListener(event, listener, options));
    },
    setTimeout(callback: () => void, delay = 0) {
      if (disposed) return 0;
      const id = window.setTimeout(() => { timers.delete(id); if (!disposed) callback(); }, delay);
      timers.add(id); return id;
    },
    clearTimeout(id: number) { window.clearTimeout(id); timers.delete(id); },
    setInterval(callback: () => void, delay: number) {
      if (disposed) return 0;
      const id = window.setInterval(() => { if (!disposed) callback(); }, delay);
      intervals.add(id); return id;
    },
    clearInterval(id: number) { window.clearInterval(id); intervals.delete(id); },
    requestAnimationFrame(callback: FrameRequestCallback) {
      if (disposed) return 0;
      const id = window.requestAnimationFrame(time => { frames.delete(id); if (!disposed) callback(time); });
      frames.add(id); return id;
    },
    cancelAnimationFrame(id: number) { window.cancelAnimationFrame(id); frames.delete(id); },
    IntersectionObserver: class extends IntersectionObserver {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        super((entries, observer) => { if (!disposed) callback(entries, observer); }, options);
        cleanups.push(() => this.disconnect());
      }
    },
    ResizeObserver: class extends ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        super((entries, observer) => { if (!disposed) callback(entries, observer); });
        cleanups.push(() => this.disconnect());
      }
    },
    MutationObserver: class extends MutationObserver {
      constructor(callback: MutationCallback) {
        super((entries, observer) => { if (!disposed) callback(entries, observer); });
        cleanups.push(() => this.disconnect());
      }
    },
    dispose() {
      disposed = true;
      cleanups.reverse().forEach(cleanup => cleanup());
      timers.forEach(id => window.clearTimeout(id));
      intervals.forEach(id => window.clearInterval(id));
      frames.forEach(id => window.cancelAnimationFrame(id));
    },
  };
  return scope;
}
