import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { profileAvatar, profileEmail, profileName } from "./profile-validation";

describe("profile validation", () => {
  it("normalizes editable identity fields without allowing empty names", () => {
    expect(profileName("  睿舟用户  ")).toBe("睿舟用户");
    expect(profileEmail(" Test@Example.COM ")).toBe("test@example.com");
    for (const value of ["", " ", "a".repeat(121), "name\nheader", null]) expect(() => profileName(value)).toThrow();
    for (const value of ["bad", "a@@example.com", "x\r\n@example.com", "<a>@example.com"]) expect(() => profileEmail(value)).toThrow();
  });
  it("re-encodes and crops images instead of retaining original upload bytes", async () => {
    const original = await sharp({ create: { width: 400, height: 200, channels: 3, background: "#88644d" } }).png().toBuffer();
    const result = await profileAvatar(original);
    const metadata = await sharp(Buffer.from(result.split(",")[1], "base64")).metadata();
    expect(result).toMatch(/^data:image\/webp;base64,/);
    expect(metadata).toMatchObject({ format: "webp", width: 256, height: 256 });
    expect(metadata.exif).toBeUndefined();
  });
  it("rejects malformed uploads, SVG and oversized content", async () => {
    for (const bytes of [Buffer.from("fake jpeg"), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'), Buffer.alloc(5 * 1024 * 1024 + 1)]) await expect(profileAvatar(bytes)).rejects.toThrow();
  });
});
