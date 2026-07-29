import { describe, expect, it } from "vitest";
import {
  buildReferencedArtifactReminder,
  buildReferencedArtifactsReminder,
  toGatewayMessages,
} from "./runtime";
import type { Artifact, Message } from "./types";

describe("toGatewayMessages", () => {
  it("includes system, user, assistant, tool rounds", () => {
    const history: Message[] = [
      {
        id: "u1",
        sessionId: "s",
        role: "user",
        content: "写大纲并保存",
        createdAt: "t1",
      },
      {
        id: "a1",
        sessionId: "s",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "call_1",
            name: "write_artifact",
            arguments: '{"name":"x","kind":"markdown","content":"# hi"}',
          },
        ],
        createdAt: "t2",
      },
      {
        id: "t1",
        sessionId: "s",
        role: "tool",
        content: '{"id":"art1"}',
        toolCallId: "call_1",
        createdAt: "t3",
      },
      {
        id: "a2",
        sessionId: "s",
        role: "assistant",
        content: "已保存",
        createdAt: "t4",
      },
    ];

    const msgs = toGatewayMessages("BASE", history);
    expect(msgs[0]).toEqual({ role: "system", content: "BASE" });
    expect(msgs[1]).toMatchObject({ role: "user", content: "写大纲并保存" });
    expect(msgs[2]).toMatchObject({
      role: "assistant",
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "write_artifact" },
        },
      ],
    });
    expect(msgs[3]).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: '{"id":"art1"}',
    });
    expect(msgs[4]).toEqual({ role: "assistant", content: "已保存" });
  });

  it("skips tool messages without toolCallId", () => {
    const history: Message[] = [
      {
        id: "t1",
        sessionId: "s",
        role: "tool",
        content: "orphan",
        createdAt: "t",
      },
    ];
    expect(toGatewayMessages("S", history)).toEqual([
      { role: "system", content: "S" },
    ]);
  });
});

describe("buildReferencedArtifactReminder", () => {
  it("returns empty string when there is no referenced artifact", () => {
    expect(buildReferencedArtifactReminder(null)).toBe("");
  });

  it("names the artifact and its id, and instructs the model not to guess", () => {
    const artifact: Artifact = {
      id: "art-42",
      userId: "u1",
      sessionId: "s1",
      name: "Fox",
      kind: "image",
      mimeType: "image/png",
      storageKey: "",
      createdAt: "t1",
    };
    const reminder = buildReferencedArtifactReminder(artifact);
    expect(reminder).toContain("<system-reminder>");
    expect(reminder).toContain("Fox");
    expect(reminder).toContain("art-42");
    expect(reminder).toContain("sourceArtifactId");
    expect(reminder).toContain("do not invent");
  });

  it("lists multiple @-mentioned artifacts", () => {
    const artifacts: Artifact[] = [
      {
        id: "a1",
        userId: "u1",
        sessionId: "s1",
        name: "图片1",
        kind: "image",
        mimeType: "image/png",
        storageKey: "",
        createdAt: "t1",
      },
      {
        id: "a2",
        userId: "u1",
        sessionId: "s1",
        name: "图片2",
        kind: "image",
        mimeType: "image/png",
        storageKey: "",
        createdAt: "t1",
      },
    ];
    const reminder = buildReferencedArtifactsReminder(artifacts);
    expect(reminder).toContain("@图片1");
    expect(reminder).toContain("@图片2");
    expect(reminder).toContain("a1");
    expect(reminder).toContain("a2");
    expect(reminder).toContain('sourceArtifactIds containing the needed ids from this list (["a1","a2"])');
    expect(reminder).toContain("send every image");
    expect(reminder).not.toContain("describe every listed id in the prompt");
  });
});
