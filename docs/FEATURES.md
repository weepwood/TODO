# TODO 功能覆盖矩阵（2026-11-26）

## AI 实际使用集成候选（2026-11-26，本分支最新）
基于056d798，核对3d47350五个规划领域模块及测试逐文件一致，独立候选feat/ai-use-candidate仅补入未集成的4个UI文件及7个浏览器测试文件，不合并原分支。未新增业务操作。独立Mac候选com.weepwood.todo.qa.aiuse，定向38/38、Rust16/16、浏览器26/26、真实原生6/6；实际Codex会话通过QA限定包装器读取共享Skill、自主创建1项任务及context，日回顾并发触发单队列保护。共享Skill补充串行/原UUID重试；ChatGPT RDC按原UUID恢复review并实际执行任务查询、批量预览/提交及规划预览，最终12个合成任务、44份saved、5份预期cancelled、SQLite integrity ok。Claude Code登录正常但真实会话100秒超时、无调用回执，不认定通过；未修改登录配置、未新增付费资源，既有模型额度可能消耗。全局CLI v3契约及QA doctor通过，正式应用未替换、正式数据库/账号/同步未操作；不推送合并发布。详见第五十三节与docs/ai-integration/actual-use-closure.md。


## AI 任务管理深化 v3（2026-11-26，本分支最新）
基于 CLI d528ccf，精确复用规划3d47350五个领域核心模块及测试（未合并原分支或搬入其UI变更）。增加10项管理操作，累计30项：context/plan-preview/plan-explain/reflow-preview/changes-preview/split-preview/preview-apply/changes-undo/audit/review。仅明确高级授权；真实同工作空间预览回执引用、15分钟有效期、用户确认、完整工作空间指纹和重算、截止/冲突/自动化效果保护；安全字段逆操作，不支持任意撤销或删除。7天v3回执逻辑过期，后续提交清理正文、保留去重墓碑；旧v2保持。详见 docs/ai-integration/cli-management.md、cli-schema.json。真实独立Mac原生6组、11项合成任务/41份saved/5份cancelled、Rust16/16、领域38/38、浏览器6/6、云协议3/3。用户级CLI与共享Skill已更新，正式应用未替换，模型与正式同步待验收。不增加付费资源、不推送合并发布。详见第五十二节。


## CLI 业务完整化（2026-11-26，本分支最新）
原生 CLI v2 20项结构化操作：丰富录入、重复/多提醒/多段、查询/日历、生命周期、分类、习惯/专注/回顾；统一领域层、版本令牌、事务回执、原历史及同步路径。旧录入保持兼容，绑定默认仅录入，高级权限由用户在原设置明确启用。不得擅自绑定/读取正式数据/授权；CLI 不直接写工作空间，不开放删除、任意撤销、账户或自动排程。见 docs/ai-integration/cli-business.md 与 cli-schema.json。隔离原生验收通过，CLI/共享Skill已升级，正式桌面应用未替换。并行规划专项保留在原工作树；本批从2a9c41e独立 feat/cli-business，不合并。

基线 a8e4349 加本批高级筛选；依据实际源码、入口与历史交接，状态“已有”表示存在实现，不表示全部平台和边界已验收。本轮仅实际验证高级筛选。后续开发先查此表，禁止把候选或存储试验当成正式功能。

| 模块 | 已有实现与证据入口 | 当前克制方向 |
|---|---|---|
| 任务与组织 | main.jsx、task-list.jsx、TaskDetail/TaskRow、OrganizationWorkbench、task-lifecycle；清单/分组/标签、子任务、依赖、批量、置顶/历史 | 检查日常新建、移动、完成与撤销是否顺畅；不扩展组织层级 |
| 搜索与智能清单 | command-palette.jsx、smart-ui.jsx、smart-lists.js、KnowledgeTools.HistorySearch；关键词、标签、保存组合查询；本批临时高级筛选、结果跳转 | 现有高级筛选保留；减少重复入口，不增加规则维度或搜索引擎 |
| 日期与重复 | CalendarNavigation、TaskScheduleDialog、DeadlineProperty、SeriesCenter/Overview、series-control.js | 改善已有日期、提醒、重复设置的可理解性与操作步骤 |
| 日历与规划 | calendar.jsx、time-blocks.jsx、WeeklyPlanner、plan-block.js、weekly-planner.js、ElapsedDayTimeline | 优先保证日/周/月及已有规划操作；不建立复杂排程体系 |
| 目标 | GoalWorkspace、GoalPanel、PeriodGoals、period-goals.js | 保持已有目标功能；暂缓多层目标、里程碑及新的关联模型 |
| 专注与习惯 | views.jsx、FocusQueue、PomodoroPlan、focus-engine、habit-plan | 保持专注、习惯的基本操作闭环；不增加计时模式和配置 |
| 自动化 | WorkflowRules、workflow-rules.js、review-schedule.js | 保留已有规则；优先简化编辑和结果反馈，不扩展编排 |
| 统计回顾 | TaskReview、ReviewInsights、ActivityHeatmap、TrendLine、stats-drill.js | 保留已有统计和回顾；不扩展指标、报表平台或复杂分析 |
| 知识与资料 | note-workbench、visual-notes、attachments-ui、KnowledgeTools、draft-directory | 保留笔记、附件和已有知识关联；不扩展为独立知识库 |
| 工作空间 | WorkspaceModes、view-preferences、workspace-modes、AppearanceSettings | 保持已有视图及工作模式；减少配置负担，不引入多工作区模型 |
| 同步与平台 | cloud.jsx、native.js、native-store、src-tauri、Android 插件、workspace-archive | 保持现有同步与平台能力，修复实际问题；完整验收延后 |
| 存储试验 | WebShardPilot/WebCompatibleLegacy、web-workspace-shards | 保持隔离研究，暂不转为正式产品功能或真实迁移 |


