# 010 — 模型成本台账、加价定价与接入探针

> 目标：把「接一个新模型」从**手工试错**变成**有台账、可算毛利、能验证能力**的流水线。
> 前提结论：**不需要先把 new-api 里所有模型处理好**。`publishedCatalog()` 是白名单，
> 门户只展示你显式配置过的模型，未理顺的模型天然不可见。逐个接入是正确策略。

---

## 0. 现状事实（已核实，勿凭记忆改）

### new-api 的四种计价模式

| 模式 | 存储位置 | 配置通道 | winlume 是否已接 |
| --- | --- | --- | --- |
| 按 token | `ModelRatio` + `CompletionRatio` option | `PATCH /api/pricing/admin/models/*model` | ✅ 已接 |
| 按次 | `ModelPrice` option (`quota_type=1`) | 同上 | ✅ 已接 |
| 按秒 | **同样是 `ModelPrice`**，语义为「每秒单价」 | 同上 + 适配器注入 `OtherRatios["seconds"]` | ⚠️ 能写但语义错标 |
| 分层表达式 | `billing_setting.billing_mode` / `billing_expr` | **仅 `/api/option/`（RootAuth）** | ❌ 完全缺失 |

### 关键约束：按秒乘数由 Go 代码决定，不是配置

`relay/channel/task/codexvideo/adaptor.go:126-156` 的 `EstimateBilling`：

```go
modelName := strings.ToLower(strings.TrimSpace(req.Model))
if !strings.Contains(modelName, "-sec") && !strings.HasPrefix(modelName, "wan3.0-") {
    return nil          // ← 不匹配则不注入 seconds，时长被静默忽略
}
ratios := map[string]float64{"seconds": float64(seconds)}
```

**后果**：接入一个按秒计价但模型名不含 `-sec` / 不以 `wan3.0-` 开头的视频模型，
用户生成 10 秒视频，你只收 1 秒的钱，成本却付 10 秒。**这是静默失血，没有任何报错。**

另有全局上限 `MaxTaskDurationSeconds = 3600`（`relay/common/relay_utils.go:160`）。

### winlume 侧的缺口

- `src/lib/newapi/pricing.ts` `pricingUpdate()` 只产出 `quota_type` 0/1 两种，无按秒语义、无 tiered_expr。
- `src/components/account/ModelPricingDialog.tsx:67` 把 `fixed` 模式一律标为「按次计费」「每次调用价格（$/次）」——
  对按秒模型是**错误标注**，会直接导致定价填错一个数量级。
- `src/lib/catalog/plaza-display.ts:143` 遇到 `tiered_expr` 只显示「分层表达式计价」，无价格信息。
- **成本数据在两个仓库的代码与数据库中均不存在**。唯一的成本痕迹是
  `new-api/model-pricing-calculator.html` 的硬编码猜测倍率
  （Anthropic 0.9 / OpenAI 0.15 / 其他 0.3）和一个手工 xlsx。

### 已有的好设计（不要改）

`src/app/api/admin/model-pricing/route.ts` 的写回链路：
`revision` 乐观锁（防并发覆盖）→ `PATCH` 写入 → **回读校验**（`route.ts:46-49`，
容差 `1e-10`，不一致则返回 502 而非谎报成功）。这套严谨性要在新模式中完整保留。

---

## 阶段一：能力探针（先回答「能不能用」）

**为什么排第一**：完全独立，不改动现有计价链路，零回归风险；
产出的实测 usage 是阶段二成本校准的输入。

### 1.1 探针脚本

新增 `scripts/probe-model.ts`（参考现有 `scripts/diagnose-model-access.ts` 的
`requirePlatformDb()` + `decryptSecret()` 取 token 方式）。

用例矩阵，每项记录 成功/失败 + 实际 usage + 耗时：

