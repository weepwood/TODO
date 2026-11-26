---
name: todo-domain-rules
description: 当修改 TODO 任务生命周期、重复系列、计划、提醒、积分、自动化、同步或恢复时使用。
---
# TODO 领域约束
- 现有模型足以解决需求时禁止另建领域层级、规则维度或配置字段；复杂目标/项目/自动化扩张暂缓，既有数据兼容与行为保留。
- 先检查 src/core/domain.js、task-lifecycle.js、series-control.js、task-schedule.js、plan-block.js、task-activity.js、workflow-rules.js 与对应测试；不要创建第二个任务模型。
- 计划日期、截止日期、提醒、预计时长、实际专注分别保留语义；重复实例、系列暂停/结束、积分与历史不得重复结算。
- 用户变更复用 useWorkspaceEdit、history.js 与已有事务；自动化不绕过锁定和历史规则。预览不等于提交；修改后必须核对原值/有效作用域。
- 智能清单复用 smart-lists.js；状态始终生效，AND/OR 组合条件，截止类本机保存；临时搜索不写数据，显式保存走 saveSmart。
- 本地/云/原生作用域隔离、旧字段与备份兼容；不读取或迁移真实数据，存储试验保持隔离；按实际风险补充必要领域测试。
