import { describe, expect, it } from "vitest";
import { showsMessageAvatar } from "./chat-message-presentation";

describe("chat message presentation", () => {
  it("uses one assistant avatar across a tool round and its final summary", () => {
    const messages = [
      { role: "user" as const },
      { role: "assistant" as const },
      { role: "assistant" as const },
    ];

    expect(showsMessageAvatar(messages, 1)).toBe(true);
    expect(showsMessageAvatar(messages, 2)).toBe(false);
  });

  it("starts a new assistant avatar after a user reply", () => {
    const messages = [
      { role: "assistant" as const },
      { role: "user" as const },
      { role: "assistant" as const },
    ];

    expect(showsMessageAvatar(messages, 2)).toBe(true);
  });
});
