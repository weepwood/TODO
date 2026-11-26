# TODO 外部 AI 接入（第二批，本地候选）
本批仅新增任务录入能力，不建 AI 聊天页、模型服务、任务读取/编辑/删除 API 或 Agent 平台。正式 Supabase 未修改，4197/普通构建默认关闭接入 UI。

## 架构与状态
REST 和 MCP stdio 共用 integrations/ai/gateway.mjs；严格结构化校验 src/core/external-capture.js 复用 taskFromCapture、appendCapture、recordTaskChanges 和云端容量规则。区别于客户端领取队列，本批服务端用 PostgreSQL 事务原子追加 tasks、递增工作空间 revision、同时写回执；正常云同步负责拉取。避免跨设备重复领取，自动授权时客户端不必在线。既有账号自动化仅本机规则，不在服务端擅自执行；云端接入不进入本机撤销栈。用户仍可使用现有任务管理功能。使用现有同步冲突保护；旧客户端是否可安全接受新增任务及所有平台尚需真实验收。
- received：已持久接收，未写入任务；手动确认或自动模式同键重试。
- saved：云端事务已提交；task_ids/revision 是回执，不代表每台设备已同步。
- rejected：拒绝，不创建；同键重试仍返回原状态。
- 相同令牌+Idempotency-Key+归一化内容只产生一个请求；不同内容409。不同令牌拥有独立命名空间。每个新请求最多50项、256 KiB；每令牌待处理100项、新请求60/分钟。绝对日期/本地墙钟时间，不按服务器时区猜测日期；标题必填，notes、listId（默认inbox）、date、time（须有date）、deadline、duration、priority、reminderAt 可选。缺省日期/提醒不设，时长30，优先级0；云端不读取客户端私有默认设置。无效字段/未知清单不得部分写入。

## REST 契约
基础 URL 为部署后 https://<project-ref>.supabase.co/functions/v1/todo-external；以下为待部署示例。外部请求 Bearer 专用令牌，可附项目 publishable apikey（不是 service role）。无 GET 任务/清单接口。
| 方法及路径 | 功能 |
|---|---|
| POST /v1/tasks | 单条 JSON 对象 |
| POST /v1/tasks/batch | JSON 数组，1–50项 |
| GET /v1/requests/:id | 同令牌请求回执 |
| GET/POST /v1/owner/tokens | 已认证账号查看/签发令牌 |
| POST /v1/owner/tokens/:id/revoke | 撤销 |
| GET /v1/owner/requests | 最早50项待确认 |
| POST /v1/owner/requests/:id/approve 或 reject | 账号审批/拒绝 |

示例（仅在明确授权的测试或已部署环境运行；变量从安全凭据管理器注入，不粘贴真实令牌到对话或 Git）：
```sh
curl --fail-with-body "$TODO_API_URL/v1/tasks" \
  -H "Authorization: Bearer $TODO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: planning-20261201-01" \
  --data '{"title":"整理开发计划","date":"2026-12-01","priority":2}'
```
若平台要求 apikey，额外传项目公开 key；不得传管理密钥。HTTP202 表示接收未保存；200 还需检查 status（可能 rejected）。401 无效凭据；404 不属于该令牌/账号；409 幂等冲突或工作空间变化；429 接入限额。任何网络中断重试须复用原 key，不能换 key 盲目重发。自动模式在没有初始化云工作空间、目标清单失效或容量不足时保留 received，待账号处理。

## 界面与安全
启用构建变量 VITE_TODO_EXTERNAL_API=1 后，登录账号的设置→账号与同步→外部任务接入。默认手动确认，独立令牌可授权自动新增；仅账号作用域、无任务读取和修改权限，未实现每清单范围细分。90天到期、可撤销、随机256位令牌，只展示一次，数据库仅 SHA-256 摘要。请求来源由签发标签和 token_id 决定，不相信输入 source。活动记录沿用 device 来源及 external:token_id 会话关联。待确认请求预览任务字段，确认后同步；拒绝无业务写入。原有账号/SQLite/工作空间保护保留。回执及原始结构化输入目前保留，不自动清理以保护幂等；正式部署前明确长期保留政策。服务端凭据不得进入 Vite、客户端配置或 MCP 进程。未读真实密钥。
schema.sql 是待审核迁移草案（已在独立 PostgreSQL 16 实跑），本机没有 Supabase CLI/Docker；不得直接对生产运行。上线前经独立 Supabase 项目验证 Auth、RLS、service_role grant、PostgREST RPC、Edge 打包、容量及回退。Edge Function 每条路径自行认证：owner 使用 Supabase Auth getUser(JWT)，外部令牌由专用 RPC 校验。仅服务端 service_role 可访问网关 RPC/两表，普通 authenticated/anon 无权限。部署时需要专用函数 verify_jwt=false（仅此函数，不禁用其他函数认证）；此配置未写入正式部署配置。OAuth 尚未完成，不可公开无认证 MCP。
现有同步 API 仍有其原有权限，专用令牌不等同于账号 JWT。

