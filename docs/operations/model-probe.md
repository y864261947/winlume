# 模型能力与成本探针（阶段一）

对应计划 `plans/010-model-cost-pricing-onboarding.md` 阶段一。

回答两个问题，且都用**实测**而非文档声明：

1. 这个模型在这条渠道上，哪些能力真的能用
2. 这次调用真实消耗了多少（token，以及 new-api 渠道上的精确扣费）

## 三家上游的实际形态

已读三家文档并据此适配：

| | 云飞 | 小安 22codex | 卡藏 prompt-hubs |
| --- | --- | --- | --- |
| Base URL | `https://img.yunfei.best` | `https://app.22codex.xyz` | `https://newapi.prompt-hubs.com` |
| 底层 | **new-api** rc.21 | **new-api** rc.24 | **new-api** rc.20 |
| 模型数 / 分组数 | 13 / 12 | 68 / 25 | 80 / 0 |
| 视频 | `POST /v1/videos` 异步 | `POST /v1/videos` 异步 | `POST /v1/videos` |
| 图片 | 同步 + Gemini 原生双形态 | 异步生图 | `Prefer: respond-async` 切换 |
| 成本采集 | `/api/pricing` 自动拉取 | `/api/pricing` 自动拉取 | `/api/pricing` 自动拉取 |

**三家都是 new-api**（`/api/status` 已验证），因此：

- `/api/pricing` 无需鉴权即可读取结构化价格 → 成本可自动拉取
- 响应头 `X-Oneapi-Request-Id` 可回查 `/api/log/self` → 扣费可精确归因
- 探针配置里三家的 `kind` 都应填 `new-api`

### 视频是异步的

三家的 `POST /v1/videos` **只返回 `task_id`，不返回视频**。因此：

- 探针判定写作「已受理异步任务（未轮询，不代表生成成功）」，不谎报成功
- 探针**不轮询到完成**。云飞和小安都写明"失败不扣费"，
  若把受理当成功，后续失败会被记成零成本的胜利，直接污染成本台账

### 请求字段不可跨家族照搬

小安文档第 7 节明确警告过这点。四个家族字段互不兼容：

| 家族 | 参考图字段 | 比例字段 | 合法时长 |
| --- | --- | --- | --- |
| H3 `MiniMaxH3-*` | `images[]` + `audios[]` | `aspect_ratio` | 1–15 秒 |
| Wan 3.0 `wan3.0-*` | `media[]`（带 `type`） | **`ratio`** | 3–30 秒 |
| Grok `grok-imagine-video*` | `image: {url}` 单对象 | `aspect_ratio` | 1–15 秒 |
| veo `veo-*` | `image_urls[]` | `aspect_ratio` | **只接受 4/6/8** |

发错形状会被上游拒绝，而那个拒绝**看起来和"模型不支持"一模一样**——
这正是必须按家族分派的原因。实现见 `src/lib/probe/video.ts`。

时长校验对也据此动态选取：veo 用 4/8，Wan 用 3/6，而不是固定的 5/10
（5 和 10 对 veo 都非法，只会得到两次失败请求和一个毫无意义的结论）。

## 快速开始


```bash
cp probe-channels.example.json probe-channels.json   # 填入真实 baseUrl / apiKey
npm run probe:models -- --tier smoke
```

`probe-channels.json` 和 `probe-report*.json` 已被 `.gitignore` 排除，**切勿提交填好的副本**。

## 为什么不一次跑完所有模型

脚本刻意不提供"全量跑"的一键入口，有三个硬理由：

1. **每次探测都是真金白银。** `long_context` 用例单次就是 ~32K 输入，视频用例更贵。
2. **大多数模型跑了也没用。** `publishedCatalog()` 是白名单，没进门户配置的模型对用户不可见，
   给它跑能力矩阵没有消费者。
