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

## 原生 OAuth 候选实现
仅采用两项必要的 Tauri 官方插件（JS/Rust 同版本锁定 Deep Link 2.6.3、Opener 2.7.3），复用现有 single-instance 与 Supabase SDK 2.119.2。不安装程序，不增加服务或自建登录协议。
- 原生回调白名单增加 `com.weepwood.todo://auth/callback`（Supabase Redirect URLs 精确添加，不替换 provider 的 HTTPS 回调地址；Web 继续原地址）。系统浏览器打开经校验的 Supabase /auth/v1/authorize；Opener 仅 main 窗口固定项目地址及授权查询参数，关闭通用链接注入；迁移服务器时同步调整 CSP 与 opener scope。Capture 不获得打开链接权限。
- 当前仅处理设置窗口活动时的授权。使用固定路径、PKCE S256、SDK flowId、一次活动尝试、5 分钟超时、取消/重复/错误/未知回调拒绝；回调前重新检查本地持久化。关闭设置或进程退出后重新开始，不持久化额外授权状态，不接受 token fragment。不保证自定义 scheme 的独占注册；PKCE 减轻授权码截获风险，实际 OS 仍需验收。
- Android 原生 Vault 保留固定键 ACL 和 Keystore；锁定 SDK 新增 per-flow verifier slot/index，新增短期键只在内存中处理，固定会话/旧 verifier 仍走原 Vault。原有清理、后台检查及账号 UUID 语义不变。
- 验收证据：native-auth-unit.log 294/294，native-auth-web-build.log 构建成功，native-auth-final-e2e.log 6/6（桌面和 Android 的模拟 IPC 浏览器授权、取消/重复及访客保留，Web 三种 OAuth 与已有邮箱登录）；首轮失败证据 native-auth-e2e-first.log、native-auth-unit-first.log、native-auth-android-e2e.log 保留。Android 初轮详情覆盖导航测试失败，调整关闭详情定位；第二轮发现真实 SDK 临时键与固定 Vault 约束不兼容，修复后通过。ACL 测试兼容带 scope 的对象并新增精确 opener 断言，未放宽业务断言。模拟 IPC 不等于实际系统浏览器、Android Keystore 或生产 OAuth 成功。
- 参考 https://v2.tauri.app/plugin/deep-linking/ 、https://v2.tauri.app/plugin/opener/ 、https://supabase.com/docs/guides/auth/native-mobile-deep-linking 。真实 Provider 配置尚未完成，禁止将候选称为已上线。

- macOS ARM64 Rust 锁定依赖编译检查（cargo check --locked --jobs 2）通过，耗时 1m01s，证据 native-auth-rust-check.log。不是正式安装包，也未验证真实 OS 回调。

