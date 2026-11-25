# Android 开发与验收

当前为 Alpha.2 后续跨平台基础，使用 Tauri 2 单仓库共享 React/Rust/SQLite/Supabase。暂不发布正式 Android Release。

## 构建
- GitHub Actions：Android ARM64 基础验收（测试 APK），手动触发或 Android 配置/工作流修改推入 main。Linux runner 安装 JDK17、Android SDK、NDK 28.2.13676358、aarch64-linux-android，使用锁定的 Tauri CLI 初始化 Gradle 工程并构建。
- 有 SDK/NDK 的本机可运行 `npm run android:init -- --ci`，然后 `npm run android:build -- --debug --apk --target aarch64`。正式包名为 com.weepwood.todo；CI 调试包独立使用 com.weepwood.todo.qa.android，不能当作正式安装包或保证跨构建覆盖更新。
- CI 校验 APK 签名、包名、arm64-v8a 库和 SHA256，产物为 Actions artifact，不自动发布 Release。正式签名需持久化安全保管密钥，不提交密钥或密码。

## 验收边界
当前通过桌面 Rust 单测及 Android 浏览器模拟 IPC 测试；首次真实 APK 构建结果及 Android 真机运行待核验。当前本地任务、积分、SQLite 和前台同步沿用共享实现。仅应用运行期间检查提醒；真正的定时通知、重启恢复、后台同步、Keystore、FCM 和无 Google 服务设备推送仍待实现。真机需验证启动/退出、权限拒绝/同意、离线恢复、任务积分及兑换、登录隔离、系统返回、软键盘、附件导入导出。未经确认不新增费用。
