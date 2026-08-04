import type { CapabilityCatalog } from "@/lib/studio/capabilities";
import {
  STUDIO_TOOL_NAMES,
  type StudioToolName,
} from "@/lib/agent/tools/definitions";
import { getSkill } from "@/lib/agent/skills/registry";
import type { ProductionPack, ProductionStage } from "./contracts";

export function selectedWorkflowModel(catalog: CapabilityCatalog): string {
  const chat = catalog.capabilities.find(
    (entry) => entry.id === "chat" && entry.availability === "available",
  );
  return chat?.effectiveModel ?? catalog.models[0] ?? "gpt-4o-mini";
}

export async function resolveWorkflowAllowedTools(
  pack: ProductionPack,
  stage: ProductionStage,
  catalog: CapabilityCatalog,
): Promise<StudioToolName[] | null> {
  const skills = await Promise.all(stage.skillIds.map((id) => getSkill(id)));
  if (skills.some((skill) => !skill?.contract)) return null;

  const skillTools = new Set(
    skills.flatMap((skill) => skill?.contract?.allowedTools ?? []),
  );
  const capabilityTools = new Set(
    pack.requiredCapabilities.flatMap(
      (id) =>
        catalog.capabilities.find(
          (capability) =>
            capability.id === id && capability.availability === "available",
        )?.supportedTools ?? [],
    ),
  );
  const platformTools = new Set<string>(STUDIO_TOOL_NAMES);
  const allowedTools = stage.allowedTools.filter(
    (name): name is StudioToolName =>
      platformTools.has(name) && skillTools.has(name) && capabilityTools.has(name),
  );
  return allowedTools.length === stage.allowedTools.length ? allowedTools : null;
}
