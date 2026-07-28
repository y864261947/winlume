# Studio 加载状态轮换文案设计

## 背景

Studio 聊天界面在 agent 执行任务期间有两处静态"进行中"类文案,长时间盯着不变会显得呆板:

1. `ExecutionMap` 任务进度条右上角的"进行中"([ChatThread.tsx:158](../../../src/components/studio/ChatThread.tsx))
2. `ActivityStatus` 主状态提示的"思考中…/处理中…/正在撰写…" 兜底文案(仅在没有具体 `toolName` 时使用,[ChatThread.tsx:111-118](../../../src/components/studio/ChatThread.tsx))——`toolName` 存在时展示的工具专属文案(如"读取文件…")保留不变,不参与轮换,因为那是有信息量的状态。

参考 Claude Code CLI 在等待响应时随机轮换动词("cooking"、"surfing" 等)营造生动感的做法,为 Studio 引入同类效果。

## 词库

使用 Claude Code 官方词表的中文翻译,不分执行阶段(thinking/tool/producing),统一放入一份混合词库,随机轮换。

新建 `src/lib/studio/loading-words.ts`:

```ts
export const LOADING_WORDS = [
  "吸收中", "聚合中", "对齐中", "分析中", "组装中", "衰减中",
  "烘焙中", "混合中", "煮沸中", "酝酿中", "构建中", "打包中",
  "计算中", "搅动中", "聚类中", "融合中", "编译中", "撰写中", "压缩中", "运算中", "处理中", "揉合中",
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
```

(原表中 "处理中" 出现两次、"投影/规划中" 含斜杠,已去重并简化为"规划中"。)

同时导出纯函数:

```ts
export function nextLoadingWordIndex(prevIndex: number | null, length: number): number
```

- 随机返回一个新下标,且保证与 `prevIndex` 不同(避免连续两次出现同一个词)
- `prevIndex === null` 时(首次)直接随机返回任意下标
- `length <= 1` 时始终返回 `0`(边界安全)

配套 `loading-words.test.ts`:
- 词库非空且无重复项
- `nextLoadingWordIndex` 返回值始终在 `[0, length)` 范围内
- 连续调用不返回与上一次相同的下标(length > 1 时)
- `length <= 1` 时不抛异常

## 轮换 Hook

直接定义在 `ChatThread.tsx` 内(与已有的 `useLiveElapsed` 同一模式,不单独抽文件,因为只在本文件内两处使用):

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

- 激活时立即选一个起始词(不等 2 秒才出现文字),此后每 2000ms 换一个
- 关闭时重置为 `null`,下次重新激活会随机起始(不会每次都从同一个词开始)

## 接入点

1. `ActivityStatus`:当 `toolName` 不存在时,`处理中…/正在撰写…/思考中…` 这三个兜底分支合并为 `` `${useRotatingLoadingWord(true)}…` ``(该组件本身只在流式激活时渲染,所以 `active` 恒为 `true`)。`toolName` 存在的分支不变。
2. `ExecutionMap`:`streaming` 为真时展示的静态"进行中"替换为 `` useRotatingLoadingWord(streaming) ``。

两处各自独立调用 hook、各自维护定时器,不做跨组件同步——它们是两个独立的"进行中"指示器,没有必要绑定同一个词。

## 不做的事

- 不按执行阶段(thinking/tool/producing)拆分词库,统一一份混合词库
- 不改动 `toolActionLabel` 已有的工具专属文案
- 不引入国际化/英文版(现有 UI 全中文,保持一致)