3. **会踩限流。** new-api 有 `CriticalRateLimit` / `SearchRateLimit`。几百个模型并发打过去，
   结果里分不清"模型不支持"和"被限流"，会污染整份报告的可信度。

**正确姿势是两轮筛选：**

```bash
# 第一轮：每个模型只花一次最小调用，筛掉不可用的
npm run probe:models -- --tier smoke --limit 50

# 第二轮：只对活下来的少数跑完整矩阵
npm run probe:models -- --models gpt-4o,claude-sonnet-4 --tier full
```

脚本会在开跑前打印相对开销权重；权重 > 200 且未加 `--yes` 时直接中止。

## 渠道配置

```jsonc
{
  "channels": [
    {
      "name": "upstream-a",
      "baseUrl": "https://provider.example",
      "apiKey": "sk-...",
      "kind": "new-api",          // 或 "openai"
      "logToken": "可选 PAT",      // 仅 new-api，留空则复用 apiKey
      "models": ["gpt-4o"]        // 省略则从 /v1/models 自动发现
    }
  ]
}
```

### `kind` 决定成本采集能力

| kind | 成本数据 | 说明 |
| --- | --- | --- |
| `new-api` | **精确到每次调用** | 响应头 `X-Oneapi-Request-Id` 回查 `/api/log/self?request_id=`，拿到真实 quota |
| `openai` | 仅 token 数 | 标准 OpenAI 兼容上游没有扣费概念 |

**成本拿不到时，报告写明原因，绝不填 0。** 这是刻意设计——一个伪造的零成本会直接让阶段二的毛利率算错。

因为归因走 `request_id` 而非"调用前后配额差值"，**探针可以并发跑**（默认 3 并发），
不需要串行。

## 用例矩阵

| 用例 | 判定标准 |
| --- | --- |
| `basic_text` | 返回非空 content |
| `streaming` | **≥2 个**增量事件（1 个视为非真实流式） |
| `tool_call` | 有 `tool_calls`，且 `function.arguments` 是可解析 JSON |
| `json_mode` | 声明 `json_object` 后返回的内容真的能 `JSON.parse` |
| `vision` | 接受 image part 并返回描述 |
| `reasoning` | 返回 `reasoning_content`/`reasoning` 文本 |
| `long_context` | ~32K 输入不报 context 超限 |
| `image_generate` | `data[]` 含 `b64_json` 或 `url` |
| `video_generate` | 返回任务 id |

tier 与用例的对应关系见 `src/lib/probe/cases.ts`。

## 四种结果的语义（重要）

| 结果 | 含义 |
| --- | --- |
| ✅ `pass` | 能力确实可用 |
| ❌ `fail` | **关于模型的判断**：上游拒绝了请求形状，或返回内容不符合要求 |
| ⚠️ `error` | **关于调用的判断**：401/403/429/5xx/超时。**不能据此判定模型能力** |
| ⏭️ `skip` | 该用例不适用于此模型类型 |

`fail` 和 `error` 的区分是整个探针最关键的设计。把限流记成"能力不支持"，
会让一次网络抖动永久污染接入决策。

几个刻意的判定细节：

- **只收到 1 个流式事件 → `fail`**：非流式上游可以发一个终止 chunk，表面上和流式一模一样。
- **计费了 reasoning token 但没返回推理文本 → `fail`**，且报告里写明扣了多少 token。
  这是"付费但拿不到"的独立状态，不是简单的不支持。
- **HTTP 200 但响应体是 error 信封 → `fail`**。

## 时长计价校验（`--check-duration`）

这是本阶段最高价值的检查，对应计划里的硬约束。

```bash
npm run probe:models -- --models wan3.0-t2v --tier standard --check-duration
```

对同一 prompt 分别生成 5 秒和 10 秒，比对真实扣费：

| 扣费比值 | 判定 |
| --- | --- |
| ≈ 2.0 | ✅ 时长乘数生效 |
| ≈ 1.0 | ❌ **禁止上架** |
| 其他 | ❌ 计价规则异常，需人工核对 |

