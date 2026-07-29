import { describe, expect, it } from "vitest";
import {
  annotationBounds,
  applyCommentToUncommentedMarks,
  buildImageRefinementInstruction,
  dataUrlByteLength,
  getImageRefinementDisplay,
  normalizeAnnotationPoint,
  removeAnnotationMark,
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

  it("counts base64 data URL bytes without decoding image content", () => {
    expect(dataUrlByteLength("data:image/jpeg;base64,YWJj")).toBe(3);
    expect(dataUrlByteLength("data:image/jpeg;base64,YWI=")).toBe(2);
    expect(dataUrlByteLength("data:image/jpeg;base64,YQ==")).toBe(1);
    expect(dataUrlByteLength("not-a-data-url")).toBe(0);
  });

  it("turns persisted internal refinement prompts into user-facing notes", () => {
    const prompt = buildImageRefinementInstruction({
      baseArtifactId: "base-secret-id",
      annotationArtifactId: "marked-secret-id",
      request: "",
      marks: [
        { id: "one", kind: "box", points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }], comment: "改成比✌" },
        { id: "two", kind: "point", points: [{ x: 0.8, y: 0.2 }], comment: "改成比拳头" },
      ],
    });

    expect(getImageRefinementDisplay(prompt)).toEqual({
      notes: ["改成比✌", "改成比拳头"],
    });
    expect(getImageRefinementDisplay("普通用户消息")).toBeNull();
  });
});

describe("applyCommentToUncommentedMarks", () => {
  const marks = [
    { id: "a", kind: "point" as const, points: [{ x: 0.1, y: 0.1 }], comment: "已经填过了" },
    { id: "b", kind: "point" as const, points: [{ x: 0.2, y: 0.2 }] },
    { id: "c", kind: "box" as const, points: [{ x: 0.3, y: 0.3 }, { x: 0.4, y: 0.4 }], comment: "  " },
  ];

  it("fills only marks without a non-empty comment", () => {
    expect(applyCommentToUncommentedMarks(marks, "换成红色")).toEqual([
      marks[0],
      { ...marks[1], comment: "换成红色" },
      { ...marks[2], comment: "换成红色" },
    ]);
  });

  it("does not mutate input marks", () => {
    applyCommentToUncommentedMarks(marks, "换成红色");
    expect(marks[1]?.comment).toBeUndefined();
  });
});

describe("removeAnnotationMark", () => {
  const marks = [
    { id: "a", kind: "point" as const, points: [{ x: 0.1, y: 0.1 }] },
    { id: "b", kind: "point" as const, points: [{ x: 0.2, y: 0.2 }] },
    { id: "c", kind: "point" as const, points: [{ x: 0.3, y: 0.3 }] },
  ];

  it("removes exactly the requested mark", () => {
    expect(removeAnnotationMark(marks, "b").map((mark) => mark.id)).toEqual(["a", "c"]);
  });

  it("keeps an equivalent array for a missing id", () => {
    expect(removeAnnotationMark(marks, "missing")).toEqual(marks);
  });
});
