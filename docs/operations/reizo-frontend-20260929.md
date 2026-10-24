# REIZO 前端设计迁移 · 2026-09-29

用户提供的 `REIZO-review-2026-09-29/site` 已应用到项目，包括公开页面、工作台和账户。生产发布记录见下文。

## 页面与实现

| 设计页 | 应用路由 | 接入方式 |
| --- | --- | --- |
| index | `/` | 原稿布局、动画与交互，真实登录和导航 |
| agent | `/agent` | 原稿介绍页，嵌入真实 `/studio` |
| api | `/models` | 原稿首屏，真实模型目录、筛选、分页和价格 |
| business | `/business` | 原稿企业导航、场景切换、动画 |
| pricing | `/pricing` | 新视觉与真实钱包入口；未配置的新会员档位显示待开放 |
| account | `/account` 及子页 | 原稿账户概览，真实余额与权益；既有账户功能保留 |
| studio | `/studio` 及子页 | 浅米色侧栏、白色画布、棕色按钮；保留流式任务、上传、模型、技能与成果 |
| docs | `/docs` 及子页 | 新导航和响应式外壳，保留完整 API 文档 |
| cases / support / business-contact | `/cases`、`/support`、`/business/contact` | 原稿展示页；表单仅整理本地需求草稿，不会发送 |

原有产品目录、法律说明、账户管理子页保留内容和业务逻辑，接入新的公共外壳。工作台保留用户已保存的明暗主题设置，首次访问默认浅色。

## 维护

- 原稿保存在 `design/reizo-20260929/site`，仅作设计来源，不作为公开静态站点执行。
- 公共图片位于 `public/reizo/assets`。
- `node scripts/import-reizo-design.mjs` 重新生成 `src/components/reizo/generated` 中的模板、隔离样式和动画初始化函数。
- React 集成组件与补充样式位于 `src/components/reizo`；业务组件仍使用现有客户端与接口。
- 动画的监听器、定时器、观察器在组件卸载时清理；示例登录、示例余额、示例支付脚本未接入运行页面。
- 修改原稿后重新生成；不要直接维护生成文件。源码中带查询参数的 CSS 也会导入，原稿 body 类映射到页面根节点。

## 验证与限制

- 16 项定向测试通过：设计导入、脚本生命周期、Studio 模式、公开模型目录接口。
- 修改组件的 ESLint 无错误；旧产品列表保留 3 处已有 `<img>` 警告。
- 主要公开路由、工作台、账户概览、密钥和钱包均返回 HTTP 200。
- 浏览器验证：首页演示场景切换，真实登录弹窗，企业行业场景切换，工作台快捷输入，模型搜索空状态；390px 下首页、账户、API、价格、文档无横向溢出，手机菜单与文档目录可打开。
- 发布准备时已修复既有测试类型错误：为 Media Worker 测试补齐 `NODE_ENV`，明确 fetch mock 参数类型，将 ExcelJS 测试输入转换为独立 ArrayBuffer，移除事务 mock 中的同名类型引用。全量 TypeScript 检查通过，涉及的 56 项测试通过。
- 本地账户接口返回未登录，模型目录为空；真实登录后数据、付费调用和支付流程没有端到端验证。
- Core / Plus / Pro / Max 没有可直接购买的后端方案配置，因此保留设计卡片但明确显示待开放，充值继续走现有钱包。
- 开发模式编译 Studio 较重，检查中曾遇到内存分配失败；重启开发服务后继续验证。预览可使用 `node --max-old-space-size=4096 node_modules/next/dist/bin/next dev --webpack --port 3000`。

开始任务前已有未提交改动，均保留。原有 business 页面额外备份于 `output/reizo-migration-backup/business-page.tsx`。

## 生产发布（已完成）