## 生产只读审查与配置交接（2026-11-27）
- 实际 Supabase MCP 连接 TODO（xepkhnatnpvopnlqnrrz），ACTIVE_HEALTHY。迁移历史精确匹配三份业务迁移。只读聚合：1 个账号、1 个工作空间、0 个不符合必要字段的行；新 shape 约束和 signup Hook 均未部署。未读取邮箱、任务正文或密码；未变更生产数据。
- RLS 开启，SELECT/INSERT/UPDATE 均为 authenticated 且 auth.uid()=user_id（INSERT 同时 revision=1，UPDATE 有 USING 与 WITH CHECK）；anon 无表权限，authenticated 无 DELETE。四个业务函数 SECURITY INVOKER、空 search_path；anon 无 EXECUTE，authenticated 仅可调用读/写差量 RPC。Realtime publication 仅 user_id/revision/updated_at。实际 node scripts/verify-live.mjs 匿名拒绝检查通过（读工作空间、读差量、空写差量请求均 401/403）；未执行 --live 或 --write。
- Security Advisor 当前仅一项 WARN auth_leaked_password_protection；官方 https://supabase.com/docs/guides/auth/password-security 说明该功能需 Pro 及以上，不升级、不绕过。保留邮箱确认和既有会话保护，后续以 OAuth 为新账号入口。
- 实际公开 Auth settings：HTTP 200，github=false/google=false/azure=false，email=true，disable_signup=false，mailer_autoconfirm=false。可用 Supabase MCP 无 Provider/Redirect/Hook 配置写接口；不搜索或读取本机认证密钥，不借用其他项目凭据。
- 控制台配置顺序：先 GitHub OAuth App（https://github.com/settings/developers），再 Google Web application（https://console.cloud.google.com/auth/clients），再 Microsoft Entra App registration（https://entra.microsoft.com/）。全部 provider HTTPS callback 为 https://xepkhnatnpvopnlqnrrz.supabase.co/auth/v1/callback 。Google 设置外部受众、必要 scope 和实际发布状态；Microsoft 支持个人和组织账号、common tenant，依官方 https://supabase.com/docs/guides/auth/social-sign-in/auth-azure 配置 xms_edov/email 可选声明，禁止允许未验证邮箱域。凭据仅由管理员直接填入 Supabase Auth Providers；不写聊天/仓库。
- URL Configuration：Site URL https://weepwood.github.io/TODO/ ，精确允许 Web URL 与 com.weepwood.todo://auth/callback。保持 Email Provider 开启、Confirm email 开启、全局 signup 开启，先完成独立测试账号三种 OAuth 的真实登录和账号隔离，再启用 Before User Created Hook 并复验直接邮箱注册拒绝。新 shape 约束实际生产零坏行，但尚无备份恢复授权和正式受审迁移，不直接应用。
- 原生当前只支持活动设置窗口的回调。真实 macOS/Windows/Android OS 回调及生产同步恢复未验收。未推送、未合并、未发布，不启动其他研发专项。

## 2026-11-27 认证服务配置进展

- 生产 Supabase 已启用 GitHub、Google Provider；Email 仍启用，Confirm email 开启，全局 signup 开启，Azure 未启用。公开 settings 接口已验证上述状态。
- Site URL 为 Pages 生产地址；Redirect URLs 精确包含 Pages 和原生协议回调。GitHub 使用精确 Supabase 回调，未启用通配符或设备流程。Google Cloud 独立 TODO 项目为测试模式，当前 Google 账号已列为测试用户；仅配置 Web 客户端及 Supabase 回调，未申请额外 API 权限。
- 生成时出现在工具记录中的 GitHub 旧密钥已删除，Google 旧密钥已停用；后续使用各自新密钥。Google 显示停用可能需要一段时间生效。密钥未写入仓库。
- 按用户要求暂不配置 Microsoft。真实 OAuth、跨账号隔离及现有邮箱登录尚未验收，生产注册 Hook 未部署；须使用独立测试账号和隔离环境，不能使用正式个人数据或将模拟验收当作真实验收。候选代码未发布。

## 最终认证范围：GitHub + Google（2026-11-27）
- 用户确认已完成 GitHub、Google 配置并取消 Microsoft。客户端 provider 列表、授权入口和待部署 Hook 仅保留 github/google；邮箱仅登录、访客、PKCE、原生安全回调和 Supabase 基础安全保持不变。Apple、微信及 Microsoft 不再纳入当前发布范围。
- 实际公开 settings HTTP 200：github=true/google=true/azure=false/email=true/disable_signup=false/mailer_autoconfirm=false。实际 Web /auth/v1/authorize 两次请求均 HTTP 302，分别指向 github.com/login/oauth/authorize 与 accounts.google.com/o/oauth2/v2/auth，且 redirect_uri 等于 Supabase 固定回调。未跟随授权页面、未提交账号凭据、未建立真实用户会话。Google 测试名单及 URL 白名单依据上节控制台交接，未通过管理 API 独立读回。
- 本地全量单测295/295、隔离构建成功、浏览器模拟认证5/5（桌面/Android GitHub IPC、Web GitHub/Google、已有邮箱）。即使模拟服务宣告 Azure 启用，界面无 Microsoft 登录按钮、授权函数也在 SDK 调用前拒绝 Azure。独立 PostgreSQL 对更新后的 Hook 10 类 provider（含伪造 user_metadata）及 ACL/SECURITY INVOKER 检查通过。生产 Hook 仍未部署。
- 下一步仅真实 GitHub/Google OAuth 登录、独立账号隔离、旧邮箱登录和跨平台回调验证，确认 Google 对外发布范围后再部署注册 Hook 和候选版本。未推送、未发布、未修改生产数据库。保留此前控制台交接和历史验收证据，不读取或复制任何密钥。

