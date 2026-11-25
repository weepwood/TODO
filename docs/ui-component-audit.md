# 公共组件一致性审计

基线：main 572e7c8；日期组件专项工作树。统计是 JSX 源码调用点数量，不是运行时实例数量。源码审计不能代替真实双主题截图和交互验收。

## 已统一
- DatePicker / DateControl：独立 components/DatePicker.jsx，5 个 DatePicker 调用点（包括 DateControl 内部）、2 个 DateControl 调用点；仅一个 DayPicker 实现。计划日期、重复截止、批量日期、日历和规划、独立及附加提醒共用。
- TimeControl：6 个调用点；ColorControl：1 个调用点；SmartSelect：31 个调用点，未发现原生 select 标签。
- NumberField：6 个调用点；已统一时长、积分、周期和专注设置的一部分。
- Dialog/DropdownMenu：ui.jsx 中 Modal、Menu 复用 Radix；ActionButton 已有公共封装。

## 待统一（按收益与风险）
| 优先级 | 项目 | 已发现源码 | 建议 |
|---|---|---|---|
| P0 | 数字输入 | main.jsx 批量任务积分；points-rewards.jsx 积分目标、奖励所需积分 | 复用数值步进外观与校验；为允许临时空值且表单提交才生效的草稿提供独立模式，不直接套用即时提交 NumberField |
| P0 | 搜索字段 | main.jsx 全局任务搜索；command-palette.jsx 命令搜索；calendar.jsx 日历任务搜索；views.jsx 规划待安排搜索；points-stats.jsx 积分搜索 | 共享输入框、图标、清空与焦点样式；命令面板保留 ARIA combobox 和键盘选项，不能机械替换 |
| P1 | 分段选择 | calendar.jsx 任务范围；views.jsx 看板、规划、专注；task-fields.jsx 重复星期；command-palette.jsx 范围 | 共享单选分段/多选分段的样式与选中语义；星期多选不是普通单选；保留不同方向和无障碍 |
| P1 | 复选框、开关、单选 | points-rewards.jsx 两处奖励筛选；main.jsx 检查清单；views.jsx 自动继续；task-fields.jsx 系列修改；services/updates/UpdatePanel.jsx 自动更新；sync-ui.jsx 冲突单选 | 共享视觉令牌和原生语义。Markdown 只读 checkbox 保留禁用行为；同步冲突 radio 不改为 checkbox |
| P1 | 弹层基础 | components/DatePicker.jsx、TimeControl.jsx、DateTimeControl.jsx、ColorControl.jsx 各自 Radix Popover.Root | 共用层级、碰撞边距、焦点、动效及关闭规则；嵌套弹层需验证 Escape/Android Back，不应误关闭整个草稿 |
| P1 | 表单、按钮及空状态 | ui.jsx Field、ActionButton、Empty 与各页面直接 className 按钮/空状态共存 | 按功能统一标签对齐、错误、帮助、disabled/loading 和空状态布局；不强迫语义不同的控件共享所有 DOM |
| P2 | 历史样式 | workbench.css、product-ui.css、refined-ui.css、selection-detail.css、business-design.css 等 | 按组件归属逐步迁移，使用同规格双主题和宽窄截图做前后比对，避免大规模盲删 |
| P2 | 专注与习惯、图表 | views.jsx、points-stats.jsx | 迁移现有空间与动效令牌，保留计时、图表比例、积分及打卡业务逻辑 |

全站源代码扫描：4 处原生 number 标签（含 NumberField 内部 1 处），7 处 checkbox（含只读 Markdown 1 处），1 处 radio。原生标签本身不是缺陷；目标是共享视觉和交互契约，不是全部改成 div。

## V1.2 设计系统收敛增量
PR #20合并后：原全局侧栏搜索已移除；命令、日历、规划、积分四处搜索使用SearchField，三处业务数字表单迁移DraftNumberField并与NumberField共用NumberControl；命令/日历/看板/规划/专注/重复星期使用Segmented；业务复选和冲突单选复用原生封装；外观开关复用Switch；详情图标使用共享属性组件。日期、时间、提醒、颜色及普通/右键/排序菜单、SmartSelect统一使用可取消弹层关闭事件。详见design-system.md。剩余：全量CSS所有权、表单错误帮助契约、图标其他业务调用点、分组折叠/滚动恢复和原生Back实际设备验证；完整CI待验收，不将源码迁移等同于全面视觉完成。

## 第二轮实际治理
已收敛公共搜索、数字、时间的基础结构到design-system/controls.css；清理11个历史样式文件55条规则，收窄通用Field选择器以避免组合控件宽度冲突。新增CSS所有权单测。统一Field/FieldMessage反馈契约并迁移高频分类及积分表单、行内编辑、日期/颜色/提醒；展厅展示真实状态及浅深主题，分组折叠、滚动及模块面板独立持久化。仍保留必要的页面上下文规则，不宣称所有CSS及表单已完全迁移。
