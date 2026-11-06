# 墨记发布流程

仓库：https://github.com/fuhanshen/moji

1. 实现与检查完成后，同步修改`package.json`、锁文件根版本、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`的版本；维护`CHANGELOG.md`与`docs/PRD.md`。
2. 执行适合变更的核心、浏览器和Rust检查，记录实际结果。浏览器流程检查需先启动`npm run web:dev`。
3. 安装两个Rust目标后执行`python3 script/release.py --build`。该脚本生成应用/DMG、文档快照及SHA256SUMS，并校验版本、架构、系统动态库依赖、签名、DMG完整性和挂载内容。它不会结束现有墨记进程。
4. 审查待提交文件，确保没有本机数据库、密钥、账号配置或原始调查转储；提交并推送源码。
5. 创建`v<版本>`草稿Release，上传两个DMG、PRD、更新日志、SHA256SUMS、构建记录和`latest.json`后，发布为Latest正式版。标题和说明列出主要变化、安装步骤、验证范围与已知限制。
6. 未登录下载`https://github.com/fuhanshen/moji/releases/latest/download/latest.json`，并在匿名API可用时读取`/repos/fuhanshen/moji/releases/latest`，核对版本及两个DMG下载地址。再从独立验证窗口点击检查更新，确认真实请求正常。

安装包名称必须为：

- `Moji-<版本>-Apple-Silicon.dmg`
- `Moji-<版本>-Intel.dmg`

更新功能使用上述资产命名契约。只创建tag不会产生可检查的版本；草稿和预览Release不会被作为正式更新提供。客户端只检查并打开下载地址，不自动安装，不含GitHub令牌。

当前应用使用ad-hoc签名，未Apple公证；不能把构建签名校验通过描述为已公证或已在所有Mac实测。开发者证书与公证凭据应单独配置，不能提交到仓库。

`latest.json`由脚本根据应用版本、DMG名称与日志自动生成，发布时必须上传。应用优先读取该文件，减少对匿名REST API配额的依赖；不要将它指向未发布版本或其他仓库。
