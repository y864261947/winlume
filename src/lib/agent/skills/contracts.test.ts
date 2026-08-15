import { describe, expect, it } from "vitest";
import {
  parseSkillContract,
  validateRelativeResourcePath,
} from "./contracts";

const validContract = {
  schemaVersion: 2,
  id: "production-content-intake",
  version: "1.0.0",
  stability: "stable",
  provenance: { owner: "reizo", source: "first-party" },
  requiredCapabilities: ["chat"],
  allowedTools: ["write_artifact"],
  inputs: [],
  outputs: [{ id: "brief", kinds: ["markdown"], required: true }],
  qualityChecks: ["brief contains audience and outcome"],
  approvalPolicy: "none",
  resources: [
    { path: "resources/brief-template.md", when: "creating the brief" },
  ],
};

describe("production Skill contracts", () => {
  it("accepts a first-party v2 manifest with a relative resource", () => {
    expect(
      parseSkillContract(
        JSON.stringify(validContract),
        "production-content-intake",
      ),
    ).toMatchObject({
      version: "1.0.0",
      resources: [
        { path: "resources/brief-template.md", when: "creating the brief" },
      ],
    });
  });

  it("accepts background removal as a production tool", () => {
    expect(
      parseSkillContract(
        JSON.stringify({ ...validContract, allowedTools: ["remove_background"] }),
        "production-content-intake",
      ),
    ).toMatchObject({ allowedTools: ["remove_background"] });
  });

  it("rejects ids, tools, capabilities, duplicate outputs, and resource paths outside the package", () => {
    expect(() =>
      parseSkillContract(
        JSON.stringify({ ...validContract, id: "wrong" }),
        "production-content-intake",
      ),
    ).toThrow();
    expect(() =>
      parseSkillContract(
        JSON.stringify({ ...validContract, allowedTools: ["shell_exec"] }),
        "production-content-intake",
      ),
    ).toThrow();
    expect(() =>
      parseSkillContract(
        JSON.stringify({ ...validContract, requiredCapabilities: ["filesystem"] }),
        "production-content-intake",
      ),
    ).toThrow();
    expect(() =>
      parseSkillContract(
        JSON.stringify({
          ...validContract,
          outputs: [
            { id: "brief", kinds: ["markdown"], required: true },
            { id: "brief", kinds: ["markdown"], required: true },
          ],
        }),
        "production-content-intake",
      ),
    ).toThrow();
    expect(() => validateRelativeResourcePath("../../.env")).toThrow();
    expect(() => validateRelativeResourcePath("C:\\secrets.txt")).toThrow();
    expect(() => validateRelativeResourcePath("resources\\brief.md")).toThrow();
  });
});
