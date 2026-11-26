# TODO 外部 AI 接入（首批，本地候选）
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

## ChatGPT 远程适配（待授权，未部署）
使用同一 gateway/工具契约，添加官方 SDK Streamable HTTP server、HTTPS、OAuth 2.1 PKCE、resource metadata/discovery，验证 issuer/audience/expiry/scopes（tasks:create、receipts:read），将同意授权绑定账号与独立连接标识；服务端撤销并记录请求。不得让远程 MCP 使用一枚共享的个人令牌；ChatGPT 不支持将任意专用 API key 当 OAuth。工具声明 securitySchemes，认证挑战与 OAuth linking 对接官方插件要求。依据目标客户端实际权限接入，当前不能提供可用的 ChatGPT URL，也没有安装/发布插件。

上游参考（2026-11-26）：
- https://developer.todoist.com/api/v1/ （幂等命令）
- https://github.com/modelcontextprotocol/typescript-sdk （官方 SDK）
- https://supabase.com/docs/guides/functions/auth （函数认证）
- https://developers.openai.com/codex/mcp
- https://code.claude.com/docs/en/mcp
- https://developers.openai.com/plugins/build/auth
