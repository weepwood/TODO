# TODO 公共设计系统使用规范

基线：PR #20 合并提交 a297b45。保持原主题色、紧凑布局、交互与数据模型；本次迁移不表示所有历史 CSS 均已收敛。

## 设计令牌
- `src/design-system/tokens.css`：主题基础语义色、字体、4/8/12/16/24/32px空间、控件与表面圆角、阴影、36/44px控件尺寸、优先级颜色、动效时间。原 --bg/--panel/--accent 等保留兼容，外观强调色由既有主题层控制。
- `src/design-system/controls.css`：公共控件结构样式；页面只负责布局，不重写内部 DOM。
- `motion.js`：WAAPI任务重排及看板移动共同使用200ms和相同缓动；保持减少动效、尺寸变化与动画中断处理。
- 默认无障碍增强焦点关闭；鼠标避免重复描边，键盘保留可见焦点，forced-colors不覆盖。低频操作桌面Hover显示、触屏与键盘可用。

## 组件选择
| 组件 | 契约 |
|---|---|
| NumberControl | 公共步进外观，仅处理显示及事件 |
| NumberField | 即时提交；原值冲突、空值、边界与Escape保持原逻辑 |
| DraftNumberField | 表单草稿；允许暂时空值或越界，最终由表单验证；步进限制范围 |
| SearchField | 受控输入、图标、清空、可传原生ARIA与键盘事件 |
| Segmented | 单选/多选，aria-pressed；星期选择仍要求至少一天 |
| CheckInput / RadioInput / Switch | 保留原生复选和单选语义；开关使用role=switch |
| PriorityValue / ListValue / GroupValue / StatusValue | 统一属性图标、文字与语义色 |
| DatePicker / TimeControl / DateTimeControl / ColorControl | 复用既有Radix和DayPicker，不更改时间校验与提醒最终应用语义 |
| useTransientPopover | 共用可取消的关闭事件，最后打开的弹层优先关闭；实际Android返回键待原生验收 |
| Modal / Field / Menu / ContextMenu / Empty / ActionButton | 保留现有公共基础；后续在实际使用中收敛表单标签、帮助和错误布局 |

设置 → 组件展厅：实时使用真实控件演示，状态仅存在组件内部，不写入任务、云同步或备份。展厅不复制控件外观。避免为每个页面增加独立的控件实现。

## 应用职责
TaskRow、TaskDetail、EntityDialog、WorkspaceSidebar、WorkspaceSettings已从main拆出。状态协调仍在App，按风险继续提取，不机械拆分。视图偏好使用按账号隔离的浏览器存储，独立于任务数据：每个视图保存排序、分组方式、升降序，另外保存清单栏可见性及文件夹折叠状态。标准/专注/宽详情预设复用现有面板宽度约束。最多300个视图偏好，不同步到云端。分组折叠、模块独立宽度与滚动位置恢复仍待深化。

## 验收
- 原有八模块桌面双主题测试 v118.spec.js。
- 新增320/390px双主题八模块矩阵，截图共32张；以真实运行结果核对溢出和视觉。
- 新增展厅、表单草稿、嵌套弹层、视图偏好及布局预设专项。
- 按RELEASE.md执行风险分级，不触发安装包工作流。

## 第二轮：组件所有权与状态恢复
- 公共数字/时间/搜索结构由 controls.css 唯一定义；历史11个CSS文件规则数1210→1155，去除55条（不代表整个CSS已无重复）。页面仅定义尺寸分配、表面等上下文；workbench.css 的通用表单选择器只作用于直接输入，避免限制组合控件内部flex输入。tests/design-ownership.test.js 防止已收口的旧结构规则回流。
- Field 支持 help/error/success/required。带反馈的Field采用独立label、controlId、aria-describedby、aria-invalid，避免把多按钮组合控件包在label里；FieldMessage统一语义颜色与图标。已迁移分类名称、奖励名称/积分、积分目标、行内标题、日期/提醒/颜色反馈，时间无效仍即时回退，提供关联说明及边框；其他业务表单逐步迁移。数据校验和提交规则保持原样。
- 清单分组折叠按视图和分组维度保存，最大300项；隐藏项不参与全选、范围选择、批量修改、键盘导航及SortableContext。搜索不折叠结果；命令选中折叠组任务可展开。每个业务模块独立记录面板宽度（兼容旧tasks宽度字段），外层工作区与虚拟列表分别记录滚动位置，按视图/分组/紧凑布局隔离，用户滚动优先，不保存搜索内容。未改变任务业务数据、云同步或原生数据库。
- 展厅补齐按钮/加载/禁用/复选/单选/开关/多选/属性图标/实际表单反馈/菜单/弹窗/空状态、主题令牌色板和重置；继承应用主题，所有演示仅本地组件状态。当前不实现独立主题门户。

### 反馈状态与所有权补充
- 历史 label 后代输入选择器同样必须限制为直接子元素，防止组合控件内部输入被最大宽度约束。所有权单测覆盖这类选择器。
- FieldMessage/FeedbackField 的 announce=false 仅用于固定展厅示例等非实时反馈；实际验证错误保持 alert。快捷键冲突关联录制控件，链接错误关联地址输入，修改地址清除过期错误。外观保存异常复用同一消息组件。

## 第三轮：弹层与尺寸规范
- 公共弹层表面、入场180ms及退场120ms由controls.css拥有，使用tokens.css的颜色/边框/阴影/动效/层级令牌，保留各弹层类型的尺寸和定位差异；减少动效时禁用动画。详情关闭定时器使用motion.exit=140ms，对应CSS令牌。
- 桌面密度32/36/40px、控件文字11/12/14px、数字12/14/16px，保留移动端原44/50px触控尺寸。展厅可局部选择跟随应用/三种密度/三种字号，重置回跟随应用。局部预览只作用于展厅内联控件；挂载于门户的弹层仍跟随应用全局外观。
- SmartSelect、DatePicker、DateControl、TimeControl、DateTimeControl、ColorControl接入useFieldControl。嵌套编辑器通过FieldControlBoundary隔离外部ID及描述，保持实际错误与本地输入反馈；重复截止日期使用统一帮助说明。
- 新增真实浏览器展厅尺寸、偏好隔离、嵌套ID、ARIA说明、移动触控测试，新增弹层所有权单测。最终浏览器验收仍待CI；不将代码和单测视为视觉实测。
