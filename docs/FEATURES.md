# TODO 功能覆盖矩阵（2026-11-26）
基线 a8e4349 加本批高级筛选；依据实际源码、入口与历史交接，状态“已有”表示存在实现，不表示全部平台和边界已验收。本轮仅实际验证高级筛选。后续开发先查此表，禁止把候选或存储试验当成正式功能。

| 模块 | 已有实现与证据入口 | 产品缺口/下一步候选 |
|---|---|---|
| 任务与组织 | main.jsx、task-list.jsx、TaskDetail/TaskRow、OrganizationWorkbench、task-lifecycle；清单/分组/标签、子任务、依赖、批量、置顶/历史 | 优先检查跨清单连续组织、批量编辑重复系列的实际使用流程 |
| 搜索与智能清单 | command-palette.jsx、smart-ui.jsx、smart-lists.js、KnowledgeTools.HistorySearch；关键词、标签、保存组合查询；本批临时高级筛选、结果跳转 | 保存查询更细粒度组合与标签多选候选；不另造搜索引擎 |
| 日期与重复 | CalendarNavigation、TaskScheduleDialog、DeadlineProperty、SeriesCenter/Overview、series-control.js | 周期实例与复杂规则预览/操作入口进一步完善 |
| 日历与规划 | calendar.jsx、time-blocks.jsx、WeeklyPlanner、plan-block.js、weekly-planner.js、ElapsedDayTimeline | 多日规划完整业务流程；检查跨午夜延续编辑与工作周日历 |
| 目标 | GoalWorkspace、GoalPanel、PeriodGoals、period-goals.js | 长期目标→阶段→里程碑→任务关联完整模型及编辑工作台，先核实现有目标字段 |
| 专注与习惯 | views.jsx、FocusQueue、PomodoroPlan、focus-engine、habit-plan | 专注与习惯/目标的日常执行闭环，非新的计时引擎 |
| 自动化 | WorkflowRules、workflow-rules.js、review-schedule.js | 规则模板与操作结果可见性；真实账号自动化/后台另设边界 |
| 统计回顾 | TaskReview、ReviewInsights、ActivityHeatmap、TrendLine、stats-drill.js | 长期目标关联报告与筛选；已有统计不重做 |
| 知识与资料 | note-workbench、visual-notes、attachments-ui、KnowledgeTools、draft-directory | 项目级资料/任务关联入口；不自动写 Obsidian Vault |
| 工作空间 | WorkspaceModes、view-preferences、workspace-modes、AppearanceSettings | 命名工作模式和视图切换已存在，进一步明确独立工作区需求 |
| 同步与平台 | cloud.jsx、native.js、native-store、src-tauri、Android 插件、workspace-archive | 实体平台/账号完整验收延后；不自动真实迁移 |
| 存储试验 | WebShardPilot/WebCompatibleLegacy、web-workspace-shards | 隔离研究，不是正式功能；稳定后决定迁移 |

## 优先顺序
1. 本批临时高级筛选：已实现并实际回归（不保存即可组合筛选，20项分页，打开任务，可显式保存）。
2. 下一批优先盘点长期目标与任务关联，补齐真正缺失的操作闭环；其次规划、多日安排与项目资料。每项先验证已有实现，候选不代表需求已最终确定。
3. 稳定后再全局视觉/动效、性能、存储切换与发布验收。现有 RC 历史证据保留。
