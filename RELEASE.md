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
