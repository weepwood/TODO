# Android 开发与验收

当前为 Alpha.2 后续跨平台基础，使用 Tauri 2 单仓库共享 React/Rust/SQLite/Supabase。暂不发布正式 Android Release。

## 构建
- GitHub Actions：Android ARM64 基础验收（测试 APK），手动触发或 Android 配置/工作流修改推入 main。Linux runner 安装 JDK17、Android SDK、NDK 28.2.13676358、aarch64-linux-android，使用锁定的 Tauri CLI 初始化 Gradle 工程并构建。
- 有 SDK/NDK 的本机可运行 `npm run android:init -- --ci`，然后 `npm run android:build -- --debug`。正式包名为 com.weepwood.todo；CI 调试包独立使用 com.weepwood.todo.qa.android，不能当作正式安装包或保证跨构建覆盖更新。
- CI 校验 APK 签名、包名、arm64-v8a 库和 SHA256，产物为 Actions artifact，不自动发布 Release。正式签名需持久化安全保管密钥，不提交密钥或密码。

## 验收边界
当前通过桌面 Rust 单测及 Android 浏览器模拟 IPC 测试；首次真实 APK 构建结果及 Android 真机运行待核验。当前本地任务、积分、SQLite 和前台同步沿用共享实现。仅应用运行期间检查提醒；真正的定时通知、重启恢复、后台同步、Keystore、FCM 和无 Google 服务设备推送仍待实现。真机需验证启动/退出、权限拒绝/同意、离线恢复、任务积分及兑换、登录隔离、系统返回、软键盘、附件导入导出。未经确认不新增费用。

## Android 原生能力第二阶段（实验）

移动端使用任务/日历/每日规划/统计/更多五项底部导航、全宽详情、非破坏性详情右滑关闭、VisualViewport 键盘适配。Kotlin Activity 回退桥接先询问 WebView 是否消耗返回动作；未处理则交给系统。前后台及 pagehide 尽力 flush SQLite；不能保证系统强杀前异步写入完成。恢复前台触发既有 revision/CAS 同步。

- 系统定时提醒：显式开启并授权后，复用 Tauri notification 插件的 batch/pending/cancel 与 Android AlarmManager、Boot Receiver。最多200个未来30天的请求；保存成功后对账，改期/完成/删除/切换账号取消旧请求。使用保留 ID 范围、设备本地注册表、重复提交/孤立请求恢复。默认通用锁屏文案，不暴露任务标题。插件接收成功不等于实际送达；已交付系统调度的请求不再主动重复弹窗，应用内仍记录提醒。后台调度、重启、Doze、时区和精确闹钟权限须实机确认；不自动申请精确闹钟特权。开关默认关闭。
- Android 会话：独立 todo-mobile Tauri 插件，AndroidKeyStore AES-256-GCM，每次加密随机 IV，包名/键名 AAD，AtomicFile 持久化于 noBackupFilesDir；仅允许三个固定 Supabase 会话键。无明文 WebView 存储回退，不迁移旧明文会话；失效可显式清除登录会话，不删除工作空间。原生加解密与升级恢复仍待真机验证，SQLite 任务库本身未加密。
- WorkManager：可选实验性后台版本检查，已提交 SQLite 快照的 revision/dirty 意图加密保存，15分钟周期及暂停时单次联网任务。仅使用有效 access token 向绑定的 Supabase HTTPS 项目 GET 当前账号 revision；禁止重定向、后台刷新令牌、后台写入任务/云端。令牌过期等待前台恢复。现有 SQLite 快照为离线修改的权威队列，foreground CAS 继续唯一工作空间写入者。不是完整后台上传/下载引擎；后续需要原生单写入者、事务回执、会话刷新仲裁和真实多设备冲突验收。
- CI 45565487067 实际失败在 setup-android 默认安装已废弃 tools 包，明确 packages: platform-tools；已版本化 Kotlin/Gradle 插件源码和 Android 专属 ACL，CI 按移动源码/配置触发。仅 debug QA APK，不创建正式 Release；正式长期签名另验收。

- 构建参数约定：package.json 的 android:build 已固定 --target aarch64 --apk；CI 和本机调用仅附加 --debug、--ci、--config 等参数，不重复传入 APK 与目标架构。CI 45567472907 已通过 SDK/NDK、npm test 与 Android 工程生成，在 CLI 参数解析处因重复 --apk 失败，尚未编译原生代码。

- CI 45567844861：SDK/NDK、JS 测试和工程初始化均通过，Gradle 已开始构建并加载 Tauri 与自定义插件。实际阻塞为 :app:rustBuildArm64Debug 调用 npm run tauri 时缺少通用脚本（Missing script: "tauri"），不是已确认的 Rust/Kotlin 源码错误。新增 package.json 的 tauri: tauri 入口，构建路径监听 package/lock 与构建回归测试。仍需实际 APK 编译及签名校验。

## 首个 ARM64 APK 与原生运行验收

- 工作流 45572563121（f69cac8）真实通过 84 项 JS、Rust ARM64/Kotlin/Gradle 编译、APK v2 签名、独立包名与 ARM64 库检查，并生成 SHA256。产物 ID 15002832661，压缩包 38443963 字节，ZIP SHA256 afaa20bba4b42a5e65e77cb3cd2e2e6199aa826aab129049380093310f57d80b。Pages 45572563040 成功。调试签名不是长期发布签名，不承诺覆盖升级。
- 独立 android-runtime.yml 生成 x86_64 测试包 com.weepwood.todo.qa.runtime，使用无效云地址、合成测试数据和 Android API35 模拟器。通过真实 WebView CDP 与 ADB 尝试验收安装/启动、任务积分与 SQLite、系统返回键、桌面 ACL、Keystore 密文/重启恢复、通知权限及系统记录、定时请求/取消。仅将 CI 实际通过的项记录为已验证，不等同于 ARM64 实体设备、后台通知送达、重启恢复或真实云同步。测试包仅用于 CI，不发布或传输真实会话。

## Android 品牌图标
- 新版 Android 图标源文件在 src-tauri/brand，蓝色渐变背景、单一对勾、单色主题层。`npm run android:icons` 通过锁定的 Tauri CLI 生成五档密度及 adaptive XML，并仅复制 Android 资源；android:init / android:build 自动调用，已有生成工程同步资源。桌面和 Web 原有图标暂保持不变。CI 检查 APK 中背景/单色资源；新图标实际打包和 launcher 截图仍待验收。
