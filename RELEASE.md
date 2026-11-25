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
