# 新版门户预览部署 · 2026-09-23

- 预览地址：`https://reizo-ai.com/portal-preview`
- 原首页 `/` 保留；没有新增从旧首页自动跳转到预览页的逻辑。
- 服务器：`40.160.139.134`；服务：`reizo`；运行目录：`/opt/reizo`；内部端口：`3001`。
- 本次构建源码：`/opt/reizo-portal-preview-build-20260923`。
- 构建基线：`/opt/reizo-pricing-build-20260922`，部署前构建编号 `ACVbUBsuTda_oTGB9EAE9` 与运行版本一致。
- 上一版本保留于：`/opt/reizo-before-portal-preview-20260923`。

本次仅叠加 `src/app/portal-preview/`、`src/components/portal-preview/` 和 `src/lib/portal/preview-roles.ts`。旧首页、ModelMarket、共享页脚和全局样式逐文件比较一致。本地其他未提交改动未上传。

构建和打包在服务器独立目录完成，发布前在 `127.0.0.1:3193` 临时运行并检查首页、预览页、Studio、Skills、价格页和产品页。数据库迁移检查结果为 `applied=0, baselined=0, already_recorded=14`。发布保留 `.env`、`data`、`backups` 和旧版哈希静态资源。临时检查服务已停止。

## 行业助手

上线检查发现精选的 18 个内置 Skills 在生产库中均为停用。用户明确选择启用这 18 个助手，并同意它们同时出现在现有 Skills 目录。只更新了 `preview-roles.ts` 中这 18 个既有 `bundled` 记录；没有批量启用其他 Skills。

启用前状态保留于服务器 `/opt/reizo-portal-preview-build-20260923/portal-preview-role-state.json`，权限为 `0600`。该文件不包含账号或 SSH 凭据。

生产预览读取已发布模型目录，不使用本地模型快照。模型监控图表仍为明确标注的演示数据。预览页设置 `noindex`。

## 发布后验证

公网浏览器验证通过：原首页的页面标题、全部区块标题和页脚与发布前基线一致；预览页包含 18 个助手且使用线上模型目录；输入内容及产品经理 Skill 正确带入真实 Studio；会员弹窗、监控轮播、390px 移动布局、导航及登录弹窗正常，没有浏览器运行时错误。

## 同日修复：宽屏标题被装饰遮挡

首屏白色旋转弧形装饰在 2560px 宽度越界覆盖模型区标题。只为新版 `.hero` 增加 `overflow: clip`，限制装饰绘制范围。继续使用本次服务器源码目录构建发布；此次回滚版本为 `/opt/reizo-before-portal-heading-fix-20260923`。数据库迁移检查仍为 0 项新增；助手配置未改动。

公网真实浏览器在 390、768、1440、1920、2560、3440px 下均通过标题像素可见性比对，宽屏标题恢复完整，页面无横向溢出。临时检查服务已停止，主服务保持 active。
