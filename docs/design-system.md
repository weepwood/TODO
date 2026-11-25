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
