# 模型与服务定价

管理入口：`/account/service-pricing`，仅平台管理员可读写。

## 新增服务

7 项服务支持保存成本价、拟定销售价、各自币种（USD/CNY）及备注。计费单位固定于具体服务，防止单位与参考价错配。空值表示未定价，零值是明确的零价，金额使用最多 6 位小数的字符串保存。毛利估算仅在成本与销售币种相同时显示，不含手续费、税费等额外成本。

价格存储在 `portal_content_settings` 的 `service-price:<id>` 独立键下，与 `public-portal` 和私有供应商凭据分开；公开门户不会读取这些成本数据。每条配置用行锁和 revision 防止并发覆盖。复用已有设置表，无新增迁移。

此页保存的是新增服务的拟定价格，尚未应用于用户扣费、启用渠道或首页销售价。正式费率选项卡复用现有 New API 定价编辑器，该编辑器会修改已进入计费目录的实际费率。

## 官方参考（2026-09-22）

| 服务 | 美元参考价 | 条件与官方来源 |
| --- | --- | --- |
| ElevenLabs Multilingual v2 | $0.10 / 千字符 | [API 价格](https://elevenlabs.io/pricing/api)，按量价，套餐与税费需另核对 |
| Groq Whisper Large V3 Turbo | $0.04 / 音频小时 | [语音文档](https://console.groq.com/docs/speech-to-text)，单次至少按 10 秒计费 |
| Tavily Search | $0.008 / credit | [Credits & Pricing](https://docs.tavily.com/documentation/api-credits)，基础搜索 1 credit/次，高级搜索 2 credits/次；月套餐单价不同 |
| OpenRouter text-embedding-3-small | $0.02 / 百万输入 Token | [模型价格](https://openrouter.ai/openai/text-embedding-3-small/api)，也经公开 embeddings/models API 核对，不包含账户充值费用 |
| Jina Reader / Embedding / Rerank | 待账号购买页核对 | [充值说明](https://jina.ai/embeddings/#pricing)，共享 Token 余额、档位及旧版自动充值价格不同；不把免费测试额度视为生产零成本 |

参考数据是有核对日期的静态快照，不自动刷新，也不自动覆盖管理员保存的成本或销售价。Jina 官方英文页搜索结果曾显示 $50 / 10 亿 Token 和 $500 / 110 亿 Token 的充值示例，但当前主站内容没有返回完整档位，故未将其作为已确认固定单价填入界面。

## 验证

- `npx vitest run src/lib/service-pricing/config.test.ts src/app/api/admin/service-pricing/route.test.ts`
- 定价配置与路由共 13 项测试，包含权限、禁缓存、格式校验、零价/未定价区分、版本冲突和错误脱敏。
- 生产数据库回读与旧版本拒绝测试不改变价格数值。
- 浏览器使用模拟管理员接口验证填入成本、保存、刷新回读和正式费率入口，不写入真实销售价。

## 上线记录

2026-09-22 已部署到 `https://reizo-ai.com/account/service-pricing`。构建 `/opt/reizo-pricing-build-20260922`，程序回滚 `/opt/reizo-before-pricing-20260922`。生产编译、TypeScript、定向 ESLint、13 项测试均通过。页面与原首页返回 200；管理接口未登录 GET/PUT 返回 401。浏览器验证 7 个编辑区、参考价填入、保存后刷新、正式费率选项卡和手机视口均通过。销售价保持未填写；未修改正式 New API 费率。
