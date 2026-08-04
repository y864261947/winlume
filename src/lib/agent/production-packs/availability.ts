import type { ProductionPack } from "./contracts";
import type {
  CapabilityAvailability,
  CapabilityCatalog,
  CapabilityId,
} from "@/lib/studio/capabilities";

export type ProductionPackCapabilityRequirement = {
  id: CapabilityId;
  availability: CapabilityAvailability;
  reason?: string;
};

export type ProductionPackAvailability = {
  available: boolean;
  missingCapabilityIds: CapabilityId[];
  requirements: ProductionPackCapabilityRequirement[];
};

export function resolveProductionPackAvailability(
  pack: Pick<ProductionPack, "requiredCapabilities">,
  catalog: CapabilityCatalog,
): ProductionPackAvailability {
  const requirements = pack.requiredCapabilities.map((id) => {
    const capability = catalog.capabilities.find((entry) => entry.id === id);
    if (!capability) {
      return {
        id,
        availability: "unavailable" as const,
        reason: "能力不可用",
      };
    }
    return {
      id,
      availability: capability.availability,
      ...(capability.reason ? { reason: capability.reason } : {}),
    };
  });
  const missingCapabilityIds = requirements
    .filter((requirement) => requirement.availability !== "available")
    .map((requirement) => requirement.id);

  return {
    available: missingCapabilityIds.length === 0,
    missingCapabilityIds,
    requirements,
  };
}
