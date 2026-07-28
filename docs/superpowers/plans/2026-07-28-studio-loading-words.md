# Studio 加载状态轮换文案 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Studio 聊天界面里两处静态"进行中"类文案(`ExecutionMap` 角标、`ActivityStatus` 兜底状态)改为每 2 秒随机轮换一个词的动态提示,提升等待时的生动感。

**Architecture:** 新增一个纯函数模块 `src/lib/studio/loading-words.ts`(词库 + 不重复随机选词函数,可单测),在 `ChatThread.tsx` 内新增一个小 hook `useRotatingLoadingWord` 复用该模块,分别接入 `ActivityStatus` 和 `ExecutionMap` 两处渲染点。

**Tech Stack:** Next.js + React (TypeScript), Vitest 测试框架。

## Global Constraints

- 词库固定使用 Claude Code 官方词表的中文翻译(见 spec),不额外发明词,不按阶段分组。
- 轮换间隔固定 2000ms。
- 连续两次选词不能相同下标(`prevIndex === null` 首次除外)。
- `toolName` 存在时 `ActivityStatus` 展示的工具专属文案保持不变,不参与轮换。
- 不引入国际化,保持现有中文 UI 风格。
- 参考 spec: [docs/superpowers/specs/2026-07-28-studio-loading-words-design.md](../specs/2026-07-28-studio-loading-words-design.md)

---

### Task 1: 词库与选词纯函数

**Files:**
- Create: `src/lib/studio/loading-words.ts`
- Test: `src/lib/studio/loading-words.test.ts`

**Interfaces:**
- Produces: `LOADING_WORDS: readonly string[]`(常量数组,长度 88,元素均以"中"结尾,无重复项)
- Produces: `nextLoadingWordIndex(prevIndex: number | null, length: number): number`
  - `length <= 1` → 恒返回 `0`
  - `prevIndex === null` → 返回 `[0, length)` 内任意随机下标
  - 否则 → 返回 `[0, length)` 内且 `!== prevIndex` 的随机下标

- [ ] **Step 1: Write the failing tests**

