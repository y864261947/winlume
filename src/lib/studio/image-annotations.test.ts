import { describe, expect, it } from "vitest";
import {
  annotationBounds,
  buildImageRefinementInstruction,
  normalizeAnnotationPoint,
} from "./image-annotations";

describe("image annotations", () => {
  it("clamps preview coordinates to normalized image coordinates", () => {
    expect(
      normalizeAnnotationPoint(
        { x: 70, y: 50 },
        { left: 10, top: 10, width: 120, height: 80 },
      ),
    ).toEqual({ x: 0.5, y: 0.5 });
    expect(
      normalizeAnnotationPoint(
        { x: -10, y: 110 },
        { left: 0, top: 0, width: 100, height: 100 },
      ),
    ).toEqual({ x: 0, y: 1 });
  });

  it("serializes base-first refinement instructions", () => {
    expect(
      buildImageRefinementInstruction({
        baseArtifactId: "base",
        annotationArtifactId: "marked",
        request: "把这里改成蓝色",
        marks: [
          {
            id: "m1",
            kind: "box",
            points: [
              { x: 0.1, y: 0.2 },
              { x: 0.4, y: 0.6 },
            ],
            comment: "把这里改成蓝色",
          },
        ],
      }),
    ).toContain("sourceArtifactIds must be [base, marked]");
    expect(
      buildImageRefinementInstruction({
        baseArtifactId: "base",
        annotationArtifactId: "marked",
        request: "",
        marks: [{ id: "m1", kind: "point", points: [{ x: 0.5, y: 0.5 }], comment: "移除这里" }],
      }),
    ).toContain('note="移除这里"');
  });

  it("returns the union bound for marks", () => {
    expect(
      annotationBounds([
        { id: "p", kind: "point", points: [{ x: 0.2, y: 0.4 }] },
        {
          id: "s",
          kind: "pen",
          points: [
            { x: 0.5, y: 0.5 },
            { x: 0.9, y: 0.7 },
          ],
        },
      ]),
    ).toEqual({ x: 0.2, y: 0.4, width: 0.7, height: 0.3 });
  });
});
