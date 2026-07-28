import { describe, expect, it } from "vitest";
import { buildAssessmentReport, type AssessmentAnswers } from "./assessment";

const baselineAnswers: AssessmentAnswers = {
  outcome: "sales_growth",
  owner: "sales",
  workflow: "manual_follow_up",
  data: "crm",
  maturity: "piloting",
  constraint: "data_quality",
  urgency: "this_quarter",
  delivery: "workflow",
};

describe("buildAssessmentReport", () => {
  it("recommends lead conversion for a sales growth goal", () => {
    const report = buildAssessmentReport(baselineAnswers);

    expect(report.recommendedScenario).toContain("线索");
    expect(report.constraints).toContain("客户与线索数据需要先完成去重、字段规范和责任人校验。");
    expect(report.requiredInputs).toContain("可访问的 CRM 线索、客户、跟进记录和转化阶段定义。");
  });

  it.each([
    ["exploring", 34],
    ["piloting", 52],
    ["integrated", 68],
    ["scaling", 82],
  ] as const)("assigns %s maturity a readiness score of %i", (maturity, readiness) => {
    expect(buildAssessmentReport({ ...baselineAnswers, maturity }).readiness).toBe(readiness);
  });

  it("changes the priority scenario for service and operations goals", () => {
    expect(
      buildAssessmentReport({ ...baselineAnswers, outcome: "service_quality", owner: "service" })
        .recommendedScenario,
    ).toContain("服务");
    expect(
      buildAssessmentReport({ ...baselineAnswers, outcome: "operations", owner: "operations" })
        .recommendedScenario,
    ).toContain("运营");
  });

  it("builds a complete, stable preview from answers only", () => {
    const first = buildAssessmentReport(baselineAnswers);
    const second = buildAssessmentReport({ ...baselineAnswers });

    expect(first).toEqual(second);
    expect(first.phases).toHaveLength(3);
    expect(first.recap).toHaveLength(8);
    expect(first.phases.join(" ")).toContain("90 天");
  });
});