### 为什么会出现比值 1.0

`relay/channel/task/codexvideo/adaptor.go:132`：

```go
if !strings.Contains(modelName, "-sec") && !strings.HasPrefix(modelName, "wan3.0-") {
    return nil   // 不注入 seconds 乘数
}
```

模型名不匹配这条规则时，**用户生成 10 秒视频，你只收 1 秒的钱，成本却付 10 秒**。
没有报错，没有异常日志，账单上也看不出来——纯静默失血。

脚本会区分两种失败并给出不同结论：
- 模型名不匹配规则 → 指出是命名不符合 `-sec` / `wan3.0-` 约定
- 名字匹配但仍然平价 → 指向该渠道的适配器实现

容差取 15%，足够吸收舍入和分组倍率噪声，又不会掩盖 1.0 与 2.0 的区别。

## 输出

终端打印摘要，完整报告写入 `--out`（默认 `probe-report.json`）：

```jsonc
{
  "channel": "upstream-a",
  "model": "gpt-4o",
  "kind": "text",
  "cases": [
    {
      "id": "basic_text",
      "outcome": "pass",
      "detail": "返回 2 字符",
      "latencyMs": 812,
      "usage": { "promptTokens": 14, "completionTokens": 2, "totalTokens": 16 },
      "cost": { "requestId": "...", "quota": 1200, "credits": 0.0024, "unavailableReason": null }
    }
  ],
  "durationMultiplier": null
}
```

`cost.quota` / `cost.credits` 就是成本台账的录入基准——
它是实际扣费，不是任何人的估算（仅卡藏渠道可得）。

---

# 成本台账（手工录入入口）

因为三家上游**都是 new-api**，且 `/api/pricing` 无需鉴权即可读取，
成本以**自动拉取 + 人工确认**为主，手工录入作为兜底与覆盖手段。
台账文件 `model-costs.json` 已 gitignore（属于商业数据）。

## 自动拉取成本（主路径）

```bash
npm run cost -- pull --channel yunfei  --url https://img.yunfei.best
npm run cost -- pull --channel kacang  --url https://newapi.prompt-hubs.com
npm run cost -- pull --channel 22codex --url https://app.22codex.xyz --filter "video|sec"
```

**默认只预览不写入**，确认无误后加 `--apply`。

### 三个必须知道的价格陷阱

这些都是从三家真实数据里发现的，每一个都能让你算错成本。

**1. `model_price` 是基准，不是价格。真实成本 = `model_price × group_ratio`。**

云飞的 `gpt-image-2` 在四个分组里成本跨度 **18.8 倍**：

```
gpt-image-2  0.150000 /次  [分组区间 0.008000 ~ 0.150000]
    model_price=1 × 分组倍率 0.15（image2-high） = 0.15 美元/次
    ⚠️ 该模型在 4 个分组间成本相差 18.8×（最低 0.008，最高 0.15）。已按最高分组计算。
```

默认 `--group-policy highest`（保守，宁可高估）。注意 winlume 现有的
`applyActualPricing()` 取的是**最低**分组——两者口径不同是刻意的：
展示价用最低吸引用户，成本核算用最高保证不亏。

**2. 按秒模型是 `quota_type=0`，每秒单价在 `video_price` 里。**

```
MiniMaxH3-720p       qt=1  model_price=1.2      ← 按次
MiniMaxH3-720p-sec   qt=0  model_ratio=37.5     ← 按 token 引擎
                           video_price={"720p":0.08}   ← 真实每秒成本
```

同一款模型的两个变体走**完全不同的计费引擎**。拉取时会自动识别并按 `/秒` 入账。
多分辨率时取**最贵**的那档，因为分辨率是用户选的，不是你选的。

**3. 上游的 `video_price` 可能是错的。**

