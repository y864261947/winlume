import { afterEach, describe, expect, it } from "vitest";
import {
  getUnreadSessionIds,
  noteLiveChatBecameIdle,
  resetUnreadSessionsForTests,
  setViewedStudioSession,
} from "./session-unread";

describe("session-unread", () => {
  afterEach(() => {
    resetUnreadSessionsForTests();
  });

  it("marks a finished background session unread", () => {
    setViewedStudioSession("current");
    noteLiveChatBecameIdle("other");
    expect([...getUnreadSessionIds()]).toEqual(["other"]);
  });

  it("does not mark the session you are looking at", () => {
    setViewedStudioSession("current");
    noteLiveChatBecameIdle("current");
    expect(getUnreadSessionIds().size).toBe(0);
  });

  it("clears the dot when you open that session", () => {
    setViewedStudioSession("a");
    noteLiveChatBecameIdle("b");
    setViewedStudioSession("b");
    expect(getUnreadSessionIds().has("b")).toBe(false);
  });
});
