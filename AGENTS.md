# 墨记项目更新与发布约定

以下为用户明确指定的长期交付要求，后续更新必须遵守：

1. 每次功能或修复更新，同步维护根目录 `CHANGELOG.md`。说明版本、日期、新增/调整/修复内容、用户操作入口、验证情况，以及必要的兼容与升级说明。记录实际完成与实际验证，未验证事项明确区分。
2. 每次更新，同步维护 `docs/PRD.md`，与当前产品行为一致。包含需求背景、用户流程、功能规则、验收标准、范围和限制；不能把计划功能写成已实现。
3. 后续应用发布统一交付 **DMG**，分别提供 Apple Silicon 与 Intel Mac 版本，不再以 ZIP 作为新版本安装包。已有 ZIP 属于历史交付，保留原记录。
4. 发布目录随包提供该版本的更新日志与 PRD 快照，建议命名 `墨记-<版本>-更新日志.md`、`墨记-<版本>-PRD.md`。最终交付消息同时提供两个 DMG 和文档入口。
5. PRD、更新日志、应用版本及交付文件名保持一致。文档补齐本身不虚构新的应用版本或测试结果；记录未来发布规范时，不宣称尚未生成的 DMG 已交付。

当前应用版本以 `package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json` 为准。历史验证证据在 `research/`，正式构建与校验记录在 `release/macos/`。

GitHub仓库为 `fuhanshen/moji`；正式版本tag使用 `v<版本>`。安装包资产命名契约为 `Moji-<版本>-Apple-Silicon.dmg`、`Moji-<版本>-Intel.dmg`，客户端检查更新依赖该命名。**应用打包统一在 GitHub Actions 上完成，不在本地打包**：推送 `v<版本>` tag 触发 `.github/workflows/release-macos.yml`，工作流运行核心/Rust检查与 `python3 script/release.py --build`，生成双架构DMG与文档快照，上传全部资产（含脚本生成的`latest.json`）后自动将Release设为正式Latest；`workflow_dispatch` 可仅构建产物用于演练。本地只做检查、文档维护与源码/tag推送；本地历史构建记录（`release/macos/`）保留作历史证据。原始调查材料与本机数据不上传GitHub，发布产品说明与验证记录。