```
🚨 已拦截，不会入账：
  grok-imagine-video-1.5
      分辨率价格倒挂：720p 比 1080p 贵 7.5×（{"1080p":0.12,"480p":0.7,"720p":0.9}）。
      疑似上游配置错误，按此定价可能远超预期成本。
```

对比 1.0 版是 `{480p:0.07, 720p:0.09, 1080p:0.12}`，1.5 版像是小数点错位。
**如果按 1080p 的 0.12 定价却卖 720p，实际成本是 7.5 倍。**

### 会被拦截的四类情况

| 情况 | 原因 |
| --- | --- |
| 分辨率价格倒挂 | 高分辨率反而更便宜，疑似上游配错 |
| `-sec` 但无 `video_price` | 按秒计费却找不到每秒单价 |
| `billing_mode=tiered_expr` | 成本随请求长度变化，无法用单一数值表示 |
| 无可用价格字段 | 推导结果为 0，拒绝伪造 |

被拦截的模型需要人工核实后用 `set` 手工录入。

## 目录对账：Reizo 卖的 ≠ relay 能卖的

### Reizo 有三个模型来源

| 来源 | 位置 | 是否自动同步 |
| --- | --- | --- |
| live | `GET {gateway}/v1/models` | ✅ 实时取 new-api |
| 硬编码 | `FALLBACK_MODELS`（plaza route.ts） | ❌ 手写在代码里 |
| 门户 | `portal_content.modelVendors` | ❌ 后台手工维护 |

公开页走 `publishedCatalog()`，是**白名单**——只展示门户里配置过的，
所以幽灵条目不会直接泄漏给访客。但 `?scope=admin-import`
路径会 `mergeLiveAndCuratedModels`，把硬编码清单混进实时列表。

### 实测结果（2026-09-19，图片/视频/音频）

```
relay 可服务      20
Reizo 硬编码目录  10
两边一致           0   覆盖率 0.0%
❌ 幽灵条目       10   dall-e-3 / imagen-4 / veo-3 / flux-1.1-pro …
⚠️  漏挂           20   gpt-image-2.5 / MiniMaxH3-* / wan3.0-video …
```

**一个都对不上。** 硬编码里 53 个模型有 49 个 relay 根本没有——
那是一份示例数据，不是目录。

### 两种漂移不对称

- **幽灵**（error）：目录里有、relay 不可服务。客户选中即失败。
- **漏挂**（warn）：relay 能卖、目录没有。已付渠道成本却没在卖，**静默亏钱**。
- **仅停用渠道**（warn）：修法是"启用渠道"而非"删除条目"，故单列。
- **单渠道**（info）：new-api 只能在同名渠道间转移，1 个渠道 = 无容灾。当前 46/74。

### 后续新增模型怎么快速同步

```bash
RELAY_PASS=... npm run catalog:audit                      # 看差集
RELAY_PASS=... npm run catalog:audit -- --out catalog-sync.json   # 导出待上架/待下架
RELAY_PASS=... npm run catalog:audit -- --strict          # CI 闸门，有幽灵即退出 1
```

导出的 JSON 直接是 `portal_content.modelVendors` 的形状，可粘进后台。
**所有 vendor 的 `enabled` 均为 false**——上架即承诺可服务且已定价，
分类器的 `guessed` 置信度不足以替你做这个决定。

名称比较会剥掉 new-api 的 `[官逆]`/`[福利]` 前缀并归一化 `- . _`，
否则会报一堆假漂移。

### 导出 ≠ 后台手工添加（重要）

**导出的结构必须能通过 `normalizePortalContent`，否则静默丢弃。**

`content-config.ts` 的 vendor 分支以此结尾：

```ts
return name && models.length ? [{ ... }] : [];
```

没有 `name` 的 vendor **整条被丢掉，不报错、不警告**。
第一版导出按模态分组（`{category, models}`），没有 `name`——
导入后存活 **0 个 vendor / 0 个模型**，看起来像什么都没发生。

