import { describe, expect, it } from "vitest";
import {
  buildIdempotencyHeaders,
  buildReconnectApi,
  buildSendRequestBody,
  extractLastMessageText,
  findReusableOptimisticUserMessageId,
} from "./v2-transport";

describe("extractLastMessageText", () => {
  it("joins only text parts of the last message", () => {
    const messages = [
      { id: "u1", parts: [{ type: "text", text: "ignored, not last" }] },
      {
        id: "u2",
        parts: [
          { type: "text", text: "你好" },
          { type: "reasoning", text: "should not appear" },
          { type: "text", text: "，世界" },
        ],
      },
    ];
    expect(extractLastMessageText(messages)).toBe("你好，世界");
  });

  it("returns an empty string for no messages", () => {
    expect(extractLastMessageText([])).toBe("");
  });
});

describe("buildSendRequestBody", () => {
  it("merges sessionId, the extracted message text, and override fields", () => {
    const messages = [{ id: "u1", parts: [{ type: "text", text: "hi" }] }];
    const body = buildSendRequestBody("session-1", messages, {
      model: "gpt-5.4",
      bootstrap: { title: "hi" },
    });
    expect(body).toEqual({
      sessionId: "session-1",
      message: "hi",
      executionMode: "ai-sdk",
      model: "gpt-5.4",
      bootstrap: { title: "hi" },
    });
  });

  it("omits override fields entirely when none are given", () => {
    const body = buildSendRequestBody("session-1", [], undefined);
    expect(body).toEqual({ sessionId: "session-1", message: "", executionMode: "ai-sdk" });
  });
});

describe("buildIdempotencyHeaders", () => {
  it("keys off the last message's own id when present", () => {
    const messages = [{ id: "user-msg-1" }];
    expect(buildIdempotencyHeaders(messages, "fallback")).toEqual({
      "idempotency-key": "user-msg-1",
    });
  });

  it("falls back to the provided messageId when there is no last message", () => {
    expect(buildIdempotencyHeaders([], "fallback-id")).toEqual({
      "idempotency-key": "fallback-id",
    });
  });

  it("returns undefined when neither a message id nor a fallback exists", () => {
    expect(buildIdempotencyHeaders([], undefined)).toBeUndefined();
  });
});

describe("findReusableOptimisticUserMessageId", () => {
  it("returns the pending-user- bubble's id when text matches exactly", () => {
    const prev = [
      { id: "pending-user-session-1", role: "user", parts: [{ type: "text", text: "写一份周报" }] },
    ];
    expect(findReusableOptimisticUserMessageId(prev, "写一份周报")).toBe(
      "pending-user-session-1",
    );
  });

  it("returns undefined when the last message isn't a pending-user- bubble", () => {
    const prev = [{ id: "user-1", role: "user", parts: [{ type: "text", text: "写一份周报" }] }];
    expect(findReusableOptimisticUserMessageId(prev, "写一份周报")).toBeUndefined();
  });

  it("returns undefined when the text doesn't match", () => {
    const prev = [
      { id: "pending-user-session-1", role: "user", parts: [{ type: "text", text: "写一份周报" }] },
    ];
    expect(findReusableOptimisticUserMessageId(prev, "改成写一份月报")).toBeUndefined();
  });

  it("returns undefined for an empty message list", () => {
    expect(findReusableOptimisticUserMessageId([], "写一份周报")).toBeUndefined();
  });
});

describe("buildReconnectApi", () => {
  it("builds the reconnect endpoint from a known run id", () => {
    expect(buildReconnectApi("run-123")).toBe("/api/runs/run-123/stream");
  });

  it("throws when there is no active run to reconnect to", () => {
    expect(() => buildReconnectApi(null)).toThrow(/no active run/i);
  });
});