- 用户授权发布至 `40.160.139.134`，SSH 用户 `ubuntu`；用户告知服务器 2026-10-20 到期。密码仅通过进程临时环境变量使用，不保存到仓库。
- 当前线上基线：`/opt/reizo-portal-preview-build-20260923`，BUILD_ID `uWUnnN5QpO2GyN4T25x2P`，与运行目录 `/opt/reizo` 一致。
- 独立构建目录：`/opt/reizo-frontend-build-20260929`。只叠加本次前端文件及五个测试类型修复；未上传本地其他后端、定价、接入脚本改动。
- 逐文件对比：涉及的既有源码与 Git 基线一致，企业页线上已有的 ReizoAI 标题改动继续保留。
- 初次构建因 rsync 过宽的 `data` 排除规则漏带 `src/data`，已补齐，并将持久化目录排除规则限定为根目录。
- 发布前临时服务仅监听 `127.0.0.1:3194`，通过 SSH 隧道验证。发布包含迁移检查、旧哈希静态资源保留、数据与备份保留、失败自动恢复旧运行目录。
- 生产构建通过，BUILD_ID：`CKktwK-C7NKBBngPjRDp8`。2026-09-29 15:19（北京时间）切换完成，运行目录 `/opt/reizo`，官网 `https://reizo-ai.com`。
- 回滚版本：`/opt/reizo-before-frontend-20260929`。独立构建源码与发布包保留在 `/opt/reizo-frontend-build-20260929`。
- 迁移正式执行结果：`applied=0, baselined=0, already_recorded=14`。
- 发布后 `reizo.service` 为 `active/running`，`NRestarts=0`；公网首页、API 模型、账户、工作台、文档、企业、价格、Skills 接口均为 HTTP 200。
- 公网浏览器已确认新版首页、48 个真实模型、真实登录弹窗；未发现浏览器错误。没有执行真实付费模型调用或支付。
- `data`、`backups` 与旧版本逐文件比较一致，`.env` 内容一致。临时预览服务和 SSH 隧道已停止。
- 公网截图：`output/reizo-migration/production-home.png`。

## 同日补充：展示会员月费（已发布）

按用户要求，将四档价格恢复为原稿的 Core ¥29/月、Plus ¥69/月、Pro ¥129/月、Max ¥229/月。页面保留“购买待开放”说明；此次只更新价格展示，没有开通购买、额度发放或折扣结算。

- 仅发布 `src/components/reizo/PricingPage.tsx` 和 `src/components/reizo/reizo.css`。
- 当前生产源码：`/opt/reizo-membership-prices-build-20260929`；BUILD_ID `PzbH0660u-i1kU2mYfrlb`。
- 回滚目录：`/opt/reizo-before-membership-prices-20260929`。
- TypeScript、定向 ESLint、生产构建通过，临时服务与公网浏览器均确认四档月费正确；主要页面返回 200。
- 迁移结果仍为 `applied=0, baselined=0, already_recorded=14`，数据、备份和配置按既有发布流程保留。
- 公网截图：`output/reizo-migration/production-membership-prices.png`。

## 同日补充：恢复完整会员说明（已发布）

按用户截图恢复四档会员的完整原稿内容：月度额度、有效期、另购余额折扣与示例、并发任务数量、每日登录额度、Agent 工作台、API 共用额度和会员到期说明；恢复 Pro 深绿色突出样式与“高频之选”标签。购买及所列权益仍标明待开放，购买按钮保持禁用。

- 仅发布 `PricingPage.tsx` 与 `reizo.css`，复用原稿已有的卡片与响应式样式。
- 当前生产源码：`/opt/reizo-membership-details-build-20260929`；BUILD_ID `2piYD4SNDgbKO9cyQ7m1a`。
- 回滚目录：`/opt/reizo-before-membership-details-20260929`。
- TypeScript、定向 ESLint、生产构建通过；临时服务逐项验证四档价格、额度、折扣、并发数和全部权益文字，浏览器确认卡片无横向溢出且 Pro 样式正确。
- 公网已验证四张卡片、完整文字和页面显示，浏览器无错误；首页、价格、工作台、账户和 Skills 接口均返回 200，服务 active/running、NRestarts=0。
- 迁移结果 `applied=0, baselined=0, already_recorded=14`；数据、备份与配置均与发布前一致。临时预览服务及隧道已停止。
- 公网截图：`output/reizo-migration/production-membership-details.png`。

