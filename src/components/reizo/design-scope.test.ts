import { afterEach, describe, expect, it, vi } from "vitest";
import { createDesignScope } from "./design-scope";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("presentation lifetime", () => {
  function environment() {
    vi.useFakeTimers();
    const browser = Object.assign(new EventTarget(), { setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (fn: () => void) => setTimeout(fn, 16), cancelAnimationFrame: clearTimeout });
    const document = new EventTarget();
    const disconnect = vi.fn();
    class Observer { disconnect = disconnect; observe = vi.fn(); }
    vi.stubGlobal("window", browser);
    vi.stubGlobal("document", document);
    vi.stubGlobal("IntersectionObserver", Observer);
    vi.stubGlobal("ResizeObserver", Observer);
    vi.stubGlobal("MutationObserver", Observer);
    const root = Object.assign(new EventTarget(), { querySelector: vi.fn(), querySelectorAll: vi.fn(() => []) });
    return { scope: createDesignScope(root as unknown as HTMLElement), root, browser, document, disconnect };
  }
  it("cancels all animation work and listeners when navigating away", () => {
    const { scope, root, document, disconnect } = environment();
    const tick = vi.fn();
    scope.setTimeout(tick, 100);
    scope.setInterval(tick, 100);
    scope.requestAnimationFrame(tick);
    scope.listen(root, "click", tick);
    scope.listen(scope.document, "visibilitychange", tick);
    new scope.ResizeObserver(tick);
    root.dispatchEvent(new Event("click"));
    expect(tick).toHaveBeenCalledTimes(1);
    scope.dispose();
    vi.advanceTimersByTime(1000);
    root.dispatchEvent(new Event("click"));
    document.dispatchEvent(new Event("visibilitychange"));
    scope.setTimeout(tick, 0);
    vi.runOnlyPendingTimers();
    expect(tick).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
  it("isolates DOM queries and shared demo state from other pages", () => {
    const { scope, root, browser } = environment();
    scope.document.querySelector(".canvas-pane");
    expect(root.querySelector).toHaveBeenCalledWith(".canvas-pane");
    Reflect.set(scope.window, "ReizoThought", "demo");
    expect(Reflect.get(scope.window, "ReizoThought")).toBe("demo");
    expect(Reflect.get(browser, "ReizoThought")).toBeUndefined();
    scope.dispose();
  });
});
