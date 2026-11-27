# 社交登录与免邮件注册收口

基线 main 3ad8ee2，独立分支 feat/social-auth-web。仅接入 Web/PWA GitHub、Google OAuth，复用现有 Supabase SDK、账号 UUID、RLS、存储作用域与同步。原生邮箱登录保持不变。Web 切换 PKCE，同一浏览器完成 OAuth 回调；旧版隐式邮件确认链接可能不能自动建立会话，完成邮件确认后可通过原有邮箱密码登录。禁止自行按邮箱字符串合并工作空间。

## 服务端配置（尚未执行）
- GitHub OAuth App：https://github.com/settings/developers
- Google OAuth Web application：https://console.cloud.google.com/auth/clients
- 两个 Provider 的授权回调 URI 均为 https://xepkhnatnpvopnlqnrrz.supabase.co/auth/v1/callback ；应用首页 https://weepwood.github.io/TODO/ 。Google 面向公开用户需按其控制台配置外部受众与发布状态。
- 将客户端 ID 与 Secret 仅通过 Supabase Dashboard Authentication Providers 配置；不得写入客户端、Git、日志或聊天。
- Supabase URL Configuration 的 Site URL 和精确 Redirect URLs 包含 https://weepwood.github.io/TODO/ 。仅在独立 QA 环境允许必要本地回调，不用通配生产地址。
- 公开 Auth settings 实查：github=false、google=false、email=true、disable_signup=false、mailer_autoconfirm=false。按钮根据真实 Provider 状态启用；网络失败保留邮箱入口。
- 测试真实授权、取消、重复登录、同邮箱身份关联、跨账号隔离、同步恢复；没有真实 provider 凭据和独立账号不得宣布上线。原生需独立实现系统浏览器 PKCE、回调 URI、会话安全及返回应用，不能使用嵌入式 WebView 代替 Google OAuth。

## 邮箱免邮件与限制
关闭 Confirm email 会隐式确认任意输入的邮箱；与 OAuth 自动关联结合可导致预先账号冒用。不得直接关闭生产邮件确认。可选安全方案：先 OAuth 验证真实邮箱，再在已认证会话设置密码作为后续邮箱登录方式（需核对安全密码变更配置）；或者继续邮件确认并配置自有 SMTP；没有外部身份验证的纯密码注册应使用独立用户名身份或受控邀请方案，另行审查账户恢复、绑定和邮箱修改。不得承诺不验证真实邮箱即可安全自动关联。

反滥用建议：由 Auth Before User Created Hook 在服务端限制新账号，按可信请求 IP 例如滚动24小时最多3个邮箱账号；设备安装随机标识可作为辅助频率指标，不能作为强身份或唯一限制（可清缓存、重新安装、修改客户端）。可结合 Turnstile/hCaptcha；不收集 MAC/IMEI/侵入式指纹，不限制正常登录、避免永久 IP 封禁与误伤共用网络，限制只针对创建账号。阈值为建议、未部署；Hook 必须在独立 QA 验证并发、绕过直连 API、IPv6/共享 IP、拒绝及恢复，私有表最小权限、短期保留。Auth Hooks 免费计划支持。限制注册次数不解决邮箱所有权问题。

## 验收
独立模拟 API 的真实 Chromium SDK OAuth 测试两项：分别验证 GitHub/Google、未启用 provider 禁止点击、PKCE verifier/challenge 对照、code 清理、账号及访客作用域隔离。真实外部账号未执行。全量单测291/291，构建通过；首次 E2E 构建环境不匹配（生产公开 settings 只读），重新用隔离 example.invalid 构建后2/2通过。无正式云写入、不变更 Auth 配置、不推送、不发布、不新增依赖。保留4197/4318。
