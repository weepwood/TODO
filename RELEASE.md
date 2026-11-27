# V1.0 发布门禁与验收说明

当前版本为 1.0.0-rc.1，不等同于正式 v1.0.0。

## 已验证和待验证
- 0.9.0 Pages 成功；安装包见对应 Actions 运行，构建成功不代表实际运行。
- 生产 Auth settings HTTP 200，email=true、disable_signup=false、mailer_autoconfirm=false；匿名 REST 读取工作空间 HTTP 401；todo_workspaces 已在 supabase_realtime 发布中。
- 安全顾问警告：泄露密码保护禁用。官方文档说明 Pro 或以上套餐才支持：https://supabase.com/docs/guides/auth/password-security 。不自动升级。
- 真实邮箱和认证后 Realtime：未完成。需要可控测试邮箱、正确 Site URL/Redirect URLs，以及允许发送到该邮箱的 SMTP。默认 SMTP 有发送限制，见 https://supabase.com/docs/guides/auth/auth-smtp 。不关闭邮件确认，不使用正式用户数据或将管理密钥写入客户端。
- 新注册客户端限制 12 字符；服务端策略需在后台核对，不应视为已强化服务端。
- Windows 设备离线；NSIS 构建不等于实机安装、快捷键及通知测试。
- 移动端 Chromium 触摸模拟通过；真实 Android/iOS 安装及刘海设备验证仍待完成。
- 对照双主题实际截图与竞品的任务聚焦、侧栏及日历并排机制；未完成逐像素竞品复刻。

## 安装和回滚
Web：https://weepwood.github.io/TODO/ 。首次在线打开后可离线重载访客空间。
桌面：从对应 GitHub Actions 下载 Apple Silicon dmg 或 Windows x64 NSIS exe。当前未商业签名/公证。勿关闭系统安全保护；若系统拒绝安装，先核实来源和签名。安装前导出完整工作空间归档。附件仍是本机存储。
旧版本兼容 V2 工作空间；若需回滚，应先备份当前工作空间及附件，不能直接覆盖唯一数据副本。
正式 Tag/Release 必须使用最终验收通过的 main SHA，核对 Pages、安装包名称/架构、SHA-256，注明是否签名、公证。未通过门禁不得创建正式 v1.0.0 标签。

## 真机验收流程
1. 使用可控邮箱注册、确认、登录；两独立浏览器上下文验证会话恢复、创建任务与实时事件、离线恢复、退出后访客隔离。
2. macOS/Windows 安装并启动，验证窗口恢复、托盘打开/关闭、全局快速录入、通知权限及实际系统提醒。测试工作空间应独立。
3. 实际手机通过浏览器安装 PWA，验证安全区域、触摸拖动、离线重载及升级。
4. 确认全部门禁后调整正式版本号，生成最终安装包及校验文件，创建 v1.0.0 Release 并上传资产。

## RC1 交付记录（2026-11-25）

