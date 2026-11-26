# TODO 开源资产与采用决策（2026-11-26）

直接依赖实际锁定版本与本机包声明如下（并非完整传递依赖许可审计；采用新资产须核对许可证原文）。源码复用保留原许可。

| 包 | 锁定版本 | 本地许可声明 | 本地许可文件 | 决策 |
|---|---|---|---|---|
| @dnd-kit/core | 6.3.1 | MIT | LICENSE | 现有依赖；保留 |
| @dnd-kit/sortable | 10.0.0 | MIT | LICENSE | 现有依赖；保留 |
| @dnd-kit/utilities | 3.2.2 | MIT | LICENSE | 现有依赖；保留 |
| @fullcalendar/react | 7.1.5 | MIT | LICENSE.md | 现有依赖；保留 |
| @radix-ui/react-context-menu | 2.4.1 | MIT | LICENSE | 现有依赖；保留 |
| @radix-ui/react-dialog | 1.3.1 | MIT | LICENSE | 现有依赖；保留 |
| @radix-ui/react-dropdown-menu | 2.2.1 | MIT | LICENSE | 现有依赖；保留 |
| @radix-ui/react-popover | 1.3.1 | MIT | LICENSE | 现有依赖；保留 |
| @radix-ui/react-select | 2.2.6 | MIT | LICENSE | 现有依赖；保留 |
| @supabase/supabase-js | 2.119.2 | MIT | LICENSE | 现有依赖；保留 |
| @tanstack/react-virtual | 3.14.28 | MIT | LICENSE | 现有依赖；保留 |
| @tauri-apps/api | 2.12.5 | Apache-2.0 OR MIT | 未发现 | 现有依赖；保留 |
| @tauri-apps/plugin-process | 2.4.0 | MIT OR Apache-2.0 | LICENSE.spdx | 现有依赖；保留 |
| @tauri-apps/plugin-updater | 2.14.1 | MIT OR Apache-2.0 | LICENSE.spdx | 现有依赖；保留 |
| @tiptap/extension-table | 3.35.0 | MIT | LICENSE.md | 现有依赖；保留 |
| @tiptap/extension-task-item | 3.35.0 | MIT | LICENSE.md | 现有依赖；保留 |
| @tiptap/extension-task-list | 3.35.0 | MIT | LICENSE.md | 现有依赖；保留 |
| @tiptap/markdown | 3.35.0 | MIT | LICENSE.md | 现有依赖；保留 |
| @tiptap/react | 3.35.0 | MIT | LICENSE.md | 现有依赖；保留 |
| @tiptap/starter-kit | 3.35.0 | MIT | LICENSE.md | 现有依赖；保留 |
| @uiw/react-md-editor | 4.2.4 | MIT | 未发现 | 现有依赖；保留 |
| date-fns | 4.4.0 | MIT | LICENSE.md | 现有依赖；保留 |
| ical.js | 2.2.1 | MPL-2.0 | LICENSE | 现有依赖；保留 |
| lucide-react | 0.468.0 | ISC | LICENSE | 现有依赖；保留 |
| react | 19.3.1 | MIT | LICENSE | 现有依赖；保留 |
| react-day-picker | 10.0.2 | MIT | LICENSE | 现有依赖；保留 |
| react-dom | 19.3.1 | MIT | LICENSE | 现有依赖；保留 |
| react-markdown | 10.1.0 | MIT | license | 现有依赖；保留 |
| remark-gfm | 4.0.1 | MIT | license | 现有依赖；保留 |
| temporal-polyfill | 1.0.8 | MIT | LICENSE | 现有依赖；保留 |

## 采用决策

- 本次高级筛选：复用 src/smart-ui.jsx、src/core/smart-lists.js、Radix Dialog/Select、现有导航；不引入 cmdk、搜索库或新模型。
- UI-Vault 本地 a0def2b：阅读 skills/ui-vault-component-handoff/SKILL.md、docs/REUSE-REGISTRY.md、Foundation adapters/react/PRIMITIVES.md 及 UiPrimitives.jsx；其原创 MIT 原语交付采用 Radix。TODO 已有独立 Radix 包，沿用现有 Modal/SmartSelect，参考契约不复制源码、不引入 radix-ui 聚合包或 Foundation CSS。
- Super Productivity（MIT）：https://github.com/super-productivity/super-productivity/blob/master/LICENSE ，参考时间追踪、规划；未采用代码/固定版本。
- Vikunja（主体 AGPL-3.0-or-later）：https://github.com/go-vikunja/vikunja/blob/main/LICENSE ，仅参考产品范式；直接复用前审查许可。
- 候选 shadcn/ui、cmdk、TanStack Table、Recharts、rrule、Motion：按实际缺口选择，未采用版本、许可需逐项核验，不安装。
- 本机公共索引：/Volumes/data/AI-Development/reuse/OPEN-SOURCE.md。不可用时依本文件及官方上游。

- AI 接入独立工具包：官方 @modelcontextprotocol/sdk 1.32.2 (MIT，v1维护线)、zod 4.6.7 (MIT)，仅测试 pg 8.23.1 (MIT)；本地 LICENSE 已检查，独立锁文件，不加入前端依赖。参考 Todoist API 幂等及 Supabase Edge Functions 认证；未复制第三方产品代码。

- 本地CLI复用现有Rust/SQLite/Tauri，原Cargo.lock已有sha2 0.10.9和uuid 1.29.3，本次声明为直接依赖（请求摘要/UUID），未新增锁定包或前端依赖。官方MCP SDK沿用既有版本。