## 同日补充：统一全部账户子页（已发布）

此前只有账户外层和概览接入原稿，其他子页仍沿用旧控制台样式。此次按原稿 `account.html` / `account.css` 统一账户区：

- 侧栏采用“我的账户 / 钱包与会员 / 开发与协作”的原稿分组、图标尺寸、暖灰选中态；保留安全、社区和管理员入口，并接入真实退出操作。
- `AccountPageContext` 让共享 `ConsolePage` 在账户路由使用原稿标题、说明和操作区；其他控制台保留原有布局。
- 账户作用域的 `account-theme.css` 统一米白背景、暖灰边框、棕色强调，以及卡片、表单、表格、数据图和弹窗的颜色变量；修复原稿 reset 对原有业务控件文字颜色、边框和间距的覆盖。
- 任务看板采用原稿四项统计、并发、余额、Token 区域及任务表格；继续读取真实会话与钱包，支持名称/模型搜索、时间范围和刷新。旧页面按记录序号虚构状态、进度、剩余时间，以及写死的 80% / 1.24M 等指标已移除。现有会话接口不提供运行状态、并发和汇总 Token，这些指标明确显示未同步，调用日志与任务详情仍可打开。
- 资料与设置补回账户身份卡片，保留个人/团队预设管理；我的会员从真实钱包读取已开通方案和额度，替代已经失效的旧计费目录空页。钱包改为原稿双额度卡片，保留充值、兑换码、用量和账单。
- 未登录的受保护账户页统一显示登录入口，不把接口鉴权错误当作页面主体。

发布记录：

- 18 个指定文件叠加到当前生产源码，修改前 12 个既有文件的 SHA-256 均与服务器一致，未上传其他本地改动。
- 当前生产源码：`/opt/reizo-account-design-build-20260929`；BUILD_ID `vRR4CpM9ZgHXxzus_tE2c`。
- 回滚目录：`/opt/reizo-before-account-design-20260929`。
- TypeScript、定向 ESLint、最终生产构建通过；任务筛选、会员额度、用量图、充值、预设共 16 项测试通过。
- 预发布 19 个账户路由均返回 200；浏览器确认原稿布局、主题与真实登录入口，390px 任务/会员页无横向溢出。公网确认任务看板为新布局、无旧组件，浏览器无错误。
- 迁移 `applied=0, baselined=0, already_recorded=14`；运行服务 active/running、NRestarts=0，数据、备份与配置逐文件比较一致。临时预览、SSH 隧道和本地验证服务已停止。
- 没有进行真实充值、密钥变更、团队变更或密码修改；当前浏览器未登录，已登录后的业务操作未做端到端验证。
- 公网截图：`output/reizo-account/production-account-tasks.png`。


## 同日补充：恢复登录成功欢迎动画（已发布）

原稿 `account-welcome.js` / `account-welcome.css` 有全屏磨砂欢迎动画，之前迁移仅保留了登录表单，遗漏了这段成功反馈。

- 恢复原稿时序：磨砂 720ms、问候语落下 900ms、稳定停留 2s、淡出 900ms。按本地时间显示早上/中午/下午/晚上好，使用真实账户显示名或用户名。
- 邮箱登录、注册后自动登录和密码找回后自动登录通过 `completeLogin` 播放；Google/GitHub 使用短期 sessionStorage 动画意图，在真实账户接口成功后消费一次。此标记不参与鉴权，刷新和窗口聚焦不会重复播放。
- 成功后关闭登录弹窗，等待其退场与焦点清理再播放。点击、Esc 可提前关闭；隐藏页面、退出登录或组件卸载均清理动画、定时器与滚动锁。保留原稿 reduced-motion 变体。
- 当前生产源码 `/opt/reizo-login-animation-build-20260929`；BUILD_ID `JPjWpPSdU0PxWONyBBJbX`；回滚目录 `/opt/reizo-before-login-animation-20260929`。
- 7 个指定文件部署；修改前 3 个既有文件 SHA-256 与线上源码一致。定向 ESLint、TypeScript、13 项账户/欢迎动画测试及生产构建通过。
- 本地生产组件预览验证完整动画、自动退场、点击和 Esc 关闭、重复播放、滚动及焦点恢复，无浏览器错误。截图 `output/reizo-login/welcome-animation.png` 是本地组件测试画面，用户名为测试输入。
- 预发布 19 个账户路由 200，真实登录表单正常，未登录不会误播；打包后的 JS/CSS 均包含欢迎动画。公网 15 个入口 200；账户设计、会员说明保持完整。
- 迁移 `applied=0, baselined=0, already_recorded=14`，服务 active/running、NRestarts=0，环境配置、数据和备份与上一运行版本一致。
- 未持有站点账户登录凭据，本次未执行真实密码登录或第三方授权端到端测试；欢迎组件已在浏览器验证，真实认证路径通过代码接入与构建验证。