- [RC1 预发行版下载](https://github.com/weepwood/TODO/releases/tag/v1.0.0-rc.1)：预发行标签固定于 6b78c9b，非正式最新版。两个安装包与 SHA256SUMS.txt 已上传并核对 GitHub 资产摘要，DMG 内部校验通过。
- Pages 45547695908 第二次部署成功，实际 HTTPS 首页、资源、RC1 版本及 Service Worker 验证通过；桌面 45547696373 已成功。
- macOS 隔离应用 920×640 窗口恢复成功；后台提醒提交及去重已验证，不能证明通知可见。辅助功能和屏幕录制权限未授予，托盘及快捷键交互仍待验收。Windows 离线。
- 正式发布门禁保持不变。

## 可重复的实网认证验收

使用 Node.js 22+，安装依赖后执行：

```sh
node scripts/verify-live.mjs
```

默认仅检查生产公开 Auth 设置、匿名 REST 和两个 RPC 的访问拒绝，不创建账号或写入工作空间。2026-11-25 实测通过。

注册一个专用测试邮箱账号并在邮箱中点击确认链接后，可在本机终端安全输入测试账号密码（不要将密码、访问令牌或确认链接写入聊天、源码、命令历史或日志）。以下示例适用于 Bash：

```bash
read -r -p 'QA email: ' TODO_QA_EMAIL
read -r -s -p 'QA password: ' TODO_QA_PASSWORD; echo
export TODO_QA_EMAIL TODO_QA_PASSWORD
node scripts/verify-live.mjs --live
# 仅当账号是全新专用测试账号、无任何真实数据，并明确同意写入时：
TODO_QA_ALLOW_WRITE=YES node scripts/verify-live.mjs --live --write
unset TODO_QA_EMAIL TODO_QA_PASSWORD
```

认证模式验证独立登录会话、邮件已确认标志、隔离内存存储恢复、刷新及本设备退出不影响另一会话。写入模式额外验证实际 Realtime UPDATE、CAS 与跨会话读取；仅接受不存在或与初始状态完全相同的工作空间，恢复时核对版本与内容，拒绝覆盖并发修改。不存在的工作空间会创建空白 QA 行；恢复后仍有空白行及版本历史。不要在正式账号使用写入模式。若网络中断导致恢复无法确认，请检查专用测试账号中的 QA 合成任务。此脚本不是邮箱送达或双浏览器 UI 验收的替代品。

本轮仅执行公开预检、Node 语法检查及缺少凭据的拒绝分支，真实认证/写入分支尚未执行。Windows 离线，macOS 辅助功能及屏幕录制仍未授权。正式 v1.0.0 保持冻结。

验收工具专项回归：`node --test tests/live-verifier.test.js`（模拟适配器 9 项，全部通过）。该测试覆盖失败补偿与清理保护，不能替代已认证的生产实网验收。实际脚本默认公开预检首次通过；最终两次复验失败，且 GitHub TLS 连接异常，待网络恢复后复查。

RC1 线上 PWA 补充验收：Edge 独立 Pixel 7 模拟上下文直接访问生产站点，Service Worker 接管、断网重载、新增任务、再次重载、联网恢复均通过，无页面运行错误；非实体手机安装。Pages 45549774057 两次部署失败后调整为独立构建/部署作业及唯一产物名称，实际新工作流结果仍须核对。

main 已进入 1.1.0-dev.1 后续开发，RC1 预发行标签与安装包保持 6b78c9b，不以 main 开发版代替正式 V1.0。Pages 45550198896 首次成功；真实手动确认测试账号已观察到成功登录与云工作空间写入（只读核实），邮件实际送达、认证后 Realtime 和设备验收仍未完成。

## V1.1.0-alpha.1 候选

main 进入 Alpha.1 候选，不替代 V1.0 RC1，正式 V1.0 门禁不变。本地 66 JS / 51 Edge / 9 Rust 与生产构建全部通过。待验证与候选提交一致的 Windows x64 和 macOS arm64 安装包、产物 SHA256、Pages 线上版本及资源，再创建标记为 prerelease 的 Release；不声称已发布，不要求商业签名或付费服务，不虚报实机结果。

## V1.2 签名发行和应用内更新

V1.2.0-alpha.1 为开发候选，不是已发布正式版。当前正式更新清单为空；普通开发/QA 仅检查版本，禁止下载安装。正式包 com.weepwood.todo，Android versionCode 102001，跨渠道单调递增；现有 QA 包不同包名/签名，需先导出或云同步迁移。稳定版和预发行版使用不同清单，渠道由安装版本决定，不跨渠道自动更新。桌面官方 Tauri Updater 2.14.1 requireSignedVersion，签名更新包与发布版本绑定；Android 原生 HTTPS 下载、大小/SHA256、版本/包名/证书及非 debug 验证，再 PackageInstaller 系统确认。更新前等待已有同步并暂停新同步、拒绝未解决冲突，flush SQLite、创建本地快照备份、再次 flush；不是全附件归档，系统确认期间仍需遵循正常保存机制。

### 首次签名配置（必须由有权限的维护者在安全本机完成）

本轮密钥配置工具请求被安全检查阻断，未确认生成或上传任何私钥。不要在聊天、公开仓库或日志中粘贴私钥。保留离线加密备份；签名密钥不能随版本重新生成。现有密钥不得覆盖。GitHub 仓库 Settings → Secrets and variables → Actions：

| 类型 | 名称 | 内容 |
|---|---|---|
| Secret | TODO_SIGN_UPDATER_KEY | Tauri signer generate 生成的私钥文件内容 |
| Secret | TODO_SIGN_UPDATER_PASSWORD | 对应私钥密码 |
| Secret | TODO_SIGN_ANDROID_KEYSTORE | 持久 PKCS12 keystore 的 Base64（alias todo-release） |
| Secret | TODO_SIGN_ANDROID_PASSWORD | 对应 keystore/key 密码 |
| Variable | TODO_UPDATER_PUBLIC_KEY | 对应 .pub 公钥文件内容 |
| Variable | TODO_ANDROID_CERT_SHA256 | Android 签名证书 SHA256，64 位小写十六进制，无冒号 |

使用 Tauri 官方 signer generate --write-keys 在仓库之外生成桌面密钥；Android 使用 keytool 生成长期有效 PKCS12 RSA 签名，独立安全备份。通过仓库 Secrets 界面配置，不发送给聊天。公钥和证书指纹是公开验证材料。正式首次发版后必须固定密钥，不随意更改变量或丢失备份。无需商业 Windows/macOS 证书才能签署 updater，但未经系统代码签名/公证仍可能有操作系统信任提示。

### 构建、草稿、发布

1. 先完成当前提交对应 android-runtime.yml 模拟器运行验收与桌面关联测试；确认正式包安装、前后台、SQLite、提醒及 Keystore。
2. 手动运行 signed-release.yml，预检查六个签名配置，任一缺失则停止。Windows x64 NSIS + minisign、macOS ARM64 DMG + app.tar.gz + minisign、Android ARM64 非 debug APK +固定证书签名；按平台检查并生成 SHA256 和 BUILD_COMMIT，仅创建草稿 Release，不发布更新清单。
3. 人工核对相同签名的两版本覆盖升级、SQLite 及未同步数据保留、失败重试、签名不匹配拒绝、Android PackageInstaller 用户确认与桌面重启。首个正式版本无前代正式包，使用独立同签名升级验收版本。真实验收尚未完成，不勾选通过。
4. 通过后手动运行 promote-release.yml，提供 Tag 与真实验收确认。检查同一 build SHA 的成功模拟器 workflow、完整资产及校验和、版本单调；先发布 Release，再以同一 Git commit 更新对应的两个 public/updates JSON 清单，触发 Pages。推送失败则旧清单不变，排查后重试；不覆盖已发布资产，不将预发行标记为 latest。
5. QA 与正式包、稳定与预发行渠道明确隔离。当前仅支持 Windows x64、macOS ARM64、Android ARM64；其他架构不能承诺更新。Android APK 下载可取消，桌面采用官方 updater 进度及签名校验，下载过程中暂不提供强制取消；应用退出后的未完成 Android 安装需重新检查/下载。WorkManager 后台双向同步仍未完成。

所有正式签名和覆盖升级尚待实际证据。不得将 CI 草稿或本地模拟测试称为正式发布。

## 敏捷开发阶段的验收策略

日常 UI、交互和业务迭代仅执行相关单元测试、必要浏览器回归和 Web 生产构建；合并 main 后自动更新 Pages。Android ARM64 QA APK、Android 模拟器原生运行与桌面安装包均改为手动触发，不作为普通前端 PR 的必经门禁。避免为每次界面修改重复构建或安装软件。涉及原生存储、权限、更新、安全等高风险变更时，按风险单独安排原生验证。正式发布前仍须按上述同一提交的原生运行、签名、覆盖升级、数据保留及更新清单门禁完成验收；不得将 Web 验收代替正式发布证据。

### V1.5 冻结候选：历史源码兼容及跨引擎复验

本机完整 Git 历史可运行 `TODO_LEGACY_TMP=/Volumes/data/AI-Development/tmp node scripts/verify-legacy-source.mjs`。脚本固定读取 V1.0 RC1 的 6b78c9b 实际历史领域代码，在独立临时目录及内存存储中验证旧数据迁移、原始备份、补充段/锁定保留和旧计时结算冲突。浅克隆缺少该提交时明确失败，不用伪造旧版实现替代。它不安装旧版、不访问生产工作区，不替代实体升级验收。

通过资源门禁，以匹配项目依赖的浏览器缓存运行 `TODO_BROWSER_ENGINE=webkit` 或 `firefox` 的 Playwright 专项；默认仍为 Chromium/Edge。WebKit 引擎通过不等于 Safari/iOS 真机验收，不能据此勾选原生升级或真实跨端云恢复。

### Firefox/macOS 27 本机测试启动隔离

macOS 27 的 Playwright Firefox 直接启动可能因应用数据保护报 `Could not find profile folder`（上游记录 https://github.com/microsoft/playwright/issues/42768 与 https://bugzilla.mozilla.org/show_bug.cgi?id=2062988）。本机 27.2.1、Playwright Firefox 1572 实际复现；改变 TMPDIR 不足以解决。仅给测试子进程指定新建空白的 CFFIXED_USER_HOME 后最小页面探针实际成功，不读取或更改正式 Firefox 数据，不修改权限、沙箱或系统配置。使用资源门禁运行：

```sh
/Volumes/data/AI-Development/scripts/run-budgeted --kind browser --label TODO-rc-firefox-isolated -- env PLAYWRIGHT_BROWSERS_PATH=/Volumes/data/AI-Development/cache/playwright-todo-rc node scripts/verify-firefox.mjs
```

脚本仅在 macOS 创建独立临时目录，退出时有界重试清理；其他系统使用 Playwright 默认隔离 profile。须先有匹配当前提交的生产构建。启动探针不是业务验收，资源门禁拒绝时不得勾选 Firefox 业务通过。

真实 QA 验收须在独立且已确认邮件的测试账号中运行。现有 `scripts/verify-live.mjs --live` 需要本机安全环境配置 TODO_QA_EMAIL / TODO_QA_PASSWORD；真实写入另需用户明确授权、`--write` 与 TODO_QA_ALLOW_WRITE=YES，非空工作区拒绝修改。脚本覆盖两个隔离认证会话、实时事件、CAS 冲突与空工作区恢复，不替代两台实体设备及完整备份恢复。不要将凭据写入仓库、聊天或日志。原生安装、升级、实体休眠/触控、正式签名仍需授权与对应隔离设备。未推送提交不能通过远端同 SHA CI；先确认候选代码与门禁，再由用户另行授权推送和正式流程。

## V1.2.0-alpha.2 认证候选（未发布）

版本 1.2.0-alpha.2，Android versionCode 102002。仅保留 GitHub、Google、已有邮箱登录。生产公开预检使用 `node scripts/verify-live.mjs --oauth`，核对双 Provider、官方授权地址和回调，不跟随登录、创建账号或写入任务；不能替代真实 OAuth 会话。用户已确认邮箱验证完成；生产聚合只显示一个已确认邮箱身份，尚无 GitHub/Google 身份记录。注册 Hook 仍须真实双 OAuth 验收后启用；不关闭全局 signup。正式签名、真机、同签名覆盖升级和数据保护门禁不变，不推送、不发布。
