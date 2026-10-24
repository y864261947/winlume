import type { PortalModelVendor } from "./content-config";

/** Prepare a local editor draft. Importing never changes published configuration. */
export function prepareCatalogImport(
  vendors: readonly PortalModelVendor[],
  candidate: PortalModelVendor,
): { draft: PortalModelVendor; editingId: string | null; addedCount: number } {
  const existing = vendors.find(
    (vendor) => vendor.key === candidate.key && vendor.category === candidate.category,
  );
  // A manually categorized model must not be copied back into its catalog category.
  // Model IDs are case-sensitive: do not lowercase, trim or infer aliases here.
  const names = new Set(vendors.flatMap((vendor) => vendor.models.map((model) => model.name)));
  const additions = candidate.models.filter((model) => {
    if (names.has(model.name)) return false;
    names.add(model.name);
    return true;
  });
  const base = existing ?? { ...candidate, enabled: false, models: [] };
  return {
    editingId: existing?.id ?? null,
    addedCount: additions.length,
    draft: {
      ...base,
      models: [...base.models, ...additions].map((model) => ({
        ...model,
        endpointTypes: [...model.endpointTypes],
      })),
    },
  };
}
