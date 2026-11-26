# TODO 功能覆盖矩阵（2026-11-26）
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


## 优先顺序
1. 保留已交付的临时高级筛选及其他现有能力，不以功能数量衡量进度。
2. 检查快速记录、组织、日期/提醒、执行、完成与回顾的实际操作；只处理真实缺口、重复入口和不必要的步骤。优先用现有组件与逻辑完成。
3. 暂缓目标多层级、里程碑、复杂自动化、新知识库、多工作区等扩展；不擅自删除已有功能。后续若确有需求再单独评估。
4. 功能及界面稳定后再集中视觉一致性、性能和发布验收。历史 RC 证据保留。
