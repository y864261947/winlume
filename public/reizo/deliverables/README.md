# REIZO 首页成果样例

本目录保存首页八类场景的实际交付文件。业务、品牌、人员和数据均为创作样例，不代表真实客户项目。首页回放不调用模型。

- 图片：复用项目内 NYNOR 的六张 JPG，并提供原图 ZIP。新增 MORI 护理系列概念图。
- 视频：复用 `../showcase/everyday-film.mp4`，不重复复制。
- 工作簿：六份 XLSX，付款与渠道分析保留计算公式。
- 文档：两份 DOCX、配套 Markdown 和纯文本。
- 演示稿：三份可编辑 PPTX，每份四页。页面 PNG 从 PPTX 渲染。
- 网页：winery.html 可独立打开，预约表单只做本地校验，不提交用户资料。
- 图表：channel-growth.svg 与渠道工作簿使用同一组数据。

生成与验证工具位于 `scripts/showcase-content.mjs`、`scripts/build-showcase-deliverables.mjs`、`scripts/build-showcase-documents.py`、`scripts/render-showcase-assets.py` 和 `scripts/finalize-showcase-assets.mjs`。使用 Codex 提供的文档运行时。临时渲染工具、PDF 和检查报告位于仓库 output 目录，不用于发布。

MORI 图片使用 imagegen 内置模式生成，原图保存于 Codex generated_images。提示词：Create one polished editorial product photograph, landscape 3:2. Fictional haircare concept brand MORI, label LIGHT REPAIR. Two premium matte sage green bottles and a warm ivory conditioner jar on natural pale limestone in a quiet sunlit bathroom. Products on the right, calm light stone on the left. Realistic packaging photography, no interface or border. This is a fictional sample product visualization for an editable concept proposal.
