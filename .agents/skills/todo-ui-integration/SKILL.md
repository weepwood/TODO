---
name: todo-ui-integration
description: 当新增 TODO 页面、对话框、控件或交互时使用，优先复用既有组件和 UI-Vault 交互契约。
---
# TODO UI 集成
- 读 DESIGN.md 当前规范、docs/design-system.md、docs/ui-component-audit.md、docs/OPEN-SOURCE.md。现有 src/ui.jsx Modal/Menu/Field/ActionButton、SmartSelect/SearchSelect、DateTimeControl、TaskViewMenu 优先。
- Radix 负责焦点、键盘和浮层；dnd-kit 负责拖拽，FullCalendar 负责日历，Tiptap/Markdown 负责编辑。不要另造基础控件。
- 参照 UI-Vault component-handoff Skill 和 Foundation Registry 的原语契约；先核对许可证、版本、Token 映射与宿主依赖。已有等价原语时不复制适配器，不导入全套样式。
- 新能力须有真实入口、可取消、明确空态和操作反馈；默认遵循现有语义 CSS、浅深主题与窄屏布局，整体视觉精修留待产品稳定。
- 必要浏览器冒烟使用隔离4178合成数据，保持4197；不要为了简单功能新增整套测试框架。