## Alpha.2 候选收口（2026-11-27）
- 用户确认邮箱等配置已验证，直接进入后续任务；不再重复要求邮箱注册验证。生产只读聚合确认一个已确认邮箱账号、一个 email identity、一个工作空间、0 个异常形状；GitHub/Google 身份记录尚未观察到，注册 Hook 不存在。未读取个人邮箱或任务正文。
- 版本统一为 1.2.0-alpha.2，Android versionCode 102002；不修改已发布 Alpha.1、更新清单或正式 main。现有发布预检增加 --oauth，仅核对生产公开 settings、双官方授权入口及精确 provider callback，不跟随重定向、不创建会话、不读写任务。拒绝未启用 provider 与错误授权目标；邮箱全局 signup 开启的状态不等于 Hook 已启用或邮箱独立注册已禁用。
- 实际运行 node scripts/release-config.mjs、node scripts/verify-live.mjs --oauth 成功；全量 JS 单测296/296，隔离 Web 构建2.44s，认证与更新 E2E 6/6（模拟服务）。日志 /Volumes/data/AI-Development/artifacts/TODO/alpha2-{unit,build,e2e}.log。实际 OAuth 登录、原生系统浏览器回调及同步恢复不在这些证据范围内。
- 注册白名单函数继续待部署，保留真实 OAuth 新用户验收后启用的前置条件。无备份恢复验收或额外授权，不部署生产数据约束。没有修改生产配置/数据库，不推送或发布。停止功能扩张，下一阶段为真机与受审发布。

## Alpha.2 累计代码审查（2026-11-27）
- 基于 175af27，比较已发布基线 3ad8ee2 的32个变更文件，重点复核新增 OAuth、原生 ACL 与会话边界；未扩大业务范围。锁定的 Opener 实现使用 glob::Pattern，现有固定授权地址 scope 保留；不扩大 CSP/ACL。
- 修复授权 URL 重复关键参数、异常凭据、fragment、非43字符 S256 challenge 的接受缺口；原生尝试只允许 starting→waiting 一次，计时使用内部 deadline 剩余时间而非从打开浏览器重新计时。未改变固定 redirect 或 SDK 协议。无 flow id 的实际回调仍依靠 PKCE verifier 与服务端代码绑定；已取消尝试的旧回调若到达另一次活动授权，可能导致该次授权失败并需重试，不声称可完全消除自定义 scheme 的干扰。关闭设置可取消尚未交换的授权；已经发出的交换请求不保证可撤销。
- 定向 Node 7/7，隔离构建2.46s，Playwright 7/7（49.5s）：Web 双 OAuth 与邮箱、桌面和 Android 模拟 IPC 取消/关闭后拒绝旧回调并重新授权、SQLite 迁移/保存失败重试/恢复、模拟双设备离线合并/CAS/冲突保护。证据 alpha2-audit-{build,e2e}.log。实际历史 RC1 6b78c9b3e8190cef230dd249b9571781b7d0c57d 源码兼容脚本四项通过；非安装包覆盖升级证据。之前296项全量结果保留，本次不重复无关单测。无新增依赖。
- 未访问正式用户工作空间，未改变生产数据库、注册 Hook、签名配置、已发布版本或更新清单。不推送、不合并、不发布；真实 OAuth 会话、系统回调、生产同步和同签名覆盖升级仍为门禁。
