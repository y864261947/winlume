import { describe, expect, it } from "vitest";
import { ConsoleRequestError, parseConsoleKeyInput, parseConsoleKeyPatchInput } from "./server";

const future = new Date(Date.now() + 86_400_000).toISOString();

describe("parseConsoleKeyInput", () => {
  it("requires a workspace and accepts expiry plus list fields", () => {
    expect(() => parseConsoleKeyInput({ name: "prod" })).toThrow(ConsoleRequestError);
    expect(
      parseConsoleKeyInput({
        name: "prod",
        organizationId: "org-1",
        expiresAt: future,
        modelScopes: [" gpt-4o ", "gpt-4o"],
        ipAllowList: ["203.0.113.10"],
      }),
    ).toEqual({
      name: "prod",
      organizationId: "org-1",
      expiresAt: new Date(future),
      allowedModels: ["gpt-4o"],
      ipAllowlist: ["203.0.113.10"],
    });
  });
});

describe("parseConsoleKeyPatchInput", () => {
  it("parses a full edit payload and rejects a past expiry", () => {
    expect(
      parseConsoleKeyPatchInput({
        name: "prod",
        expiresAt: "",
        modelScopes: ["gpt-4o"],
        ipAllowList: [],
      }),
    ).toEqual({
      name: "prod",
      expiresAt: null,
      allowedModels: ["gpt-4o"],
      ipAllowlist: [],
    });
    expect(() => parseConsoleKeyPatchInput({ name: "prod", expiresAt: "2020-01-01T00:00:00.000Z" }))
      .toThrow("过期时间必须晚于当前时间");
  });
});