## 产品体验第一批
基于6d73408：八主模块在1440/390px浏览器实际打开，整页无水平溢出、无记录页面异常。今日入口4→3（两个自动化动作保留在菜单），空清单/标签创建可发现；桌面录入恢复焦点及撤销重做通过；详情属性顺序及折叠摘要改善；联动日历去掉重复今天入口、月周日仍可用；移动规划布局及统计跳转修复，习惯输入语义明确。搜索、智能清单、看板、四象限、专注、设置保持功能，定向验证覆盖其中实际使用场景，并非各平台全量验收。后续优先真实问题反馈，不增加功能范围。

## AI 接入首批
外部录入契约、REST 网关、账号专用令牌及撤销、审批/自动创建、原子回执与 MCP stdio 已在本地候选实现；真实隔离 PostgreSQL 与双浏览器（Auth/REST模拟）通过。默认关闭 UI，正式 Supabase、真实 AI 客户端与远程 OAuth 未部署/未验收。现有任务模型不扩张，后续先完成授权测试环境及真实接入，不主动扩展模型服务或 Agent 平台。

## AI 接入第二批
远程受保护资源适配、真实HTTP MCP/隔离PG与Deno单文件入口已验证，Codex CLI配置和Claude Code连接检查已验证；真实模型会话、独立Supabase/Auth/部署、外部OAuth授权服务器和ChatGPT插件连接未完成，继续仅授权测试环境联调。产品功能范围不变。

## AI 独立云测试环境
TODO-AI-QA 已建、四份迁移及真实Edge Function已部署、数据库RLS/权限与未授权HTTPS检查通过。真实合成测试用户尚未建立，实际正向Auth、任务创建及双浏览器同步、模型会话和ChatGPT授权仍待验收。普通构建及正式云环境不改变。

## AI真实身份准备
QA已有2名确认邮箱的独立用户，独立4318预览与实际登录控件、无凭据预检通过。真实正向Auth/任务回执/双浏览器/MCP联调脚本已准备，待本机输入测试凭据；模型与ChatGPT OAuth尚未验收。

## AI真实云账号验收
独立Supabase真实Auth、RLS、Edge接收/审批、MCP stdio到云端、双浏览器持久化及刷新已通过，实际4项任务/3份saved回执/3令牌已撤销。真实AI模型会话及ChatGPT OAuth尚未完成，不作为正式版本发布结论。

## 本地 AI CLI
原生CLI单条/批量、显式绑定、持久化回执、旧队列兼容、全局Skill和可选本地MCP已在隔离macOS真实应用验证。6项实际任务、4份回执；用户级命令已安装，正式桌面应用未替换，真实账号/模型会话未验收。云端接口保留，远程OAuth暂缓。

## 本地 CLI 安装候选
macOS arm64 1.2.0-alpha.1 已安装至用户Applications且未启动，旧版备份校验通过。正式原生数据库未发现，真实工作空间尚未绑定；候选CLI对隔离QA回执查询及Codex/Claude登录状态检查通过。真实模型自主调用/正式同步待用户首次启动后验收。

## 优先顺序
1. 保留已交付的临时高级筛选及其他现有能力，不以功能数量衡量进度。
2. 检查快速记录、组织、日期/提醒、执行、完成与回顾的实际操作；只处理真实缺口、重复入口和不必要的步骤。优先用现有组件与逻辑完成。
3. 暂缓目标多层级、里程碑、复杂自动化、新知识库、多工作区等扩展；不擅自删除已有功能。后续若确有需求再单独评估。
4. 功能及界面稳定后再集中视觉一致性、性能和发布验收。历史 RC 证据保留。