因此导出改为按**供应商**分组，和你在后台手工建的形状一致：

| 字段 | 不填的后果 |
| --- | --- |
| `name` | 整条 vendor 消失 |
| `key` | 回落默认，品牌 logo 丢失（会清洗为 `[a-zA-Z0-9_-]`） |
| `category` | 非法值静默变成 `llm`，视频模型被归到文本 |
| `models` | 空数组 → 整条 vendor 消失 |

容量上限（80 vendor / 每个 40 模型）会先在本地报 `overflow`，
而不是让行在导入时凭空消失。

实测往返零丢失，品牌 logo 自动匹配：

```
导出：4 vendor / 20 模型
导入后存活：4 vendor / 20 模型   ✅ 零丢失
  OpenAI · image    4 模型     xAI · video     2 模型
  MiniMax · video  12 模型     Other · video   2 模型
```

`catalog-sync.test.ts` 用真实的 `normalizePortalContent` 做往返断言锁死这条。

### 已删除 FALLBACK_MODELS

`src/app/api/catalog/plaza/route.ts` 里 53 条硬编码模型已删除，
`curatedModels` / `mergeLiveAndCuratedModels` 一并移除。

理由：它只喂 `?scope=admin-import`，而那正是危害所在——
管理员导入"完整目录"时被塞 49 个不可服务的模型。
**空列表是"网关明显挂了"，一串看着合理的幽灵是"悄悄错了"，只有后者会到客户面前。**

公开页不受影响，它本来就走 `publishedCatalog()` 白名单。

## Reizo 与 new-api 的职责边界


两个项目**已经是一体的**，不需要"打通"：余额真相在 new-api 的 quota
（`epay_orders` 只是审计流水），Reizo 的 `/api/v1/[...path]` 已用团队 key 转发到 `NEW_API_URL`。

真正要定的是**调度放哪一层**。答案由 new-api 源码决定：

```go
// controller/relay.go
channel, selectGroup, err := service.CacheGetRandomSatisfiedChannel(retryParam)
// 失败信息 keyed on info.OriginModelName
```

**new-api 的故障转移是按同一个模型名找下一个渠道的。** 于是：

| 能力 | 归属 | 原因 |
| --- | --- | --- |
| 同名多渠道 priority/weight | **new-api** | 原生支持，已在跑（`RetryTimes=2`） |
| 失败自动重试下一渠道 | **new-api** | 同上，重写是浪费 |
| 扣费、quota、日志 | **new-api** | 余额真相所在 |
| 编目名 → 上游模型名 | **Reizo** | new-api 不知道跨名等价 |
| 按时长选计费模式 | **Reizo** | `-sec` 与非 `-sec` 是两个模型，静态配置做不到 |
| 成本台账与毛利 | **Reizo** | new-api 只记售价，不记你的上游成本 |

### 编目解析（`sku-resolve.ts`）

客户发编目名，Reizo 翻译成上游模型名再转发，**不碰 new-api 的 model_mapping 配置**：

```
{ model: "video.minimaxh3.720p", duration: 5 }   → MiniMaxH3-720p-sec
{ model: "video.minimaxh3.720p", duration: 30 }  → MiniMaxH3-720p
{ model: "video.minimaxh3.720p", upscale: false }→ MiniMaxH3-720p-sec-nf
{ model: "gpt-image-2.5" }                       → 原样透传（非编目名）
```

最后一条很重要：编目是**增量**的，现有集成发上游名继续照常工作。
`upscale` 是自有概念，转发前会剥掉，不会泄漏给 new-api。

四种拒绝情形各有独立错误码，不合并——`missing_duration`（调用方漏参）
与 `no_route`（编目问题）查的是完全不同的 bug。

### 毛利对账（`npm run margins`）

new-api 只记售价（`quota` 与 `other.model_price`），成本在本仓库的台账里，
**毛利只存在于两者的 join**。该脚本对 new-api 严格只读，绝不反向写 `ModelPrice`
改动生产计费。

