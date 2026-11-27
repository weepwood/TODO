# TODO 当前开发规范

唯一活跃任务池：[docs/ACTIVE.md](docs/ACTIVE.md)。历史路线、报告和旧阶段命令不是当前任务。旧 AGENTS 全文原样保存于 [开发历史 3d47350](docs/archive/development-history-3d47350.md)，阶段证据仍见 [交接报告](docs/v15-development-handoff.md)。

## 产品与工程边界
- 简洁实用的个人任务管理工具：记录、组织、安排、执行、完成、回顾。优先改善现有流程；无明确需求或实际缺陷，不增加业务层级、配置、依赖、协议、服务或页面。
- 保留现有功能和数据，低频能力渐进呈现，不擅自删除或破坏可发现性；复杂目标、自动化编排、独立知识库、Agent 平台、通用优化引擎暂停扩张。
- 默认一个正式实现。Web 现有稳定存储、原生 SQLite 原子快照、Supabase CAS/RLS 与既有冲突保护不变；R1–R6、Web 分片试验冻结，禁止真实迁移。CLI First、MCP Optional、Cloud Optional；不恢复 AI/CLI 远程 OAuth 扩张；产品账号 OAuth 专项按当前任务池实施。
- 云端隐私复用 Supabase Auth、RLS、HTTPS 和平台静态加密；不是 E2EE。暂不开发自研密码学、密钥服务器、额外认证/同步服务、通用后端适配器或自托管平台。保留现有环境变量配置、SQL 迁移及可恢复备份。
- 遵循 DESIGN.md 与 docs/FEATURES.md；按需读 docs/OPEN-SOURCE.md 和 .agents/skills/todo-development、todo-domain-rules、todo-ui-integration。全局复用入口 /Volumes/data/AI-Development/reuse/README.md。优先原有 Radix、dnd-kit、FullCalendar 与领域代码；不机械拆分或另造框架。
- 计划日期、截止、提醒、重复实例、积分、专注、历史及锁定语义独立；编辑复用共享事务与撤销。保留作用域、旧字段、原值检查、冲突备份、明确恢复与失败不覆盖。不得以性能为由减少完整校验。
- 不读取或修改正式个人数据，不自动登录/绑定 CLI，不使用正式凭据做试验，不将 secret/service_role、密码、令牌写入仓库，不扩大云权限或费用。

## 本地操作与验收
- 当前登录与可迁移性专项使用 feat/social-auth-web（social-auth-web 独立工作树），产品已发布基线见 origin/main；保持正式 main、AI 候选、研究分支及未提交内容；保留 4197 正常预览和 4318 独立 QA，不停止其他任务或覆盖共享构建目录。
- 使用合成数据与隔离浏览器 origin；默认 4178 空闲时定向冒烟，不读取既有用户浏览器 profile。Node 20+；按风险使用 node --test、npm run build、定向 Playwright；涉及数据、同步、权限、恢复时执行对应必要专项。完整 RC/跨平台验收仅在发布授权或实际故障需要时进行，未运行不声称通过。
- 本机资源监测，不人为扩大并行负载。保护原始实验 DB、日志和失败证据。无证据不反复重跑已通过测试，不为了继续开发而制造任务。
- 中文本地 Git commit；本次不推送、不合并、不发布、不安装、不变更正式数据。历史 PR 与已安装候选不动。更新 ACTIVE 与必要交接记录，不在 AGENTS 追加流水账。
