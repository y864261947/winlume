# 从 new-api 迁移到 Reizo

`scripts/migrate-new-api.ts` 是一次性、受控的数据迁移工具。它默认只做
`dry-run`，正式写入必须显式带上 `--apply`。它不会连接旧服务 HTTP API，也不会让旧服务
继续作为 Reizo 的运行时依赖。

## 迁移范围

| old new-api | Reizo | 处理方式 |
| --- | --- | --- |
| `users` | `users` | 保留 legacy user id、bcrypt 密码哈希、状态、管理员角色和时间戳。非 bcrypt 密码不导入。 |
| `tokens` | `api_keys` | 旧 key 只在进程内做 SHA-256 后写入 `key_hash`；不写入任何明文。 |
| `users.quota`、充值、消费日志 | `wallets`、`wallet_ledger_entries`、`usage_events` | 以当前 quota 加历史充值/消费推导期初账目，最终余额应回到旧系统当前 quota。 |
| 套餐、用户订阅 | `subscription_plans`、`subscriptions` | 不可映射的套餐会创建停用占位套餐，避免丢失订阅历史。 |
| 充值/订阅订单、provider | `payment_orders`、`payment_providers` | provider 的 `*_ciphertext` 可按原样保留；旧明文 provider 密钥不写入目标表。 |
| `channels` | 加密交接产物 | 当前 Reizo schema 尚无旧 channel 的直接目标表。渠道记录会以 AES-256-GCM 产物交给 operator 配置 gateway，明文永不进入报告。 |

旧 Auth.js/new-api 会话、管理 access token、OAuth access/refresh token、MFA 与
passkey 都不会迁移。用户在 Reizo 重新登录并重新绑定 OAuth/MFA/passkey。

## 前置检查

1. 先完成目标数据库 migration：`npm run db:migrate`。
2. 对目标 PostgreSQL 做可恢复备份。
3. 从旧库获取只读、临时的导出权限；不要把连接串、JSON 快照或 channel
   产物提交到 Git、上传到 issue 或发送到日志系统。
4. 先跑一次 dry-run，人工确认 reconciliation JSON 中的 `errors` 为零。

## 推荐：JSON 快照

将受控 JSON 放在权限为 `0600` 的位置，并用环境变量或参数指定。顶层字段可使用
camelCase 或 snake_case；也可以放到 `tables` 对象中。支持的集合为：

```json
{
  "version": 1,
  "users": [],
  "tokens": [],
  "logs": [],
  "topups": [],
  "subscriptionPlans": [],
  "subscriptionOrders": [],
  "userSubscriptions": [],
  "paymentProviders": [],
  "channels": []
}
```

先检查，不会写数据库或渠道产物：

```bash
DATABASE_URL='postgres://reizo:...' \
NEW_API_MIGRATION_SOURCE_FILE=/secure/new-api-export.json \
npm run migration:new-api -- --report=/secure/new-api-dry-run.json
```

正式导入必须同时提供加密渠道交接文件的目标和密钥：

```bash
DATABASE_URL='postgres://reizo:...' \
NEW_API_MIGRATION_SOURCE_FILE=/secure/new-api-export.json \
REIZO_MIGRATION_CHANNEL_ENCRYPTION_KEY='a separately managed 32-byte key or passphrase' \
npm run migration:new-api -- \
  --apply \
  --report=/secure/new-api-apply-report.json \
  --channel-artifact=/secure/new-api-channels.enc.json
```

如果快照不包含 `channels`，则不需要 `--channel-artifact` 和渠道密钥。

## PostgreSQL / SQL 快照

也可让工具用只读源库连接直接读取已知表。旧 new-api 的日志库若独立，可设置
`NEW_API_MIGRATION_SOURCE_LOG_DATABASE_URL`：

```bash
DATABASE_URL='postgres://reizo:...' \
NEW_API_MIGRATION_SOURCE_DATABASE_URL='postgres://readonly:...' \
NEW_API_MIGRATION_SOURCE_LOG_DATABASE_URL='postgres://readonly-log:...' \
npm run migration:new-api -- --max-rows=500000 --report=/secure/report.json
```

对于离线 SQL，工具只解析带显式列名的 `INSERT INTO ... (columns) VALUES ...`，
不会执行 SQL。适合由 `pg_dump --data-only --inserts --column-inserts` 生成的受控
快照：

```bash
npm run migration:new-api -- --source-file=/secure/new-api.sql --report=/secure/report.json
```

可通过 `--snapshot-out=/secure/raw-snapshot.json` 将直接读取的源库快照保存到本地。
该文件可能包含 bcrypt 哈希和旧 token 材料，必须按秘密文件处理；工具不会把它打印到
终端。

## 报告与核对

报告只包含数量、状态和汇总金额，不包含密码、token、API key、provider 密钥或
channel 配置。重点检查：

- `entities.*.source/planned/imported/skipped/conflicts/errors`
- `balances.currentQuotaMicrocredits`
- `balances.historyCreditsMicrocredits`
- `balances.historyDebitsMicrocredits`
- `balances.computedOpeningMicrocredits`
- `balances.targetVerifiedUsers` / `balances.targetMismatchedUsers`（仅正式导入后）
- `channels.blocked` 是否为 `0`（仅在有渠道且正式导入时）

对每个用户，工具计算：

```text
opening = old current quota - imported top-up credits + imported usage debits
final balance = opening + imported top-up credits - imported usage debits
```

因此写入后应以目标 `wallet_ledger_entries` 汇总和旧 `users.quota` 做抽样与全量核对。
多次运行是幂等的：用户 legacy id、key hash、usage/ledger idempotency key、订单号和
套餐 code 都会去重；账本不会更新或删除已有记录。

## 运行时配置

```bash
# JSON 输入（二选一）
NEW_API_MIGRATION_SOURCE_FILE=/secure/new-api-export.json

# 或者 PostgreSQL 源库
NEW_API_MIGRATION_SOURCE_DATABASE_URL=
NEW_API_MIGRATION_SOURCE_LOG_DATABASE_URL=

# 可选输出，均应位于受限目录
NEW_API_MIGRATION_REPORT_FILE=/secure/report.json
NEW_API_MIGRATION_CHANNEL_ARTIFACT_FILE=/secure/channels.enc.json
NEW_API_MIGRATION_SNAPSHOT_OUT=/secure/raw-source-snapshot.json

# 只有命令行显式带 --apply 才会写入
REIZO_MIGRATION_CHANNEL_ENCRYPTION_KEY=

# 设为 0 可禁止原有 *_ciphertext 写入 payment_providers
NEW_API_MIGRATION_PRESERVE_CIPHERTEXT=1
```

完成 reconciliation、备份核验和 gateway 渠道配置验收后，才停止并下线 old
new-api。不要在停机前删除旧数据源或源库备份。