```bash
RELAY_PASS=... npm run margins -- --days 7
```

真实跑通结果（近 7 天 15.5 万次调用）：

| 模型 | 渠道 | 次数 | 收入 | 成本 | 毛利率 |
| --- | --- | --- | --- | --- | --- |
| gpt-image-2.5 | kk-image（云飞） | 1976 | 196.52 | 15.81 | 92.0% |
| gpt-image-2 | kk-image（云飞） | 2487 | 74.89 | 19.90 | **73.4%** |

同渠道同上游，`gpt-image-2` 比 `2.5` 低近 19 个百分点，值得复核定价。

有收入但成本未知的调用会单独计数，**不会按 0 成本算进毛利**——
缺失成本和零成本在商业上完全相反。任何组合亏本销售时脚本退出码为 1，可做 CI 闸门。

## 自有编目（SKU）：把上游模型名藏起来


### 为什么必须做

三家上游卖同一个 `gpt-image-2.5`，成本 0.008 / 0.0168 / 0.07——**差 8.75 倍**。
全量对比：19 个模型存在跨渠道成本差 ≥1.15×，平均可省 56.4%。

如果客户按上游模型名下单，你就被锁死在那个渠道；客户买**你的**编目，走哪家是你的调度自由，
差价才变成利润。所以这不是"名字太长"的体验问题，是商业模式问题。

### 数据模型

```
Sku ──< SkuBinding ──> (channel, upstreamModel, priority, costs[])
```

- **Sku**：你卖的能力。`video.minimaxh3.720p`、「视频·H3·720p·标准」
- **SkuBinding**：能提供这个能力的某渠道某模型，带优先级
- **路由**：优先级降序 → 同级按成本。成本**不能**越过优先级，
  否则你因质量问题降权的渠道会因为便宜自己爬回来

### 三条设计决定

**1. 计费方式不是编目维度。** H3-720p 上游同时有 1.2/次 和 0.08/秒，
哪个便宜完全取决于时长，这是请求时的路由决策，不该让客户理解：

```
 3s → 0.240  按秒        15s → 1.200  按次   ← 拐点
10s → 0.800  按秒        30s → 1.200  按次   （按秒要 2.4，省一半）
```

**2. `-nf`（不超分）不是独立编目。** 它与超分版**同价**，是画质开关不是商品。
折进 `upscale` 参数后，MiniMaxH3 从 12 个变体收成 4 个编目。

**3. 等价必须人工确认。** 所有绑定生成时 `equivalenceConfirmed: false`，
不进路由。上游配错（`grok-imagine-video-1.5` 的分辨率倒挂）会污染整个档位，
工具只提候选，不替你判断两个模型效果是否可互换。

### 用法

```bash
npx tsx scripts/draft-sku-catalog.ts              # 生成草案
npx tsx scripts/draft-sku-catalog.ts --markup 2
```

产出 `sku-catalog.draft.json`。审完把确认等价的绑定改 `equivalenceConfirmed: true`。
校验会拦三类问题：无已确认绑定（不可售）、单渠道无故障转移、
已确认等价的渠道间成本差 ≥3×（多半根本不等价）。

### 当前结果

relay 上 74 个模型 → 图片 4 + 视频 16 = **20 个 → 12 个编目**。

## 模型分类（文本 / 图片 / 视频 / 音频）


报表顶部有四个分类标签页。分类**不是靠猜模型名**，而是分三层：

| 层级 | 依据 | 置信度 |
| --- | --- | --- |
| 1 | `supported_endpoint_types` 含 `openai-video` / `image-generation` | `declared` |
| 2 | `tags` 含 `video` / `image` / `music`；或存在 `video_price` / `image_price` / `unit:"image"` | `declared` / `inferred` |
| 3 | 模型名正则（veo/sora/gpt-image/suno…） | `guessed` |

