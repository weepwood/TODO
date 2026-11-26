# 本地 CLI 业务契约 v2

## 启用与安全
本机 CLI 已升级，但需要包含本批代码的原生应用。运行 todo doctor 检查 ready、bound、operation_api=2；原绑定仍是录入权限，查询及其他业务必须由用户在设置→账号与同步→本地 CLI 接入显式启用高级权限（advanced=true）。CLI 不自行授权、启动应用或切换工作空间。旧版仍可录入原有简单任务。应用关闭或绑定工作空间未活动时，操作仅排队。每个绑定工作空间最多一个待处理 CLI 请求；高级请求未结束时不可取消高级授权或切换绑定。终止后关闭高级权限会禁止新高级请求，历史高级回执只显示状态，不返回内容。本机同 OS 用户为信任边界，不是恶意同用户程序沙箱。

## 使用
```sh
todo doctor
todo schema
todo add "学习数学" --date 2026-12-02 --time 19:00 --end 20:00 --repeat weekdays --weekdays 1,3,5 --repeat-until 2027-03-02 --reminder-offsets 15,5 --request-id "$(uuidgen)"
todo today
todo upcoming
todo overdue
todo search "数学"
todo show TASK_ID
todo catalog
todo status REQUEST_UUID
```
简单 add/batch 保留旧协议。新增丰富参数或结构化业务使用 v2；带 --end 的跨午夜区间需 --end-date。更多参数：--repeat、--interval、--weekdays、--repeat-until、--repeat-count、--reminder-offsets、--tags、--section-id、--plan-minutes。todo schema 返回20项当前契约、参数名称和示例。批量采用 todo batch --file - --request-id UUID（stdin JSON 数组），结构化操作采用以下通道（stdin JSON 对象）：
```sh
todo run --file - --request-id "$(uuidgen)" --wait 10 <<'JSON'
{"op":"create","tasks":[{"title":"研究","duration":120,"blocks":[{"date":"2026-12-02","start":"09:00","end":"10:00"},{"date":"2026-12-02","start":"14:00","end":"15:00"}],"checklist":["阅读","记录"],"children":[{"title":"整理资料"}]}]}
JSON
```
同一次请求保留原 UUID 和相同内容，跨日重试使用绝对日期；status 查询回执无需重新执行。received=排队；saved=SQLite提交或查询结果已保存；cancelled=业务拒绝，检查原因；error=请求失败。sync_status=not_checked 不代表已同步。查询同样经过主窗口队列，不读取未授权的磁盘数据；结果按请求 ID 保存在本机 SQLite，暂不自动清理，回执有512KiB上限。不要把敏感查询结果转发给外部。

## 20项业务操作
| op | 参数及用途 |
|---|---|
| create | tasks 数组，allowConflict 可选；完整录入 |
| query | view/q/listId/tagId/offset/limit；默认 all 待办，limit最多50；today/upcoming/overdue/someday/recurring/completed/skipped/trash |
| show | id，includeDeleted 可选；详情与 version |
| catalog | 清单、分组、标签、习惯及计时器版本 |
| calendar | from/to，最多31天、500个有明确时间的区间，含外部忙碌时间；不包含全天事件 |
| stats | date/period，day/week/month，复用现有回顾汇总 |
| update | id/version/fields；scope occurrence 或 series，allowConflict 可选 |
| complete | id/version，完成当前实例 |
| reopen | id/version；历史重复实例须 confirmSeries=true，仍受后续实例保护 |
| restore | id/version；回收站恢复 |
| move | id/version/listId/sectionId（可选） |
| postpone | id/version/days（1/3/7），allowConflict 可选，复用原普通任务延期 |
| series | id/version/scope=series/action=pause/resume/end |
| undo-completion | id/version/completedAt/stage；使用普通任务完成回执中的 undo 字段 |
| entity-create | kind=list/tag/section、name、parentId（分组所属清单）、color 可选 |
| entity-rename | 同分类参数，加 id/version |
| habit-create | name、weeklyGoal 可选 |
| habit-check | id/version/checked/date 可选 |
| focus-start | version（catalog 的 timerVersion）、mode/minutes/taskId/planned 可选 |
| focus-change | version（最新 timerVersion）、action=pause/resume/save |

修改前通过 show/query/catalog 获取真实版本令牌，不能手工生成。例如将下列示例占位符换成实际查询结果，再交给 run：
```json
{"op":"update","id":"TASK_ID","version":"LATEST_VERSION","fields":{"priority":3,"date":"2026-12-03"}}
```
已有重复任务规则修改必须 scope=series，且该次 fields 只含重复规则；普通属性另以 occurrence 修改。series 操作不删除已完成历史。仅普通任务完成提供安全撤销回执；不提供任意撤销、永久删除、清空、账户管理或智能批量自动排程。复杂安排先核对影响范围，用户明确允许才覆盖冲突保护。锁定时间块保护仍生效。延期沿用原普通任务预览规则，不保证外部日历冲突均纳入该预览。

## 属性与边界
任务字段见 cli-schema.json。日期 YYYY-MM-DD，时间 HH:mm，提醒为本地 YYYY-MM-DDTHH:mm，优先级0–3。repeat 支持 none/daily/weekly/monthly/workdays/weekdays/completion；interval 1–365（workdays固定1），weekdays 0周日至6周六，repeatUntil/Count 与 miss=keep/skip、reset 沿用原重复逻辑。每批含一层 children 共最多50个任务；创建 checklist 为字符串数组，编辑 checklist 为完整 {id,text,done} 数组。reminders 或 reminderOffsets 可替换提醒集合（最多21，首项主提醒），相同时间保留已发送标记。blocks 为主段及最多30补充段，每段1–1440分钟，跨午夜须 endDate；更新 blocks 替换完整区间集。预估 duration 与 planMinutes 不同；未指定 duration 的新主时间块使用其时长。后续重复实例沿用预计时长、不复制补充段，并返回提示。v2 计划冲突默认拒绝；旧录入协议保留原行为。专注指令排队超过30秒拒绝，不伪造时长。
本地 MCP 新增 describe_operations/run_operation，仍保留原3工具；远程/云端仅保持原3工具。无需新增 OAuth 或服务。Skill 原文在 skills/todo-cli/SKILL.md；全局安装共享给 Codex/Claude。真实模型自动发现与自然语言会话仍未验证。
