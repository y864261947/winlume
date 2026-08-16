import { describe, expect, it } from "vitest";
import {
  DEFAULT_BACKGROUND_REMOVAL_SUBJECT,
  parseBackgroundRemovalSubject,
  sampleForSubject,
} from "./background-removal";

describe("parseBackgroundRemovalSubject", () => {
  it("keeps a known subject and falls back to product", () => {
    expect(parseBackgroundRemovalSubject("person")).toBe("person");
    expect(parseBackgroundRemovalSubject("garment")).toBe("garment");
    expect(parseBackgroundRemovalSubject("general")).toBe("general");
    expect(parseBackgroundRemovalSubject("product")).toBe("product");
    expect(parseBackgroundRemovalSubject("mask")).toBe(DEFAULT_BACKGROUND_REMOVAL_SUBJECT);
    expect(parseBackgroundRemovalSubject(undefined)).toBe(DEFAULT_BACKGROUND_REMOVAL_SUBJECT);
  });

  it("maps a subject to a public before/after sample", () => {
    expect(sampleForSubject("person").beforeSrc).toContain("person-before");
    expect(sampleForSubject("general").subject).toBe("product");
  });
});