## MCP 本地客户端
独立 integrations/ai/package-lock.json 固定官方 @modelcontextprotocol/sdk 1.32.2 (MIT)、Zod 4.6.7 (MIT)；测试 pg 8.23.1 (MIT)。SDK v1 为维护线，选择其 stdio API 兼容现有客户端示例，未迁移 v2。独立目录不进入普通浏览器包。
```sh
cd integrations/ai
npm ci --ignore-scripts
npm test
```
此测试启动并清理临时 Unix socket PostgreSQL 实例、合成双账号及 loopback HTTP 服务，调用官方 SDK 的 Client/StdioClientTransport 执行 create_task、create_tasks、get_request_status，不使用实际云账号。不需要 AI 模型费。完整浏览器试验需要根目录既有依赖、Playwright 和 PostgreSQL 16 可执行文件：
```sh
VITE_TODO_EXTERNAL_API=1 VITE_SUPABASE_URL=https://todo-ai-qa.invalid VITE_SUPABASE_PUBLISHABLE_KEY=synthetic-qa-key npm run build
TODO_EXTERNAL_E2E=1 node node_modules/playwright/cli.js test e2e/ui-external-capture.spec.js --workers=1
npm run build
```
测试拦截远程请求、使用实际隔离PG和HTTP gateway，模拟 Supabase Auth/REST 传输；两浏览器的实际同步逻辑、本地存储回读及刷新验证，不等同真实 Supabase 设备或 Tauri/Android 验收。

Codex：用户级 config.toml 示例（替换实际路径；注入环境变量，不提交凭据）：
```toml
[mcp_servers.todo]
command = "node"
args = ["/absolute/path/TODO/integrations/ai/mcp.mjs"]
env_vars = ["TODO_API_URL", "TODO_API_TOKEN", "TODO_API_PUBLISHABLE_KEY"]
```
Claude Code：本地 .mcp.json 示例（不要把真实密钥写入文件）：
```json
{"mcpServers":{"todo":{"type":"stdio","command":"node","args":["/absolute/path/TODO/integrations/ai/mcp.mjs"],"env":{"TODO_API_URL":"${TODO_API_URL}","TODO_API_TOKEN":"${TODO_API_TOKEN}"}}}}
```
已安装依赖且有授权 API endpoint 后，从具有安全环境变量的客户端启动并请求：“创建任务：整理开发计划，日期2026-12-01；请求键 planning-20261201-01；报告 received/saved 区别，必要时查询回执。” 本机未发现 codex/claude CLI，实际模型会话未执行。已验证的是官方 MCP 协议调用，不冒充客户端已接通。

