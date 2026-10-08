import { afterEach, describe, expect, it, vi } from "vitest";
import { clearOAuthWelcome, consumeOAuthWelcome, loginGreeting, markOAuthWelcome } from "./login-welcome";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("login welcome", () => {
  it.each([[4, "晚上好"], [5, "早上好"], [10, "早上好"], [11, "中午好"], [13, "中午好"], [14, "下午好"], [17, "下午好"], [18, "晚上好"]])("greets using local hour %i", (hour, greeting) => {
    expect(loginGreeting("真实用户", new Date(2026, 8, 29, hour))).toBe(`${greeting}，真实用户`);
  });

  function storage() {
    const values = new Map<string, string>();
    vi.stubGlobal("window", { sessionStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  }

  it("plays a confirmed OAuth return only once, not again on refresh", () => {
    storage();
    expect(consumeOAuthWelcome()).toBe(false);
    markOAuthWelcome();
    expect(consumeOAuthWelcome()).toBe(true);
    expect(consumeOAuthWelcome()).toBe(false);
  });

  it("does not retain a cancelled, failed or expired login intent", () => {
    storage();
    vi.useFakeTimers();
    markOAuthWelcome();
    clearOAuthWelcome();
    expect(consumeOAuthWelcome()).toBe(false);
    markOAuthWelcome();
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(consumeOAuthWelcome()).toBe(false);
  });

  it("does not break authentication if browser storage is blocked", () => {
    vi.stubGlobal("window", { get sessionStorage() { throw new Error("Storage denied"); } });
    expect(markOAuthWelcome).not.toThrow();
    expect(clearOAuthWelcome).not.toThrow();
    expect(consumeOAuthWelcome()).toBe(false);
  });
});
