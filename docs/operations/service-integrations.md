# Reizo 服务接入

管理员入口：个人中心 → 平台 → 服务接入，路径 `/account/services`。

首批支持 Tavily 搜索、Jina Reader 网页读取、ElevenLabs 语音合成。Jina Embedding / Rerank、Groq 与 OpenRouter 模型渠道仍由 New API 管理。

## 部署

1. 保留现有 `REIZO_TOKEN_ENCRYPTION_KEY`；与平台已有的 New API 凭据共用 AES-256-GCM 加密设施。不要在已有数据库上直接更换该密钥。
2. 运行 `node scripts/db-migrate.mjs`，应用 `0013_service_integrations.sql`，然后重启应用。此迁移仅新增私有 `service_integrations` 表，不修改现有业务数据。
3. 用平台管理员账号打开服务接入页，粘贴对应 Key，保存配置，再点击测试。初始状态全部停用；停用状态也允许管理员测试。
4. ElevenLabs 可修改模型 ID 与音色 ID。默认 `eleven_multilingual_v2` 和 `JBFqnCBsd6RMkjVDRZzb`，以账号实际权限为准。

## 配置行为

- Key 仅加密存储在服务专用表中；读取接口只返回 `hasKey`，不返回明文、后缀或密文。Key 输入框留空保留原值；清除需明确勾选，并同时停用。
- 供应商地址固定为官方接口，不能通过管理请求覆盖；禁用 HTTP 重定向，避免凭据转发到其他地址。
- 管理接口 `/api/admin/service-integrations` 所有操作均检查平台管理员权限，禁止缓存。配置保存使用版本号检测冲突。
- 管理员测试会实际执行一次搜索、读取示例网页或合成短语音，可能消耗供应商额度；不扣用户钱包。每个供应商测试间隔至少 30 秒，超时 25 秒，响应上限 5 MiB。
- 保存最近 10 次测试的时间、配置版本、状态、耗时和供应商用量摘要，不保存原始结果或原始错误。修改配置不会将旧测试误标为当前配置通过。
- 数据库行锁用于并发配置更新及测试预约。进程在测试途中退出时，30 秒后可以重试。

## 调用边界

`src/lib/service-integrations/service.ts` 的 `executeService(id, input)` 是服务端调用入口，读取已保存配置，并拒绝停用服务。返回正文或音频以及用量摘要。

此版本交付配置管理、服务适配和管理员测试；尚未将搜索/TTS 自动接入工作台、Agent 工具、公共 API 或客户钱包扣费。将来接入业务调用时，调用方必须先实现用户鉴权、额度检查、消费幂等及调用日志，不能直接向普通用户暴露这个内部入口。后台启用不会自动发布首页提供商目录。

## 验证

`npx vitest run src/lib/service-integrations src/app/api/admin/service-integrations/route.test.ts`

覆盖加密与脱敏、Key 保留/清除、管理员权限、配置冲突、启停、测试限流、并发保存期间的测试结果归属、三种供应商协议和错误脱敏。真实供应商联调需要对应测试 Key。

## 2026-09-22 上线记录

- Reizo 已发布到 `https://reizo-ai.com/account/services`，服务器 `40.160.139.134`。构建目录 `/opt/reizo-services-build-20260922`；回滚目录 `/opt/reizo-before-services-20260922`。已执行迁移 `0013_service_integrations`。
- Tavily、Jina Reader、ElevenLabs 已加密保存用户提供的测试 Key 并启用；三项实际接口测试均通过。报告及源码不包含 Key。
- New API 的当前服务器是 `15.204.82.213`，SSH 用户 `ubuntu`；旧技能中的 `104.160.47.89` 已不是本次操作目标。
- New API 测试渠道：`255 reizo-test-jina`、`256 reizo-test-openrouter`、`257 reizo-test-groq`。均保持手动停用，分组为 `reizo-service-test`，不参与正式流量。
- 测试模型使用 `reizo-test/` 前缀，通过模型映射转发到真实模型：`jina-embeddings-v3`、`jina-reranker-v2-base-multilingual`、`openai/text-embedding-3-small`、`whisper-large-v3-turbo`。仅这四个测试别名配置为零内部计费，上游仍按真实用量收费；原有正式价格未修改。
- Jina 向量、重排序和 OpenRouter 向量通过 New API 管理员渠道测试。Groq 使用短录音，通过 New API 的 `/v1/audio/transcriptions` 实测转录成功；普通聊天式渠道测试不适用于此音频模型。测试期间临时启用的 Groq 渠道已停用，临时管理员测试令牌已撤销。
- 正式开放之前，需要单独确认正式模型名称、销售价格和面向用户的分组；不能直接将测试别名用作正式销售模型。

## 2026-09-22 门户展示预览

- 在门户发布配置中追加 6 个品牌条目、7 个服务或模型；保留此前 9 个品牌分类条目和 41 个模型。音频：ElevenLabs、Groq；检索：Tavily、Jina Reader；向量与重排序：Jina、OpenRouter。
- 这些条目没有正式可用渠道，公开目录返回 `catalog_only: true`。卡片显示“展示预览 / 正式调用与计费尚未开放”，不展示价格或工作台调用链接。
- 展示内容在 `/account/portal` 维护；私有 Key 仍在 `/account/services` 维护。目录配置不包含 Key。
- 当前构建目录 `/opt/reizo-preview-build-20260922`，程序回滚目录 `/opt/reizo-before-preview-20260922`，发布前配置备份 `/opt/reizo/backups/portal-before-service-preview-20260922.json`。
- 生产构建和 TypeScript 检查通过；浏览器验证首页品牌、7 个目录条目、6 个品牌筛选链接，以及预览卡片无调用链接。