## 第二批：远程 MCP 受保护资源（已本地验证，未部署）
复用官方 SDK 1.32.2，stdio 与 Streamable HTTP 共用 mcp-tools.mjs 的三个工具及 REST 契约。remote-mcp.mjs 按请求创建无状态 transport；GET /.well-known/oauth-protected-resource/mcp 提供 RFC9728 resource metadata；缺少/无效 access token 返回401挑战。调用可信外部授权服务器的 RFC7662 introspection，核验 active、issuer、audience、expiry、nbf（如有）、subject、client_id 和 scope。按精确 subject+client_id 绑定独立 TODO 令牌，禁止同一令牌复用到多连接，不传递 OAuth token 到 TODO API。工具 scope tasks:create、receipts:read，未授权的操作返回 insufficient_scope。无任务读取、修改或删除工具；没有自行开发 OAuth 授权服务器。真实授权服务器须提供 RFC7662 所需声明、OAuth2.1 PKCE、资源/受众绑定及客户端注册，尚未选定或配置。受保护资源与外部 AS 均须正式 HTTPS；真实 ChatGPT 插件 OAuth 授权未执行。
服务使用 integrations/ai/serve-remote.mjs，只监听127.0.0.1，需经另行授权的 HTTPS 反向代理公开。反代保留 canonical Host，Origin 仅允许同源或无 Origin；不得暴露无认证端口。环境配置仅列变量名：TODO_MCP_RESOURCE（HTTPS /mcp URL）、TODO_OAUTH_ISSUER、TODO_OAUTH_INTROSPECTION（同 issuer origin）、TODO_OAUTH_INTROSPECTION_ID、TODO_OAUTH_INTROSPECTION_SECRET、TODO_MCP_BINDINGS_FILE（600权限 JSON数组，每项 sub/client_id/todo_token）、TODO_API_URL、TODO_API_PUBLISHABLE_KEY、PORT。绑定必须由账号本人明确授权签发，文件不得放入仓库。更新绑定需重启进程；撤销底层 TODO 令牌立即阻断请求，OAuth introspection 每次检查。未配置时拒绝启动。此实现是外部 AS 资源服务器适配，不等同完整 OAuth 2.1 登录/同意/PKCE/DCR 或 ChatGPT 平台接入。

## 第二批：实际 CLI 及 Edge 证据
- Mac 上发现 ChatGPT.app 内嵌 Codex CLI 0.171.0-alpha.13.2，隔离 CODEX_HOME 下 mcp list --json 已识别 todo；未登录，未运行模型。Claude Code 2.1.332 使用独立 npm 目录的原生二进制（未执行 npm postinstall），隔离 HOME/CLAUDE_CONFIG_DIR，mcp add/list 显示 Connected（真实握手），未登录、未运行模型。没有改用户现有配置。client-qa.mjs 可重复执行，环境变量 TODO_QA_CODEX_BIN/TODO_QA_CLAUDE_BIN 指向实际二进制，仅使用合成令牌与本机 PG。
- npm test 覆盖既有 stdio/REST 与新增真实 Streamable HTTP 客户端；外部 AS 为本地合成 RFC7662 HTTP 服务，两账号真实 PG 创建、错误受众/issuer/过期/未绑定/撤销及 scope 拒绝均验证。
- Deno 2.9.7 check/bundle 生成单文件部署候选；edge-runtime-qa.mjs 运行实际 bundle，用环回上游模拟 Supabase Auth/PostgREST 并执行真实 PG RPC。创建、幂等、跨账号拒绝通过。TODO_EDGE_QA_PORT 仅在上游为 127.0.0.1 时允许启用，正常 Edge 入口不变。不是正式 Supabase Edge Runtime 部署或真实 Auth。
- 连接 Supabase 项目清单已核对：仅正式 TODO 活动，无独立测试项目/开发分支；未唤醒其他项目。新项目涉及组织与费用确认，正式项目完全不修改。没有使用真实模型或账号凭据。

## 独立云测试环境（2026-11-26，已部署，正向身份验收待完成）
经用户明确确认0美元/月报价，新建独立项目 TODO-AI-QA，东京 ap-northeast-1，ref `lwwmhwefdwfuprphmybn`，PostgreSQL 17.12，ACTIVE_HEALTHY。正式 TODO ref `xepkhnatnpvopnlqnrrz` 保持不变。创建前确认独立项目空库、零用户。仅测试项目应用已有三个工作空间迁移及 schema.sql 草案；云迁移历史依次为 20261126111802 todo_workspace_sync、20261126111807 todo_task_delta、20261126111812 todo_read_task_deltas、20261126111817 todo_external_intake_qa。管理工具生成的迁移历史版本与本地原始文件名不同，正式迁移草案仍不进入默认发布链。
Deno bundle 以固定 npm:@supabase/supabase-js@2.119.2 外置依赖生成部署候选 deploy.js（53626字节），仅测试项目部署 todo-external v1 ACTIVE，verify_jwt=false（内部逐路由鉴权）。本机真实 HTTPS 访问验证：无凭据创建、无效账号JWT、无效外部令牌创建、匿名直读令牌表、匿名直调内部RPC均返回401。数据库实际查询证实三表均启用RLS，anon不能读任何表、authenticated仅可读工作空间（受owner RLS约束），内部两表及gateway RPC只授予service_role。安全顾问两项INFO为内部表有意无用户策略，不是需要向普通用户开放的缺陷。
真实测试用户尚未创建：通过 Auth Admin API 初始化合成用户的临时入口 todo-qa-bootstrap v1 曾部署至独立QA，调用被工具安全检查阻止，未绕过；立即替换为仅返回410的无业务代码 v2，verify_jwt=true。管理工具无删除入口，遗留停用函数可在QA控制台删除。数据库复核 auth.users、workspace、token、request 均为0。临时生成的凭据文件已清除，未获取正式密钥。应通过 QA 控制台 Authentication → Users → Add user → Create user 建立两个独立合成测试身份（确认邮箱选项仅用于测试，不发送真实邀请），再在独立浏览器或本机安全凭据环境验证真实Auth、RLS、任务回执与同步。不得绕过工具安全检查、临时放宽生产鉴权或把测试密码粘贴进对话。真实 Codex/Claude 模型会话、外部OAuth AS和ChatGPT插件仍未完成。未开放额外付费项目或资源；0美元/月仅为创建报价，不代表无限免费用量。
测试控制台：https://supabase.com/dashboard/project/lwwmhwefdwfuprphmybn
测试 API：https://lwwmhwefdwfuprphmybn.supabase.co/functions/v1/todo-external