## 同日补充：头像、昵称与邮箱编辑（已发布）

- 资料页新增头像选择、预览、保存、恢复默认，昵称编辑，以及邮箱绑定/更换表单，沿用账户区暖灰主题。
- 头像仅接受 JPG/PNG/WebP 静态图片，最大 5 MB；服务端检查文件签名、解码与像素上限，中心裁切为 256×256 WebP，移除原图片元数据后存入已有 users.image。首页账户入口、概览和 Studio 账户按钮同步读取真实头像。
- 昵称校验长度与控制字符，仅更新当前登录用户；保存后刷新共享账户状态，后续欢迎语使用新昵称。
- 邮箱操作验证新邮箱；密码账户先核验当前密码，OAuth-only 账户同时核验原邮箱。验证码 10 分钟有效、60 秒重发间隔、最多 5 次错误，另有用户请求限流；验证前不修改邮箱。成功后增加 authVersion，要求所有已有会话重新登录，第三方身份关联保持不变。
- 新增 /api/account/profile，校验 Origin、会话、活动状态与请求大小，不接受客户端指定用户 ID/权限。email_changes 表按用户保存挑战，用户行锁串行化发码与确认，事务内更新邮箱及消费验证码，错误次数在失败返回前提交。
- 已从用户指定的 40.160.141.231 只读获取现有 SMTP 配置，通过内存传输写入 REIZO 受保护的 .env；没有在仓库、日志或本地文件存储 SMTP 密钥。源中转服务未修改。SMTP 为 465 隐式 TLS，发布前后连接及认证均通过。
- 发信配置之前的备份随旧运行目录保留在 /opt/reizo-before-profile-edit-20260929/.env.before-profile-mail，权限 600。该邮件配置也使既有注册邮件验证和密码找回具备发信能力。
- 当前源码 /opt/reizo-profile-edit-build-20260929；BUILD_ID keJrw59kUBTl3liF2EIJP；回滚 /opt/reizo-before-profile-edit-20260929。迁移 0014_email_changes 已应用，现有 15 条迁移全部记录。
- 18 个指定文件叠加到上一生产源码，服务器 package.json/lock 仅增加已有 sharp 0.34.5 的直接依赖声明。既有文件核对后发现仅换行和一处注释差异，无业务版本冲突。
- 定向 ESLint、TypeScript、22 项本地测试通过；服务端 PostgreSQL 集成验证 20 项断言，覆盖密码校验、邮箱占用、用户隔离、冷却、过期、错误次数、正确改绑、旧会话失效、OAuth 双验证码、邮件失败清理。所有测试表和账户在同一外层事务中回滚，没有发送邮件。
- 本地真实组件配合模拟账户验证昵称保存、头像选择/预览/保存/恢复默认、邮箱表单及错误反馈；生产构建通过。预发布 19 个账户入口、公网 15 个入口均 200；公网写接口未登录 401、跨站 403，SMTP 认证正常，服务 active/running、NRestarts=0。原有账户设计与会员说明保持完整。
- 图片效果截图 output/reizo-profile/profile-edit.png 为本地组件测试画面，不代表修改了用户实际资料。未操作真实账户资料或向个人邮箱发送测试邮件；收件箱投递尚未由实际收信验证。
