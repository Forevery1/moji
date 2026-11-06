# 墨记 · macOS 独立应用

[下载最新版本](https://github.com/fuhanshen/moji/releases/latest) · [更新日志](CHANGELOG.md) · [产品PRD](docs/PRD.md)

AI 原生 Markdown 编辑器，支持本机 Codex、OpenAI 兼容 API、MCP 工具、即时预览、数学、Mermaid、表格、主题与全局字体。

Rust + Tauri 2 + SQLite 的 AI Markdown 编辑器。React + CodeMirror 6 写作界面运行在系统 WKWebView 中；文件、数据库、Codex 子进程和第三方 API 调用均由 Rust 处理。运行应用不需要浏览器、Node 服务或本地 HTTP 端口。

## 版本文档与后续交付

每次更新同步维护 [更新日志](CHANGELOG.md) 和 [产品PRD](docs/PRD.md)，发布时附上对应版本快照。从0.8.0起安装包为 Apple Silicon / Intel 两个 DMG，包含应用、Applications快捷入口、更新日志及PRD；已有 ZIP 为历史交付。

## 打开应用

从 [GitHub Releases](https://github.com/fuhanshen/moji/releases/latest) 下载对应架构DMG，打开后把「墨记.app」拖到「Applications」。更新前正常退出旧版，再替换应用。0.8.0 提供 Apple Silicon（arm64）和 Intel（x86_64）两个独立包，最低配置为 macOS 12。Apple Silicon 正式应用在 `release/macos/墨记.app`，Intel 应用在 `release/macos/intel/墨记.app`。Intel 验证包已通过本机 Rosetta 启动并检查编辑器、公式、表格及主题；尚未在物理 Intel Mac 或旧系统逐项验收。

应用使用本地临时签名（ad-hoc），尚未进行 Developer ID 签名和 Apple 公证，当前交付用于本机使用；不应将其描述为已公证的公开发行版本。

## 数据在哪里

数据目录：`~/Library/Application Support/com.fuhanshen.moji/`

- `moji.sqlite3`：文档、文档顺序、活动文档、AI 对话（包含工具调用记录）、非敏感 AI / MCP 配置，以及每篇最近 50 条修改历史。
- `moji.sqlite3-wal`、`moji.sqlite3-shm`：SQLite 运行期日志与共享状态。退出应用后备份整个目录。
- `agent-work/`：本机 Codex 的只读工作目录。
- MCP 环境变量和 HTTP 请求头：macOS 钥匙串，服务 `com.fuhanshen.moji.mcp`，每个服务独立账户。应用不回显已保存凭据。
- 第三方 API 密钥：macOS 钥匙串，服务 `com.fuhanshen.moji.ai`，账户 `openai-compatible`。不保存在 SQLite，也不返回到界面。

文档以 SQLite 为默认持久存储，Markdown 文件可通过系统文件选择器导入，通过系统保存对话框导出。工作区保存采用事务；修改前的旧内容保留在 revisions 表中，当前尚无完整的历史版本浏览界面。AI 替换提供预览与即时撤销。

旧浏览器版数据仍在原浏览器中，原样保留。需要迁移时，先在浏览器导出 Markdown，再在原生应用中导入；浏览器 localStorage 不会自动跨到 WKWebView。旧 `.local/ai-settings.json` 也不会自动迁移，原生版的第三方密钥需在设置里重新填写以存入钥匙串。

## AI 问答浮窗

右下角或顶部「AI 问答」打开浮窗，可拖动、收起。支持当前文档、仅选文、无文档三种上下文；每篇文档独立保存对话，关闭并重新打开后仍可读取。

- **本机 Codex**：自动查找 `~/.local/bin/codex`、`~/.cargo/bin/codex`、Homebrew 和 PATH。复用本机 Codex 登录与默认模型，已在原生窗口观察到真实润色回答和写回。Codex CLI 仍以只读方式调用。开启 MCP 后，由墨记将已启用的工具清单提供给模型；每次 MCP 调用须确认，可能读写哪些外部数据取决于你配置的服务。Codex CLI 是可选的外部依赖，未打包进应用；第三方 API 模式不依赖 Codex。
- **第三方 OpenAI 兼容 API**：在齿轮设置中填写 API 地址、模型和密钥。支持 Chat Completions 的 SSE 流式文本与普通 JSON 文本回答。Rust 后端发请求，Tauri Channel 向界面传递文本。支持停止、超时和错误提示。真实第三方服务待用户配置；Rust 协议测试使用本地模拟服务。

上下文上限：文档 120,000 字符、选文 30,000 字符、最近 16 条消息；超过会截断。传入内容会发送到当前选择的模型服务。本机 Codex 指本机调用 CLI，并不代表模型离线推理。

## 0.8：GitHub发布与检查更新

左下角版本按钮「检查更新」优先读取本仓库最新正式Release的`latest.json`，必要时使用公开API，显示版本说明，按Apple Silicon或Intel选择DMG。仅点击后联网，无需GitHub登录，不发送文档或AI配置。支持网络错误重试、无正式版本和缺当前架构安装包提示，排除预览版、阻止降级和外部下载链接。

点击「下载新版DMG」通过系统浏览器下载，再正常退出旧应用并手动替换；本版不在后台下载安装。旧版本尚无此入口，需先手动安装0.8.0。更新日志与PRD同时作为Release附件提供。

维护者发布流程见 [发布说明](docs/PUBLISHING.md)。

## 0.7.1：文件列表删除入口

每个文件右侧提供垃圾桶按钮；删除未选中文件时保持当前正文，删除当前文件后打开相邻文件。误删后可在8秒内通过提示中的「撤回」恢复原文及列表位置；若已主动切换到其他文档，撤回不会打断当前导航。至少保留一篇文档。导出菜单保留导出和打印操作。

## 0.7：全局字体调节

顶部「字体设置」（T图标）打开「字体与排版」。正文可选择跟随主题、系统字体、宋体、苹方、楷体、黑体、衬线、等宽或输入本机字体名称；字号12–36px、行距1.3–2.6倍。界面可独立选择字体和12–20px字号。更改即时应用到全部文档，包括后续新建文档，自动保存，切换主题或明暗模式后保持。

默认不覆盖主题原字体；每项可恢复跟随主题，也可一键「重置全部」。标题按主题原有字号比例缩放，正文和表格共用字号，代码保持等宽并随字号缩放，源码字号共用正文设置。界面大字号下工具栏可换行，避免小窗口横向溢出。公式和图表的内部字体由排版引擎管理。

字体偏好保存在当前墨记的本机WebView设置中（`moji.typography.v1`），不写入Markdown或修改数据库结构。HTML导出与打印排版面携带正文排版设置；自定义系统字体不会嵌入导出文件，在其他机器打开时需安装对应字体，否则采用替代字体。

详见 [0.7 使用与验证](research/墨记0.7使用与验证.md)。

## 0.6：MCP 服务与独立明暗模式

打开 AI 浮窗，点击插头图标「MCP 服务」，添加本地命令（stdio）或 Streamable HTTP 地址。支持服务编辑/启停/断开、连接并查看工具、粘贴 `mcpServers` / `mcp_servers` JSON 配置。环境变量和请求头中的凭据存入钥匙串。首次连接服务不会调用业务工具；启用本地命令时需要本机具备服务要求的运行环境。

在 AI 浮窗勾选「使用 MCP 工具」，提问后可查看工具名称、参数，逐次「允许调用」或「拒绝」，完成后可展开工具结果。本机 Codex 通过 JSON 规划接入同一确认流程；OpenAI 兼容 API 需要模型支持 Chat Completions tools/function calling。MCP 模式按轮返回，未开启时继续使用原有普通问答流程。上限32个服务、同时提供64个工具、12轮，等待确认90秒，单次工具45秒；停止生成使待确认请求失效。已执行的外部操作不会因停止而自动回滚。

左下角太阳/月亮按钮现在只改变明暗模式，保留当前主题ID、名称、字体、排版与原文；所选明暗模式独立保存。选择另一套主题时采用该主题原有明暗配色。HTML 导出与打印使用当前明暗模式。

详见 [0.6 使用与验证](research/墨记0.6使用与验证.md)。本轮新增的是 MCP 客户端的工具发现与调用；OAuth、旧HTTP+SSE传输、MCP资源/提示词浏览界面未包含在本版。

## 构建与开发

从GitHub获取源码后，运行`npm ci`安装前端依赖。准备Rust、Xcode与所需架构目标。完整发布包使用：

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
python3 script/release.py --build
```

该流程不会终止正在运行的墨记；在`release/macos/`生成两个DMG、版本文档快照、SHA256SUMS及构建记录。DMG仅通过磁盘映像命令创建，不依赖Finder布局脚本。


准备 Node、Rust 和 Xcode 后：

```sh
npm ci
./script/build_and_run.sh --verify
```

该脚本负责停止同名应用、构建、复制至 `release/macos/墨记.app`、启动与进程验证。不要在有未完成 AI 请求或未保存编辑时运行重建脚本。Codex Run 按钮通过 `.codex/environments/environment.toml` 指向此脚本。

常用命令：

```sh
npm run app           # 原生开发模式
npm run build:mac     # 构建当前架构 .app，不重启正在使用的窗口
npm run tauri -- build --target x86_64-apple-darwin --bundles app # Intel 构建（先安装 Rust 目标）
npm run test:rust     # Rust 数据库、接口契约、SSE 与网络协议测试
npm run test:core     # 原文保真、选区、撤销、IME 状态与 Markdown 核心
npm test              # Chrome / WebKit 写作流程及模拟原生 IPC 流程
```

`script/build_and_run.sh` 还支持 `--debug`、`--logs`、`--telemetry`。Rust CLI 若不在 PATH，请先将 `~/.cargo/bin` 加入 PATH；项目构建脚本已处理这个路径。

## 代码结构

- `src-tauri/src/db.rs`：SQLite 事务、文档与对话持久化、历史。
- `src-tauri/src/ai.rs`：钥匙串、Codex、OpenAI 兼容网络流、取消。
- `src-tauri/src/files.rs`：macOS 文件导入、导出与系统打印。
- `src-tauri/src/lib.rs`：原生应用与命令注册。
- `src/native.js`：界面到 Rust 的 IPC/Channel 适配。
- `src/App.jsx`、`src/Editor.jsx`、`src/AIPanel.jsx`：写作界面和 AI 浮窗。
- `legacy/`：保留的浏览器版 Node 服务与旧说明，仅用于浏览器预览和旧测试；不会进入 .app。

浏览器预览：`npm run web:dev` 或 `npm run web:start`，默认 `127.0.0.1:5188`。纯 UI 测试需该服务运行；它不参与原生应用运行。

## 0.5 主题与深色文字修复

顶部调色盘或左下角主题名称打开「选择主题」，支持搜索、明暗筛选、点击应用和自动记住选择。压缩包内的 14 套主题已成为默认内置选项：GitHub、Gothic、Newsprint、Night、Pixyll、Vue、Vue Dark、Whitey，以及 GitHub / Gothic / Newsprint / Night / Pixyll / Whitey 的经典版。另保留墨记浅色和墨记深色，共 16 个选项。首次启动沿用原有明暗偏好，不强制覆盖用户选择。

主题字体随应用离线提供，网页导出包含所选主题与字体；Markdown 导出保留原文。品牌「墨记」、顶部文件名称、侧栏已选/未选文件名称和「导出」按钮使用主题文字颜色，修复深色下同色不可见的问题。主题 CSS 仅作用于正文，Typora 专用界面样式经筛选，不承诺所有效果逐像素一致。主题原始素材与字体声明保留在 `themes/presets/`，随应用提供 `THEME_NOTICES.txt`。

详见 [0.5 使用与验证](research/墨记0.5使用与验证.md)。

## 0.4 新增写作功能

- 数学：`$…$` 行内公式、独占行 `$$…$$` 块公式，以及 `\(…\)` / `\[…\]` 标记；本地 MathJax SVG，支持分式、积分、矩阵、AMS、编号和 label/ref，点击预览回到 TeX 编辑。
- Mermaid：`mermaid` 围栏实时图表；常用流程、时序、类图和甘特图经过测试，支持错误提示、修复恢复、主题重绘与 HTML SVG 导出。
- 可视化表格：点击单元格编辑；行列增删、移动和拖动，列对齐、矩形选区、尺寸调整、矩阵粘贴、源码切换、复制和格式化，共用文档撤销；表格选文可发送 AI 并确认写回。

用法与验收记录：`research/墨记0.4使用与验证.md`；可导入示例：`research/fixtures/墨记0.4功能示例.md`。

## 当前边界

尚未提供 Pandoc 导出、文件夹实时同步、多设备同步或后台自动安装更新。表格是 Markdown 矩形表格，不包含合并单元格、电子表格计算和像素列宽保存。公式引擎包含本版本明确加载的 TeX 扩展，不包含 Typora 所有扩展，例如 xypic/physics；Mermaid 未额外注册 ZenUML。真实系统中文输入法候选、听写、辅助功能、旧 macOS 和每种复杂图表仍需专项兼容性验收。

原文驱动的即时预览保留未修改部分的 Markdown 标记、空行和原有换行符。HTML 原始代码和不支持的扩展保持原文。相对路径图片还没有接入原生文件基准目录。

最新交付以本README、PRD、更新日志及对应版本的产品验证记录为准。编辑器核心独立实现；内置主题来自用户提供的主题包，原始主题说明及字体许可保留在`themes/presets/`和`public/THEME_NOTICES.txt`。JavaScript依赖许可文本随包包含在`THIRD_PARTY_NOTICES.txt`。