## 独立真实接入验收顺序（待授权）
1. 明确独立 Supabase 测试项目及组织/费用，项目 ref 必须不同于正式 TODO 的 xepkhnatnpvopnlqnrrz；不要复用其他项目。创建后确认 ACTIVE_HEALTHY；先审查新空项目，再通过 Supabase CLI 或管理工具逐项应用既有3个工作空间迁移及 schema.sql 候选（生成正式迁移须经 CLI，当前本机无CLI/Docker）。核对 Data API grant、RLS、service_role EXECUTE、anon/authenticated 禁止内部 RPC 和 token 表访问。
2. 使用生成的 Edge 单文件候选部署独立项目的 todo-external（只该函数 verify_jwt=false，内部逐路由鉴权）；正式项目不部署。验证无凭据401、测试账号真实 Supabase Auth getUser、双账号 RLS，手动审批、自动创建、幂等及回执；先用全新合成测试账号、空工作空间。通过前不得开启真实用户数据或正式构建入口。
3. 对独立测试 URL 启用 VITE_TODO_EXTERNAL_API=1，并使用独立预览端口/浏览器配置。两个浏览器分别登录同一测试账号验证实际同步和持久化，再使用不同测试账号验证隔离。禁止修改4197的真实会话。
4. 用户在隔离 Codex/Claude 客户端完成登录或配置独立模型测试凭据，再连接专用测试令牌；要求模型实际调用单条、批量、查询三工具，核对请求回执和测试工作空间，结束后撤销令牌。不要把模型回复当持久化证据。
5. 选择可信 OAuth AS，配置独立测试资源、客户端、PKCE/同意、audience、最小 scope 和账号绑定，先验证真实 introspection，再在授权 HTTPS 环境启动远程 MCP，ChatGPT 中添加测试插件并完成真实授权，实际调用和回读。未获得远程环境、域名和账号授权时不得提供可用 URL 或宣称接通。官方插件接入还需实际客户端权限和相应 mTLS/平台要求（如适用）。

复现命令（均为隔离合成环境）：
```sh
cd integrations/ai
npm test
# TODO_QA_CODEX_BIN / TODO_QA_CLAUDE_BIN 指定已安装客户端路径
npm run test:client
cd ../..
deno check --node-modules-dir=manual supabase/functions/todo-external/index.ts
deno bundle --platform deno --packages external --node-modules-dir=manual --output /tmp/todo-edge-qa.js supabase/functions/todo-external/index.ts
TODO_QA_EDGE_BUNDLE=/tmp/todo-edge-qa.js node integrations/ai/edge-runtime-qa.mjs
```
日志：本机 artifacts/TODO/ai-stage2/ 及 ai-stage2-remote.log。部署包在 artifacts/TODO/ai-stage2/edge-bundle/index.js，非发布产物。

上游参考（2026-11-26）：
- https://developer.todoist.com/api/v1/ （幂等命令）
- https://github.com/modelcontextprotocol/typescript-sdk （官方 SDK）
- https://supabase.com/docs/guides/functions/auth （函数认证）
- https://developers.openai.com/codex/mcp
- https://code.claude.com/docs/en/mcp
- https://developers.openai.com/plugins/build/auth
