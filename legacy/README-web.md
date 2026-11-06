# 墨记 · AI 写作空间

一个参考 Typora 写作体验、独立实现的本地 Markdown 编辑器。支持本机 Codex 与第三方 OpenAI 兼容 API，带可拖动的 AI 问答浮窗。

## 打开

双击 `启动墨记.command`，或运行 `npm start`，然后访问 http://127.0.0.1:5188 。关闭启动终端会停止服务。首次安装依赖用 `npm ci`，修改代码后用 `npm run build`；开发模式为 `npm run dev`。

## 写作

- 即时预览直接编辑：标题、段落、粗体、斜体、引用、列表、任务、表格、代码块、图片与链接。
- 源码模式直接编辑 Markdown，切换模式后同步内容。
- 多文档、新建、改名、搜索、大纲跳转、导入 Markdown、导出 Markdown/HTML、浏览器打印为 PDF。
- 浅色/深色主题、专注模式。
- 文档自动保存到当前浏览器的本地存储。不同浏览器、域名和端口各有自己的存储空间；清理浏览器数据会删除本地文档，重要文档请定期导出备份。

## AI 问答浮窗

点击右下角或顶部的「AI 问答」。拖动浮窗标题栏可移动，减号收起。每篇文档有独立的本次运行对话；刷新页面会清空对话，不会清空文档。

选择「当前文档」「仅选中文字」「不附加文档」控制上下文。当前文档最多发送 120,000 字符，选文最多 30,000 字符，最近 16 条对话；超过长度会截断。可问答、总结、润色、续写。回答由用户主动插入；替换选文有原文/建议预览。提问后文档发生变化时，旧回答无法覆盖新内容。写回后可点提示中的撤销。

### 本机 Codex

默认接入方式，复用本机已安装且登录的 `codex` CLI。设置里模型留空时使用本机默认模型。后台以只读方式运行，传入对话和所选文档上下文，并关闭当前用户配置中的 MCP 服务；不授予编辑器目录写权限。这里的“本机”指调用本机 CLI，模型推理仍取决于 Codex 当前配置的远程服务。

已完成 CLI 与编辑器内的真实问答验证。现版本集成的是文档问答/写作助手，未开放任意终端操作、多 Agent 调度或自定义 MCP 工具管理。

### 第三方 OpenAI 兼容 API

浮窗齿轮 → 接入方式「OpenAI 兼容 API」，填写：

- API 地址：服务商提供的兼容根路径，通常以 `/v1` 结尾。也支持完整 `/chat/completions` 地址。
- API 密钥：本地无鉴权服务可留空；已有密钥时留空表示保留，可勾选清除。
- 模型：服务商支持的准确模型标识。

通过服务端调用 Chat Completions；支持 SSE 流式文本或普通 JSON 文本响应。密钥存储在 `.local/ai-settings.json`，权限为 0600，不返回给前端、不进入 localStorage。服务只监听 127.0.0.1，并拒绝跨来源 API 请求。所选文档内容会发送给配置的模型服务。

已用本地兼容服务验证协议、流式合并、上下文、密钥转发与隐藏；真实第三方服务需用户填写配置后验证，没有预填或创建真实 API 密钥。

## 快捷键

- ⌘/Ctrl + B：粗体；⌘/Ctrl + I：斜体。
- ⌘/Ctrl + S：导出 Markdown；⌘/Ctrl + O：导入。
- ⌘/Ctrl + Shift + A：AI 问答；⌘/Ctrl + \：侧栏。
- 即时预览内 ⌘/Ctrl + Z：撤销编辑。

## 验证与边界

`npm test` 运行浏览器流程；`node tests/api.integration.mjs` 运行独立的 API 协议测试。浏览器使用 Playwright 驱动本机 Chrome，因为本轮内置浏览器连接超时。

此版本是可运行的独立实现，不是 Typora 的完整复制：尚未实现数学公式/Mermaid 专用渲染、Pandoc 导出、系统文件夹实时同步、原生 macOS 安装包、跨设备同步。导入后不编辑时保留原始源码；在即时预览中编辑会经 Markdown 解析/序列化，空行、列表符号等格式可能规范化。高级或非标准 Markdown 建议先用源码模式核对。

技术实现采用 React + Vite + Tiptap（https://tiptap.dev/docs/editor/markdown），Node 本地服务。未复用 Typora 的专有代码或素材。

## 调查与设计

- `research/Typora逆向调查.md`、`research/typora-evidence.json`：Craft Anything 的只读静态调查及原始证据。
- `research/ai-editor-concept.png`：AI 浮窗概念图。
- `research/界面与验证.md`：界面对照、验证结果和有意差异。
- `research/editor-desktop.png`、`research/editor-mobile.png`、`research/editor-codex-live.png`：运行截图。
