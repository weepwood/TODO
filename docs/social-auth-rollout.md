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

## 决策更新：三种 OAuth + 已有邮箱登录
以上独立邮箱免验证及注册配额方案不再作为活跃任务。用户要求保留邮箱密码登录、不提供注册入口；新增 Microsoft (azure)，仅请求 email scope。Apple 涉及开发者资质、年费及六个月密钥续期，微信非内置 provider 且需资质、审核和额外协议适配，暂缓，不新增费用。
- Microsoft Entra 应用注册：https://entra.microsoft.com/ ，选支持个人及组织账号（若需面向两类用户），Web redirect URI 与前两种相同；在 Supabase Azure provider 配置 client ID/secret，按官方文档核对 tenant 和邮箱可信声明。凭据仅控制台。
- Email Provider 继续启用，Confirm email 保持开启；全局 Allow new users to sign up 保持开启。UI 已移除 signUp 调用和注册入口。
- 服务端仅允许 github/google/azure 创建账号：supabase/rollout/oauth-only-signup.sql 为待部署 SQL（非迁移）。在独立环境以 Auth Admin 执行函数，拒绝其他/缺失 provider；只信任服务端 app_metadata，不信任用户 metadata。SECURITY INVOKER、私有 schema、仅 supabase_auth_admin EXECUTE。先确认生产现有 Hook 不冲突及真实三方 OAuth 成功，再启用 Before User Created Hook 指向该函数；必须实际验证直接 /signup 被拒绝、已有邮箱密码登录及三个 OAuth 新用户正常。回退时停用该 Hook，不改变用户数据。当前本机缺少 Supabase CLI，未生成迁移或执行云端 SQL、未运行生产 advisors。独立 PostgreSQL SQL 10 个 provider 判定、2 个权限拒绝、1 个 invoker 校验通过；不等同 GoTrue 真实集成。
- 291/291 单测、隔离构建通过，三种 OAuth 模拟真实 SDK 回调3/3，已有邮箱密码模拟登录1/1；无生产认证配置变更、无推送发布、未完成原生 OAuth。原有安装包仍可能提供注册按钮，只有生产 Hook 启用才会真正阻止直接注册。不得将隐藏 UI 当作服务端限制。

## 2026-11-27 基础隐私与可迁移性（当前决策）
采用 Supabase 托管安全机制：HTTPS、平台静态加密、Auth、RLS、CAS；不声称 E2EE。不新增独立认证/密钥/同步服务，不购买或部署服务器。未来确有需要才按官方 Docker 自托管指南迁移。
- 官方参考：https://supabase.com/docs/guides/self-hosting/restore-from-platform ，https://supabase.com/docs/guides/self-hosting/auth/config ，核对日期 2026-11-27。逻辑备份需包含角色、schema、数据、auth 及相关对象；OAuth、JWT/API keys、SMTP、Edge Functions、Storage 文件、域名及平台配置另行处理。默认要求重新登录，不复制旧 JWT。
- 当前已有三份业务迁移 SQL，客户端使用 VITE_SUPABASE_URL 与 VITE_SUPABASE_PUBLISHABLE_KEY。原生 src-tauri/tauri.conf.json 的 connect-src 还需同步替换明确的 HTTPS/WSS 主机白名单并重新签名构建；不要放宽为通配。旧应用仍连接旧地址，必须先停写/冻结旧端并保留本地未同步数据，不能双主写入。Web 部署和新原生版本验收后才切换；出现分叉停止写入，按导出/恢复明确处理，不自动覆盖。
- 隔离恢复流程：先新建 Docker QA（未来实际迁移时），按官方流程导出 roles/schema/data 并恢复；校验 UUID、认证身份、任务版本/数量和摘要、RLS、RPC、Realtime 发布列、Hook 及独立 A/B 同步。另核查 Edge Functions 版本、实际部署状态及服务端凭据；不把源码存在认作正式启用。备份含敏感数据，使用加密离线存储，不提交 Git；自托管需自行做好 TLS、磁盘保护、最小权限、防火墙、更新、备份和恢复。
- 本批实际运行：现有三份迁移及待部署 Hook，在独立临时 PostgreSQL 集群、仅 Unix socket、合成 auth.users 与 auth.uid fixture。真实 pg_dump/pg_restore（同集群两个数据库，角色预置），源与恢复各17项 RLS、CAS、差量、发布列、Hook 检查通过；账号及工作空间合成行精确一致。未验证真实 GoTrue/Realtime 服务、不同集群角色迁移、真实 OAuth、真实生产备份、真实服务器迁移。证据 /Volumes/data/AI-Development/artifacts/TODO/supabase-portability-1575ab4/{verify.py,verify.log,verify-final.log}。
- 真实缺陷：旧 CHECK 遇到缺失 version/tasks 时可返回 NULL，允许本账号写入无效对象（非跨账号越权）。待部署修复 supabase/rollout/workspace-required-shape.sql 使用 IS TRUE；旧数据异常时事务回滚、不得重写。隔离验收：七种非法插入、一种非法更新拒绝、正常插入成功、原 revision 保留；含旧坏行时修复失败且原数据不变；修复后17项权限及同步 SQL 检查再次通过。生产应用前需只读统计异常行、备份、确认锁影响，通过正式 reviewed migration 处理；当前无 Supabase CLI/Docker，未生成迁移或运行云端 advisors，未执行任何生产 SQL。
- 用户批准保持简单；暂不进一步新增通用迁移自动化或加密协议。下一步仅真实 OAuth/原生回调及实际安全验收，服务端凭据由用户在控制台输入。当前不推送、不发布、不切换数据库。
