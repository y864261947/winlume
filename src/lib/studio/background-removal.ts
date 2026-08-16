export const BACKGROUND_REMOVAL_SUBJECTS = [
  "product",
  "person",
  "garment",
  "general",
] as const;

export type BackgroundRemovalSubject = (typeof BACKGROUND_REMOVAL_SUBJECTS)[number];

export const DEFAULT_BACKGROUND_REMOVAL_SUBJECT: BackgroundRemovalSubject = "product";

export const BACKGROUND_REMOVAL_SUBJECT_OPTIONS: readonly {
  id: BackgroundRemovalSubject;
  label: string;
  hint: string;
}[] = [
  { id: "product", label: "商品", hint: "鞋包、数码、日用品等独立商品" },
  { id: "person", label: "人像", hint: "全身或半身人物" },
  { id: "garment", label: "服装", hint: "衣物、穿搭平铺或上身" },
  { id: "general", label: "通用", hint: "不确定主体时使用" },
];

export function isBackgroundRemovalSubject(
  value: unknown,
): value is BackgroundRemovalSubject {
  return (
    typeof value === "string" &&
    BACKGROUND_REMOVAL_SUBJECTS.includes(value as BackgroundRemovalSubject)
  );
}

export function parseBackgroundRemovalSubject(
  value: unknown,
): BackgroundRemovalSubject {
  return isBackgroundRemovalSubject(value)
    ? value
    : DEFAULT_BACKGROUND_REMOVAL_SUBJECT;
}

export type BackgroundRemovalSample = {
  subject: Exclude<BackgroundRemovalSubject, "general">;
  label: string;
  caption: string;
  beforeSrc: string;
  afterSrc: string;
};

const SAMPLE_DIR = "/studio/tools/background-removal";

export const BACKGROUND_REMOVAL_SAMPLES: readonly BackgroundRemovalSample[] = [
  {
    subject: "product",
    label: "商品",
    caption: "生活场景里的主图，抠完只留下商品",
    beforeSrc: `${SAMPLE_DIR}/product-before.jpg`,
    afterSrc: `${SAMPLE_DIR}/product-after.jpg`,
  },
  {
    subject: "person",
    label: "人像",
    caption: "带环境的人像，抠完主体独立出来",
    beforeSrc: `${SAMPLE_DIR}/person-before.jpg`,
    afterSrc: `${SAMPLE_DIR}/person-after.jpg`,
  },
  {
    subject: "garment",
    label: "服装",
    caption: "衣橱里的外套，抠完可直接做详情",
    beforeSrc: `${SAMPLE_DIR}/garment-before.jpg`,
    afterSrc: `${SAMPLE_DIR}/garment-after.jpg`,
  },
];

export function sampleForSubject(
  subject: BackgroundRemovalSubject,
): BackgroundRemovalSample {
  return (
    BACKGROUND_REMOVAL_SAMPLES.find((sample) => sample.subject === subject) ??
    BACKGROUND_REMOVAL_SAMPLES[0]!
  );
}
