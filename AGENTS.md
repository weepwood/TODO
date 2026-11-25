# TODO 开发交接

## 产品与开发约定

参考滴答清单与 Things 3 的个人任务管理工作台。早期快速迭代，普通改动允许直接提交 main，不强制 PR、Release 或 CI/CD，不绕过分支保护。关联功能集中完成，中文 Git commit，保留必要本地测试与构建。优先复用成熟组件。

## V0.2.0 架构

- React/Vite、JavaScript/JSX、Lucide；Radix Dialog/Dropdown/ContextMenu；dnd-kit 任务排序；FullCalendar 标准日/周/月视图，动态加载。
- src/domain.js：v1→v2 迁移、任务生命周期、重复计算、提醒查询、计时、排序与持久化。
- src/main.jsx：工作台、任务清单、分类、编辑、批量操作、命令面板、数据恢复；src/ui.jsx：公共浮层；src/views.jsx：看板、四象限、规划、专注、习惯、统计；src/calendar.jsx：日历。
- 本地存储键保留 todo-workbench-v1，内部 schema version 2。按本地日历日期调度；月末保留锚点；完成后按天重复；自定义间隔与重置时间；系列实例独立记录。
- 回收站采用 deletedAt，历史系列避免破坏性撤销。历史恢复为非重复待办，仅允许没有活跃后续实例的记录。跳过过期只记录已有实例，不补齐所有漏期。
- 提醒以本地 datetime-local 独立于计划时间，页面运行时轮询，通知记录持久化。浏览器休眠或关闭无法保证实时通知；尚无 Tauri、SQLite、原生后台调度。
- 自动备份在首次有旧数据的写入及随后至少每小时一次变更时保存前一份数据；另有手动备份、JSON 导入确认、原始数据导出。解析失败停止自动覆盖。仍依赖浏览器容量与存储生命周期，非事务数据库。
- 任务模板复用标题、备注、优先级、标签、检查项；不自动复用原日期/重复规则/提醒，避免误生成历史任务。

## 验证命令

Node.js 20+，npm ci；npm test；npm run build；npm run test:e2e（默认本机 Edge，可通过 TODO_BROWSER_CHANNEL 切换已安装的浏览器）。无需 CI。浏览器冒烟检查不是完整跨平台/视觉验收。

## 后续重点

1. 数据可靠性：更严格导入字段与约束、恢复冲突、跨标签页并发保护，迁移 SQLite。
2. UI 深化：自定义日期弹层、快捷键焦点路径、多选范围、空分组拖拽、日历时间块调整、真实截图对比和不同屏幕。
3. 周期引擎：工作日、指定星期、终止条件、多提醒、时区/DST、系列编辑、完整可撤销历史。
4. 专注/习惯：更多目标、提醒、统计区间、时间冲突提示。
5. 原生桌面迁移、系统通知、全局快捷键、同步服务。

## V0.3.0 Supabase 在线同步（2026-11-25）

- 独立项目 TODO，东京 ap-northeast-1，项目 ref xepkhnatnpvopnlqnrrz。组织 Free，新建项目报价 $0/月；未升级套餐。项目空闲可能被暂停。
- src/cloud-config.js 仅含公开 URL、Publishable Key；可用 VITE_SUPABASE_URL 与 VITE_SUPABASE_PUBLISHABLE_KEY 覆盖。严禁将 secret/service_role、数据库密码或用户令牌写入仓库。
- src/cloud.jsx 实现 Auth 注册/登录/会话恢复/退出、同步状态与冲突处理；src/cloud-core.js 实现按账号缓存隔离、稳定序列化与 SHA-256、同步决策。原访客存储键不变，登录不会自动上传访客数据。用户可从设置显式导入访客数据（确认替换当前账号空间）。
- 云端表 public.todo_workspaces：每个 Auth 用户一行，JSONB 保存完整 V2 工作空间、revision 乐观并发版本、updated_at。适合快速开发，尚非规范化任务表或逐条增量同步。RLS 仅允许所有者读/插入/更新，无匿名访问、无直接删除权限。迁移文件与远端已应用版本一致。
- 离线缓存仍基于 LocalStorage；账号工作空间由 Web Locks 避免同浏览器多标签覆盖。编辑后防抖同步、15 秒轮询、恢复联网/聚焦后尝试同步。版本冲突时停止自动覆盖，用户可选择云端或本地，并先保存另一份冲突备份。不是字段级自动合并，不保证多设备重复任务调度或通知恰好一次。
- 当前最大客户端上传快照 3.5 MB，受浏览器存储与备份容量约束。后续迁移 IndexedDB/SQLite、逐实体增量同步、Realtime 与后台调度。尚未部署 Pages；生产域名确定后应配置 Supabase Auth Site URL、Redirect URLs、SMTP 邮件确认。
- 验证：真实数据库使用临时事务验证 RLS 与版本竞争，回滚无残留；安全/性能顾问均无告警；浏览器双设备使用模拟 API（非真实账号登录）。npm test、npm run build、npm run test:e2e。未创建用户真实账号，需用户自行注册并确认邮件。