**为什么必须有第 3 层**：云飞 13 个模型全部只声明 `openai`/`gemini`，没有 tags 也没有
`video_price`——`veo-3.1-fast` 和 `gpt-image-2` 在 schema 层面和聊天模型完全一样。

**但「猜」会被标出来**：置信度为 `guessed` 的行在类别旁有一个黄色 `?`（悬停看依据），
顶部统计有「分类靠猜，待人工核」计数，勾选「只看分类存疑」可以单独过一遍。当前 54 个。

两条优先级规则值得注意：

- 具体声明 > 名字。`grok-imagine-video` 名字含 video，但若上游声明 `image-generation`，以声明为准。
- 名字 > 泛化的 text 声明。卡藏给部分视频模型也打了 `chat,text`，此时 `sd-mini-720p` 按名字判为视频。

## 文本模型的加价

文本按倍率加利润，**输入 / 输出 / 缓存三者乘同一个倍率**，成本列和售价列都显示
`入 / 出 / 存` 三个数。

缓存价保留上游自己的折扣，不统一重算——实测卡藏的 `cache/input` 从 0.02 到 0.29 不等，
强行套一个折扣会把大部分模型算错。

## 汇率

`1 USD = 1 CNY`（`DEFAULT_CNY_PER_USD = 1`，可用 `--fx` 覆盖）。按平价处理时不再打汇率警告；
只有显式传入非 1 的汇率才会提示汇率风险。

## 一个真实的单位陷阱

卡藏的 `doubao-seedance-*` 四个模型：`supported_endpoint_types` 是 `openai-video`，
但 `unit` 是 `1M_tokens`（45.5 CNY/1M）。这是**真实计价**——Seedance 按分辨率×时长
折算 token——但直接读成"45.5 每百万 token"会当成文本价报错。这类行会打
`unit_mismatch` 警告，提醒定价前先确认单位换算。

## HTML 可视化报表


```bash
npm run cost -- html                          # 三家全拉，输出 model-cost-report.html
npm run cost -- html --filter "video|sec"     # 只看视频
npm run cost -- html --markup 2 --out ~/report.html
```

单文件、无外部依赖、可直接双击打开，也可以发给别人。页内可实时调加价倍率、
按渠道/单位筛选、正则搜模型名、点表头排序，毛利即时重算。

两个价格列的含义不同，别看混：

| 列 | 含义 |
| --- | --- |
| 建议售价 | **最低**分组成本 × 加价倍率（对手会按这个价报） |
| 最差毛利 | 按该售价成交、但请求落在**最贵**分组时的真实毛利 |

单一分组的模型，最差毛利恒等于 `1 − 1/加价倍率`；**多分组模型才是风险所在**。
当前真实数据下，按 1.5× 加价有 **44 个模型的最差毛利为负**：

```
-1983.3%  spread 31.3×  yunfei/gpt-image-2.5-flare
-1150.0%  spread 18.8×  yunfei/gpt-image-2
 -566.7%  spread 10.0×  kacang/claude-sonnet-4-6
```

`gpt-image-2.5-flare` 的 -1983% 意味着：如果你按 `image2 1k`（$0.008）报价，
而请求走了 `image2.5_专线_124k`（$0.25），**你要倒贴 21 倍**。

## 卡藏是另一套 schema

卡藏虽然也是 new-api，但是**定制分支**，`/api/pricing` 结构与另外两家完全不同：

```json
{
  "price":  { "currency": "CNY", "unit": "1M_tokens", "input": 0.24, "output": 1.2 },
  "group_prices": {
    "CCMAX":    { "currency": "CNY", "unit": "1M_tokens", "input": 2.4, "output": 12 },
    "按次文本": { "currency": "CNY", "unit": "request",   "request": 0.055 }
  },
  "billing_mode": "per_token"
}
```

四个差异点，每个都曾导致误判：

