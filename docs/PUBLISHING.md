# 墨记发布流程

仓库：https://github.com/fuhanshen/moji

1. 实现与检查完成后，同步修改`package.json`、锁文件根版本、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`的版本；维护`CHANGELOG.md`与`docs/PRD.md`。
2. 执行适合变更的核心、浏览器和Rust检查，记录实际结果。浏览器流程检查需先启动`npm run web:dev`。
3. 审查待提交文件，确保没有本机数据库、密钥、账号配置或原始调查转储；提交并推送源码。
4. **在GitHub Actions上打包，不在本地打包**：推送`v<版本>`tag（与package.json版本一致）触发`.github/workflows/release-macos.yml`。工作流运行核心与Rust检查，执行`python3 script/release.py --build`生成双架构DMG、文档快照及SHA256SUMS（校验版本、架构、系统动态库依赖、签名、DMG完整性和挂载内容），上传草稿Release全部资产（含`latest.json`）后自动发布为Latest正式版。本地不再执行DMG打包；`workflow_dispatch`（不勾选发布）可仅构建产物用于演练。
5. 在Actions运行页核对构建日志、SHA256校验输出与Release资产清单；失败时在本地修复后重推tag（或先删除该tag再重建）。
6. 未登录下载`https://github.com/fuhanshen/moji/releases/latest/download/latest.json`，并在匿名API可用时读取`/repos/fuhanshen/moji/releases/latest`，核对版本及两个DMG下载地址。再从独立验证窗口点击检查更新，确认真实请求正常。

安装包名称必须为：

- `Moji-<版本>-Apple-Silicon.dmg`
- `Moji-<版本>-Intel.dmg`

更新功能使用上述资产命名契约。只创建tag不会产生可检查的版本；草稿和预览Release不会被作为正式更新提供。客户端只检查并打开下载地址，不自动安装，不含GitHub令牌。

当前应用使用ad-hoc签名，未Apple公证；不能把构建签名校验通过描述为已公证或已在所有Mac实测。开发者证书与公证凭据应单独配置，不能提交到仓库。

`latest.json`由脚本根据应用版本、DMG名称与日志自动生成，发布时必须上传。应用优先读取该文件，减少对匿名REST API配额的依赖；不要将它指向未发布版本或其他仓库。