| 用例 | 断言 |
| --- | --- |
| `basic_text` | 非空 content 返回 |
| `streaming` | 收到 ≥2 个 SSE delta |
| `tool_call` | 返回结构合法的 `tool_calls` |
| `vision` | 接受 image part 且不报 400 |
| `reasoning` | 返回 `reasoning_content` 或 `reasoning` 字段 |
| `long_context` | 32K 输入不报 context 超限 |
| `json_mode` | `response_format=json_object` 返回可解析 JSON |

图像/视频模型走独立矩阵（尺寸、n、编辑端点、**时长参数是否被接受**）。

### 1.2 输出契约

```jsonc
{
  "model": "...",
  "probedAt": "2026-...",
  "capabilities": { "streaming": "pass", "tool_call": "fail", ... },
  "observedUsage": { "promptTokens": 1234, "completionTokens": 567 },
  "observedQuotaDelta": 8900,        // 调用前后 /api/user/self 的 quota 差值
  "errors": [ "..." ]
}
```

`observedQuotaDelta` 是**真实扣费**，阶段二用它反推并校验成本录入是否正确。

### 1.3 按秒模型专项探针（对应上面的硬约束）

对任何声明为按秒计价的模型，**必须**跑：同一 prompt 分别请求 5 秒和 10 秒，
比对两次 `observedQuotaDelta`。

- 比值 ≈ 2 → seconds 乘数生效 ✅
- 比值 ≈ 1 → **乘数未生效，禁止上架**，并在报告中明确指出模型名不匹配
  `codexvideo` 适配器的 `-sec` / `wan3.0-` 规则

### 验收

- 对已接入的 gpt / claude / gemini / gpt-image 跑通，结果与现网表现一致
- 对任一按秒视频模型跑出明确的「乘数生效 / 未生效」判定

---

## 阶段二：成本台账与加价（回答「赚多少」）

依赖阶段一（用实测扣费校准）。

### 2.1 数据表

新增 drizzle migration（下一个序号 `0013_model_cost_ledger.sql`），
沿用 `schema.ts` 既有的 `createdAt` / `updatedAt` helper：

```ts
export const modelCostEntries = pgTable("model_cost_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  modelName: varchar("model_name", { length: 160 }).notNull(),
  upstreamChannel: varchar("upstream_channel", { length: 80 }).notNull(),
  // token | per_call | per_second | tiered
  costUnit: varchar("cost_unit", { length: 16 }).notNull(),
  inputCost: numeric("input_cost", { precision: 18, scale: 8 }),   // USD / 1M tokens
  outputCost: numeric("output_cost", { precision: 18, scale: 8 }),
  cacheReadCost: numeric("cache_read_cost", { precision: 18, scale: 8 }),
  unitCost: numeric("unit_cost", { precision: 18, scale: 8 }),      // USD / 次 或 / 秒
  currency: varchar("currency", { length: 8 }).notNull().default("USD"),
  // manual | probe | upstream_sync
  source: varchar("source", { length: 16 }).notNull().default("manual"),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
  note: text("note"),
  createdAt, updatedAt,
});
```

**`effectiveFrom` 不可省**：人工录入的价目表会调价，没有生效时间就无法解释
历史毛利率，也无法判断某次调用该按哪个成本结算。同一 `(modelName, upstreamChannel)`
保留多行历史，查询取 `effectiveFrom <= now()` 的最新一行。

加价规则（量小，放 `portal_content_settings` 的一个 key，避免过度建表）：

```jsonc
{
  "default": 1.5,
  "byVendor": { "anthropic": 1.35, "openai": 1.6 },
  "byModel":  { "claude-opus-4.5": 1.25 }     // 优先级最高
}
```

解析优先级：`byModel` > `byVendor` > `default`。

### 2.2 计算与展示

新增 `src/lib/billing/cost-ledger.ts`（纯函数，必须带单测）：

- `resolveMarkup(modelName, vendorKey, policy): number`
- `suggestedPrice(cost, markup): { input, output } | { unit }`
- `grossMargin(cost, actualPrice): number` — 用**实际售价**而非建议价，
  因为售价可能被手工覆盖过