1. **价格是显式的，不是倍率** — 没有 `model_ratio`/`model_price`，最初 80 个模型全被当成"无价格"
2. **计价货币是 CNY** — 按 `1 USD = 1 CNY` 平价处理（见上文「汇率」）
3. **`unit` 有四种**：`1M_tokens`(97) / `request`(57) / `image`(49) / `second`(14)
4. **`tiers` 是分时计价** — `Off-peak 0.2` vs `Peak 0.4`，**差 2 倍**，一律按最贵档算

第 3 点有个隐蔽陷阱：同一模型可能既有 `1M_tokens` 分组又有 `request` 分组。
这两个数**不是同类量**，放一起比会得出"218× 价差"这种假结论。
现在只在同单位内比较，异单位分组单独列出提醒。

## 手工录入成本（兜底）



三种计价单位，对应你遇到的三类模型：

```bash
# 按秒（视频）
npm run cost -- set --model veo-3.1 --channel yunfei --unit per_second --cost 0.40 --vendor google

# 按次（图片）
npm run cost -- set --model gpt-image-2 --channel yunfei --unit per_call --cost 0.03

# 按 token（语言模型，单位是美元/1M）
npm run cost -- set --model gpt-5.6 --channel kacang --unit token --input 1.25 --output 10
```

**同一模型在不同渠道分别记录**——三家价格不同，`--channel` 是台账主键的一部分。

## 加价策略

优先级 **模型 > 厂商 > 默认**：

```bash
npm run cost -- markup --default 1.5 --vendor google=1.35 --model veo-3.1=1.25
```

## 毛利报告

```bash
npm run cost -- report --price veo-3.1=0.60 --price MiniMaxH3-720p-sec=0.10
```

```
✅ veo-3.1 @ yunfei
   毛利率 33.3%（售价 0.600000 / 成本 0.400000 /秒）。
🚨 MiniMaxH3-720p-sec @ 22codex
   🚨 售价 0.100000 /秒 未高于成本 0.120000，每次调用都在亏损。
• gpt-image-2 @ yunfei
   尚未设置售价。建议 0.045000 /次（成本 0.030000 × 1.5）。
```

发现亏损时**退出码为 1**，可以直接接进 CI 当作闸门。

## 调价用新的生效日期，不要改旧记录

```bash
npm run cost -- set --model veo-3.1 --channel yunfei --unit per_second \
  --cost 0.30 --from 2026-12-01 --note "年底降价"
```

旧记录保留。`report` 默认按今天取价，`--at 2027-01-01` 可查任意时点：

| 查询时点 | 取用成本 | 毛利率（售价 0.60） |
| --- | --- | --- |
| 今天 | 0.40 | 33.3% |
| 2027-01-01 | 0.30 | 50.0% |

**没有生效日期，一次调价就会把历史毛利全部改写**，事后无法解释某个月的利润。

## 几个刻意的判断

- **成本为 0 时毛利率返回 null，不返回 100%。** 上游免费或录入遗漏都会导致成本为 0，
  报成 100% 毛利会掩盖配置错误。
- **售价等于成本也算亏损**（`<=` 而非 `<`）。打平不是健康状态。
- **未设售价 ≠ 亏损**，两者在报告里分开显示。

## 相关代码

- `scripts/probe-model.ts` — 探针 CLI 与传输层
- `scripts/model-cost.ts` — 成本台账 CLI
- `src/lib/probe/types.ts` — 类型契约
- `src/lib/probe/cases.ts` — 用例矩阵、tier、开销权重、适配器命名规则
- `src/lib/probe/video.ts` — 视频家族分派、时长规则、异步任务解析
- `src/lib/probe/cost-ledger.ts` — 成本/加价/毛利（纯函数）
- `src/lib/probe/judge.ts` — 判定逻辑（纯函数）
- `src/lib/probe/requests.ts` — 请求构造（纯函数）
- `src/lib/probe/judge.test.ts` + `video-cost.test.ts` — 52 项单测
