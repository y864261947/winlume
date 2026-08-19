export type WorkSceneId =
  | "content-office"
  | "growth-commerce"
  | "video-creation"
  | "developer-api"
  | "agent-automation";

export type WorkScene = {
  id: WorkSceneId;
  label: string;
  summary: string;
  skillIds: readonly string[];
  recommendedArtifactKinds: readonly string[];
};

/**
 * A scene is a discovery lens, never an Artifact type or a hard runtime mode.
 * The Skill ids below are intentionally explicit so scene URLs remain stable.
 */
export const WORK_SCENES: readonly WorkScene[] = [
  {
    id: "content-office",
    label: "内容与办公",
    summary: "研究、文档与演示提纲",
    skillIds: [
      "production-content-intake",
      "production-content-research",
      "production-content-draft",
      "production-content-review",
    ],
    recommendedArtifactKinds: ["markdown", "canvas", "sheet"],
  },
  {
    id: "growth-commerce",
    label: "增长与电商",
    summary: "内容策划、店铺运营与渠道增长",
    skillIds: [
      "marketing-content-creator",
      "marketing-ecommerce-operator",
      "marketing-growth-hacker",
    ],
    recommendedArtifactKinds: ["markdown", "image"],
  },
  {
    id: "video-creation",
    label: "视频创作",
    summary: "选题、脚本、视觉叙事与短视频优化",
    skillIds: [
      "marketing-short-video-editing-coach",
      "marketing-video-optimization-specialist",
      "design-visual-storyteller",
    ],
    recommendedArtifactKinds: ["markdown", "image", "video"],
  },
  {
    id: "developer-api",
    label: "开发与 API",
    summary: "架构、实现、评审与接口交付",
    skillIds: [
      "engineering-backend-architect",
      "engineering-frontend-developer",
      "engineering-code-reviewer",
    ],
    recommendedArtifactKinds: ["markdown", "text", "json", "canvas"],
  },
  {
    id: "agent-automation",
    label: "智能体与自动化",
    summary: "编排、治理与可观测自动化",
    skillIds: [
      "agents-orchestrator",
      "automation-governance-architect",
      "engineering-devops-automator",
    ],
    recommendedArtifactKinds: ["markdown", "json", "canvas"],
  },
] as const;

export function getWorkScene(
  raw: string | null | undefined,
): WorkScene | null {
  const id = raw?.trim() ?? "";
  return WORK_SCENES.find((scene) => scene.id === id) ?? null;
}

export function skillsForScene(raw: string | null | undefined): string[] {
  return [...(getWorkScene(raw)?.skillIds ?? [])];
}