在 admin 定价界面每个模型行展示：`成本 → 建议售价 → 当前售价 → 实际毛利率`。

**当前售价低于成本时必须红色高亮告警。** 这是亏钱卖，比任何 UI 细节都重要。

### 2.3 录入界面

管理端新增成本录入表单（人工录入是你确认的主路径）：
模型 → 上游渠道 → 计价单位 → 成本数值 → 生效时间 → 备注。

支持从阶段一探针报告的 `observedQuotaDelta` **反推成本并预填**，人工确认后落库。

### 验收

- 录入 Claude/GPT/Gemini 现有成本，页面正确显示三档毛利率
- 改一次 vendor 倍率，建议价整体联动，当前售价不被自动改写
- 构造一个售价 < 成本的模型，确认告警触发

---

## 阶段三：补齐按秒与分层的写入通道（回答「接不进来」）

依赖阶段二（定价 UI 要展示成本，先有台账再改表单）。

### 3.1 按秒语义修正（winlume 侧即可完成，无需改 Go）

因为按秒复用 `quota_type=1`，**不需要新增 new-api 接口**，只需修正语义表达：

1. `pricingUpdate()` 增加 `mode: "per_second"`，输出仍是
   `{ quota_type: 1, model_price }`，但记录单位语义
2. 单位语义存哪里：`portal_content_settings` 的模型配置项加
   `billingUnit: "call" | "second"` 字段（避免为此改 new-api）
3. `ModelPricingDialog.tsx` 按 `billingUnit` 显示
   「每次调用价格（$/次）」或「**每秒单价（$/秒）**」
4. `plaza-display.ts` 的 `modelPriceLines()` 同步输出 `/秒`

### 3.2 按秒上架闸门（对应硬约束，必做）

在保存按秒定价时，校验模型名是否匹配 `codexvideo` 适配器规则
（含 `-sec` 或以 `wan3.0-` 开头）。不匹配则**阻止保存**并提示：

> 该模型名不匹配 new-api 视频适配器的时长识别规则，
> 时长乘数不会生效，将导致按 1 秒计费。
> 请先在 new-api 侧确认适配器支持，或改用按次计价。

宁可挡住上架，也不能静默亏钱。

### 3.3 分层表达式（评估后再决定是否做）

`tiered_expr` 只能通过 `/api/option/`（RootAuth）写入，权限高于现有
`NEW_API_ADMIN_TOKEN` 的使用场景，且表达式写错会直接影响全站计费。

**建议先只做只读**：`plaza-display.ts` 把 `billing_expr` 解析出来展示实际分层价格，
替代当前无信息量的「分层表达式计价」。写入能力等有明确的分层计价模型需求时再单独立项，
并且必须复用 `billing_setting.SmokeTestExpr` 做保存前校验。

### 验收

- 按秒模型在门户显示 `$X/秒` 而非 `$X/次`
- 不匹配适配器规则的按秒模型无法保存，提示明确
- 现有按 token / 按次模型的定价流程零回归（跑既有 148 项计费测试）

---

## 执行顺序与理由

```
阶段一 探针 ──────┐
  (独立,零风险)   │
                  ├──→ 阶段二 台账加价 ──→ 阶段三 写入通道补齐
  实测扣费校准 ───┘      (成本可见)          (UI 依赖成本展示)
```

阶段一可立即开始，不阻塞任何现有功能。
阶段三的 3.2 闸门如果暂时来不及做完整实现，**至少先在接入文档里写成红线检查项**。

---

## 不做什么

- **不重构 new-api 的计价内核**。它比 winlume 侧完整，问题在上层缺数据。
- **不追求一次接完所有模型**。白名单机制决定了逐个接入是安全的。
- **不改 revision 乐观锁 + 回读校验链路**。这是现有代码里质量最高的部分。
- **不在本计划内做 tiered_expr 写入**。权限与风险不匹配收益，先只读。