创建 `src/lib/studio/loading-words.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LOADING_WORDS, nextLoadingWordIndex } from "./loading-words";

describe("LOADING_WORDS", () => {
  it("is a non-empty list of unique '中'-suffixed words", () => {
    expect(LOADING_WORDS.length).toBeGreaterThan(0);
    const unique = new Set(LOADING_WORDS);
    expect(unique.size).toBe(LOADING_WORDS.length);
    for (const word of LOADING_WORDS) {
      expect(word.endsWith("中")).toBe(true);
    }
  });
});

describe("nextLoadingWordIndex", () => {
  it("returns 0 when length <= 1", () => {
    expect(nextLoadingWordIndex(null, 0)).toBe(0);
    expect(nextLoadingWordIndex(null, 1)).toBe(0);
    expect(nextLoadingWordIndex(0, 1)).toBe(0);
  });

  it("returns an in-range index on first pick (prevIndex null)", () => {
    for (let i = 0; i < 50; i++) {
      const idx = nextLoadingWordIndex(null, 5);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(5);
    }
  });

  it("never repeats the previous index when length > 1", () => {
    let prev: number | null = 0;
    for (let i = 0; i < 200; i++) {
      const next = nextLoadingWordIndex(prev, 5);
      expect(next).not.toBe(prev);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(5);
      prev = next;
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/studio/loading-words.test.ts`
Expected: FAIL — `Cannot find module './loading-words'` (module doesn't exist yet)

- [ ] **Step 3: Implement the module**

创建 `src/lib/studio/loading-words.ts`:

```ts
/** Claude Code 风格的加载态轮换词库(中文翻译),用于替代静态"进行中"文案 */
export const LOADING_WORDS = [
  "吸收中", "聚合中", "对齐中", "分析中", "组装中", "衰减中",
  "烘焙中", "混合中", "煮沸中", "酝酿中", "构建中", "打包中",
  "计算中", "搅动中", "聚类中", "融合中", "编译中", "撰写中",
  "压缩中", "运算中", "处理中", "揉合中",
  "解码中", "分解中", "开发中", "诊断中", "消化处理中",
  "编码中", "评估中", "探索中", "提取中",
  "过滤中", "格式化中", "公式化中",
  "生成中", "收集中", "深度理解中",
  "哈希计算中", "采集收获中",
  "索引中", "推理中", "初始化中", "集成中", "迭代中",
  "连接中", "判断中",
  "加载中", "链接中", "分层中",
  "映射中", "匹配中", "合并中", "挖掘中", "建模中",
  "归一化中", "收窄中",
  "优化中", "组织中",
  "解析中", "打磨优化中", "编程中", "规划中",
  "量化中", "查询中", "排队中",
  "渲染中", "重构中", "检索中", "路由中",
  "采样中", "抓取中", "搜索中", "排序中", "合成中", "求解中",
  "翻译中", "遍历中", "追踪中", "修剪中",
  "更新中", "解压中", "统一中",
  "验证中", "向量化中", "校验中",
  "编织整合中", "数据整理中",
  "压缩打包中",
] as const;

/**
 * 随机选下一个词的下标,保证不与 prevIndex 连续重复。
 * length <= 1 时恒返回 0(边界安全,避免死循环)。
 */
export function nextLoadingWordIndex(
  prevIndex: number | null,
  length: number,
): number {
  if (length <= 1) return 0;
  let next = Math.floor(Math.random() * length);
  if (prevIndex !== null) {
    while (next === prevIndex) {
      next = Math.floor(Math.random() * length);
    }
  }
  return next;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/studio/loading-words.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/studio/loading-words.ts src/lib/studio/loading-words.test.ts
git commit -m "feat(studio): add rotating loading-word bank and picker"
```

---

### Task 2: 轮换 Hook 接入 `ActivityStatus` 与 `ExecutionMap`

**Files:**
- Modify: `src/components/studio/ChatThread.tsx`

**Interfaces:**
- Consumes: `LOADING_WORDS`, `nextLoadingWordIndex(prevIndex: number | null, length: number): number` from `@/lib/studio/loading-words` (Task 1)
- Produces: `useRotatingLoadingWord(active: boolean): string` — local hook in `ChatThread.tsx`, not exported (only used within this file)

- [ ] **Step 1: Add the import**

在 `ChatThread.tsx` 顶部的 import 区(紧跟在其他 `@/lib/studio/*` import 之后,约第 18 行 `toolActionLabel,` 之后)新增:

```ts
import { LOADING_WORDS, nextLoadingWordIndex } from "@/lib/studio/loading-words";
```

- [ ] **Step 2: Add the `useRotatingLoadingWord` hook**

紧跟在现有 `useLiveElapsed`(第 85-99 行)之后插入:

```ts
function useRotatingLoadingWord(active: boolean): string {
  const [index, setIndex] = useState<number | null>(null);
  useEffect(() => {
    if (!active) {
      setIndex(null);
      return;
    }
    setIndex((i) => nextLoadingWordIndex(i, LOADING_WORDS.length));
    const id = window.setInterval(() => {
      setIndex((i) => nextLoadingWordIndex(i, LOADING_WORDS.length));
    }, 2000);
    return () => window.clearInterval(id);
  }, [active]);
  return LOADING_WORDS[index ?? 0];
}
```

- [ ] **Step 3: Wire into `ActivityStatus`**

`ActivityStatus` 组件原本(第 101-131 行)在 `toolName` 缺失时用固定的 phase 文案。改为:

原代码:
```ts
function ActivityStatus({
  phase,
  startedAt,
  toolName,
}: {
  phase: Exclude<StreamPhase, "done">;
  startedAt?: number;
  toolName?: string;
}) {
  const elapsed = useLiveElapsed(startedAt, true);
  const label =
    phase === "tool"
      ? toolName
        ? `${toolActionLabel(toolName)}…`
        : "处理中…"
      : phase === "producing"
        ? "正在撰写…"
        : "思考中…";
```

改为:

```ts
function ActivityStatus({
  phase,
  startedAt,
  toolName,
}: {
  phase: Exclude<StreamPhase, "done">;
  startedAt?: number;
  toolName?: string;
}) {
  const elapsed = useLiveElapsed(startedAt, true);
  const rotatingWord = useRotatingLoadingWord(true);
  const label =
    phase === "tool" && toolName
      ? `${toolActionLabel(toolName)}…`
      : `${rotatingWord}…`;
```

(`useRotatingLoadingWord(true)` 恒为 active,因为 `ActivityStatus` 只在流式激活时被渲染;调用放在组件顶部,保持 Hooks 调用顺序稳定,不受 `phase`/`toolName` 分支影响。)

其余函数体(第 120-131 行的 `return` JSX)不变。

- [ ] **Step 4: Wire into `ExecutionMap`**

`ExecutionMap` 组件原本(第 137-161 行)静态展示"进行中"。改为:

原代码(第 137-160 行相关片段):
```ts
function ExecutionMap({
  steps,
  streaming,
}: {
  steps: ExecutionStep[];
  streaming?: boolean;
}) {
  if (!steps.length) return null;
  return (
    <div
      className="mb-3 rounded-[14px] border border-white/60 bg-white/45 px-2.5 py-2.5"
      role="status"
      aria-label="执行进度"
    >
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8A8298]">
          任务进度
        </span>
        {streaming ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-[#0F172A]">
            <StreamingPulse phase="tool" />
            进行中
          </span>
        ) : null}
      </div>
```

改为(注意 hook 必须在提前 return 之前调用,避免条件调用 Hooks):

```ts
function ExecutionMap({
  steps,
  streaming,
}: {
  steps: ExecutionStep[];
  streaming?: boolean;
}) {
  const rotatingWord = useRotatingLoadingWord(Boolean(streaming));
  if (!steps.length) return null;
  return (
    <div
      className="mb-3 rounded-[14px] border border-white/60 bg-white/45 px-2.5 py-2.5"
      role="status"
      aria-label="执行进度"
    >
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8A8298]">
          任务进度
        </span>
        {streaming ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-[#0F172A]">
            <StreamingPulse phase="tool" />
            {rotatingWord}
          </span>
        ) : null}
      </div>
```

其余部分(第 162 行往后的 `<ol>` 渲染)不变。

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无新增错误(与改动前 baseline 一致)

- [ ] **Step 6: Run full studio test suite (regression check)**

Run: `npx vitest run src/lib/studio`
Expected: PASS(含 Task 1 新增的 `loading-words.test.ts` 与既有的 `tool-display.test.ts`、`execution-map.test.ts` 等)

- [ ] **Step 7: Commit**

```bash
git add src/components/studio/ChatThread.tsx
git commit -m "feat(studio): rotate loading words in ActivityStatus and ExecutionMap"
```

---

### Task 3: 浏览器验证

**Files:** 无代码改动,仅验证。

- [ ] **Step 1: 启动本地开发服务器并打开 Studio 页面**

用 preview 工具启动项目的 dev server(参照 `.claude/launch.json`,若不存在则创建一条指向 `npm run dev` 的配置),导航到 Studio 会话页面。

- [ ] **Step 2: 触发一次 agent 任务,观察两处文案**

在 Composer 里发一条会触发工具调用的消息(例如要求生成一个 artifact),观察:
- `ActivityStatus`(消息列表里紧跟在用户消息下方的小字提示)在没有具体工具名时的文案每 2 秒切换一次,且用词来自 `LOADING_WORDS`
- 若渲染出 `ExecutionMap`(任务进度条),其右上角"进行中"位置同样每 2 秒切词

- [ ] **Step 3: 用 read_console_messages 检查无报错**

确认没有 `useRotatingLoadingWord` 相关的 React Hooks 顺序警告或运行时报错。

- [ ] **Step 4: 截图存档**

用 computer screenshot 截一张任务进行中的画面作为验证凭证,附在给用户的回复里。
