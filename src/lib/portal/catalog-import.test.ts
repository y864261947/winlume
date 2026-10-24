import { describe, expect, it } from "vitest";
import type { PortalModelVendor } from "./content-config";
import { prepareCatalogImport } from "./catalog-import";

const vendor = (patch: Partial<PortalModelVendor> = {}): PortalModelVendor => ({
  id: "catalog-acme-llm", name: "Catalog name", key: "acme", logoUrl: "/catalog.svg",
  category: "llm", enabled: true,
  models: [{ name: "model-v1", endpointTypes: ["chat"] }],
  ...patch,
});

describe("prepareCatalogImport", () => {
  it.each([true, false])("appends only missing models and preserves existing presentation (enabled=%s)", (enabled) => {
    const existing = vendor({
      id: "custom-id", name: "My provider", logoUrl: "/custom.svg", enabled,
      models: [{ name: "model-v1", endpointTypes: ["responses"], description: "Handwritten description" }],
    });
    const result = prepareCatalogImport([existing], vendor({ models: [
      { name: "model-v1", endpointTypes: ["chat"], description: "Catalog description" },
      { name: "model-v2", endpointTypes: ["chat"] },
    ] }));
    expect(result.editingId).toBe("custom-id");
    expect(result.addedCount).toBe(1);
    expect(result.draft).toEqual({ ...existing, models: [...existing.models, { name: "model-v2", endpointTypes: ["chat"] }] });
  });

  it("uses exact case-sensitive names and deduplicates repeated catalog rows", () => {
    const result = prepareCatalogImport([vendor()], vendor({ models: [
      { name: "model-v1", endpointTypes: ["chat"] },
      { name: "Model-v1", endpointTypes: ["responses"] },
      { name: "model-v1-preview", endpointTypes: ["chat"] },
      { name: "Model-v1", endpointTypes: ["chat"] },
    ] }));
    expect(result.addedCount).toBe(2);
    expect(result.draft.models.map((model) => model.name)).toEqual(["model-v1", "Model-v1", "model-v1-preview"]);
  });

  it("does not reimport models whose provider or category was manually changed", () => {
    const curated = vendor({ key: "custom", category: "other", models: [{ name: "model-v1", endpointTypes: ["chat"], description: "Curated" }] });
    const result = prepareCatalogImport([curated], vendor());
    expect(result.addedCount).toBe(0);
    expect(curated.category).toBe("other");
    expect(result.draft.models).toEqual([]);
  });

  it("creates hidden drafts for new provider categories without changing their existing category", () => {
    const existing = vendor();
    const result = prepareCatalogImport([existing], vendor({ category: "image", models: [{ name: "image-v1", endpointTypes: ["image"] }] }));
    expect(result.editingId).toBeNull();
    expect(result.draft.enabled).toBe(false);
    expect(result.draft.category).toBe("image");
    expect(existing.category).toBe("llm");
    expect(existing.enabled).toBe(true);
  });

  it("isolates editor mutations from both existing content and catalog data", () => {
    const existing = vendor();
    const candidate = vendor({ models: [{ name: "model-v2", endpointTypes: ["chat"] }] });
    const snapshot = structuredClone([existing, candidate]);
    const result = prepareCatalogImport([existing], candidate);
    result.draft.name = "Draft only";
    result.draft.models[0].description = "Draft description";
    result.draft.models[0].endpointTypes.push("responses");
    result.draft.models[1].endpointTypes.push("responses");
    expect([existing, candidate]).toEqual(snapshot);
  });

  it("is idempotent after accepting a draft and keeps all additions for explicit limit handling", () => {
    const candidate = vendor({ models: Array.from({ length: 41 }, (_, i) => ({ name: `model-${i}`, endpointTypes: ["chat"] })) });
    const first = prepareCatalogImport([], candidate);
    expect(first.addedCount).toBe(41);
    expect(first.draft.models).toHaveLength(41);
    const second = prepareCatalogImport([first.draft], candidate);
    expect(second.addedCount).toBe(0);
    expect(second.draft).toEqual(first.draft);
  });
});
