import { describe, expect, it } from "vitest";
import { defaultPortalContent, normalizePortalContent } from "./content-config";

describe("portal content configuration", () => {
  it("backfills the two managed homepage showcases for legacy records", () => {
    const content = normalizePortalContent({ carousel: [], notifications: [], modelVendors: [] });
    expect(content.applicationShowcase).toEqual(defaultPortalContent.applicationShowcase);
    expect(content.capabilityShowcase).toEqual(defaultPortalContent.capabilityShowcase);
  });

  it("keeps fallback showcases when stored sections are empty", () => {
    const content = normalizePortalContent({ applicationShowcase: [], capabilityShowcase: [] });
    expect(content.applicationShowcase).toEqual(defaultPortalContent.applicationShowcase);
    expect(content.capabilityShowcase).toEqual(defaultPortalContent.capabilityShowcase);
  });

  it("normalizes configurable tools, images, groups and capability tones", () => {
    const content = normalizePortalContent({
      applicationShowcase: [{ id: "custom app", title: "自定义工具", href: "/studio/tools/demo", imageUrl: "data:image/png;base64,abc", group: "latest", enabled: false }],
      capabilityShowcase: [{ id: "custom capability", title: "团队治理", eyebrow: "治理", href: "/account/team", imageUrl: "/custom.png", tone: "usage" }],
    });
    expect(content.applicationShowcase[0]).toMatchObject({ id: "custom-app", group: "latest", enabled: false, href: "/studio/tools/demo" });
    expect(content.capabilityShowcase[0]).toMatchObject({ id: "custom-capability", tone: "usage", imageUrl: "/custom.png" });
  });
});
