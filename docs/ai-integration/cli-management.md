# TODO CLI v3 · AI 管理接口
## 版本与接入
保留 v2 的20个业务操作及基础录入。v3 新增10项管理操作，通过同一个 todo run --file - --request-id UUID --wait 10 提交 JSON 对象；todo schema 提供机器可读契约。必须在包含本批代码的桌面应用中绑定工作空间并显式开启高级权限，todo doctor 返回 operation_api=3、ready/bound/advanced=true。CLI 可运行于旧版但拒绝在旧 schema 上提交 v3 操作。使用同一UUID和相同内容重试；saved 为本地结果提交，received 只是排队，sync_status=not_checked 不代表云端同步。普通 AI 客户端通过共享 Skill 调用；本地MCP仍5工具，run_operation/describe_operations 与CLI一致。云端原3工具保持不变。
## 十项管理操作
| op | 用途及参数 |
|---|---|
| context | 默认7天规划范围；今日/逾期/近期/无日期计数，任务版本、依赖、剩余估计、风险、活跃计时器、已有日历占位及容量。limit 1–50，日历100条 |
| plan-preview | date/days(1–7)/start/end/reserve(0–50)/ignoreWeek/includeBacklog；复用现有有界调度 |
| plan-explain | id及规划参数；可行性、阻塞、截止剩余、容量、风险解释 |
| reflow-preview | date/days(1/3/7)/start/end/ignoreWeek；仅重排冲突普通单段任务，reserve须0 |
| changes-preview | changes 数组1–30项，各含id/version/fields；只允许普通未锁定待办的安排和分类字段 |
| split-preview | id/version/children；1–20子任务，每项title/duration必需，可选notes/checklist/priority/after(前序子任务1基序号) |
| preview-apply | previewId/confirm=true；必须取得用户对实际预览的明确确认 |
| changes-undo | receiptId/confirm=true；仅安全可逆变更 |
| audit | ageDays(1–3650)、limit(1–50)；积压、规范化同名候选及阻塞 |
| review | date/period(day/week/month)，当前周期回顾及180天可追溯工时校准 |
## 示例
以下是本地操作请求体示例；先确认绑定和授权，再使用独立的 UUID 通过 todo run 提交。日期应根据真实用户意图填写。
```json
{"op":"context","days":7,"limit":20}
```
```json
{"op":"plan-preview","date":"2026-12-02","days":3,"reserve":20}
```
展示预览的 rows、analysis.capacity/placements/skipped、不可行原因及实际影响范围，用户确认后以新请求UUID提交：
```json
{"op":"preview-apply","previewId":"实际预览回执UUID","confirm":true}
```
预览、应用、撤销是不同请求。不得编造ID或版本。以下示例 ID/version 均须替换为真实 context/show/query 返回值：
```json
{"op":"changes-preview","changes":[{"id":"TASK_ID","version":"LATEST_VERSION","fields":{"priority":3,"date":"2026-12-02"}}]}
```
```json
{"op":"split-preview","id":"TASK_ID","version":"LATEST_VERSION","children":[{"title":"阅读资料","duration":30,"checklist":["记录来源"]},{"title":"实现","duration":90,"after":[1]}]}
```
如 preview-apply 回执 undo.supported=true，可在用户确认后提交 {"op":"changes-undo","receiptId":"实际提交回执UUID","confirm":true}。
## 安全边界与证据语义
预览和撤销均有效15分钟。应用读取原生队列同工作空间内真正保存的回执、比较完整工作空间指纹、重新计算方案及工作时间设置，拒绝过期版本、过去的时段、截止超限、锁定、冲突及未预览自动化副作用；最终由原共享编辑器、历史及SQLite事务执行。整工作空间指纹是保守策略：即使无关修改也可能要求重新预览。批量仅限可逆普通任务字段，允许中间状态临时重叠但最终必须无目标冲突；撤销只逆转明确字段，不恢复整个工作空间，不删除分解产生的子任务，也不恢复会重新产生冲突或已过去的计划。没有任意批量生命周期操作或永久删除。
规划复用工作时段、已保存工作周、当前时间下界、固定占用、预留容量和既有调度算法。已安排任务不属于新安排候选，前置未完成不安排；结果不保证全局最优，不自动改变优先级。重排仅处理当前冲突普通单段，不是通用延误预测。外部日历采用现有定时忙碌区间，不处理全天事件。context 不返回备注，外部事件标题以忙碌时间替代；风险未获充分证据时为 unknown。审核仅规范化同名匹配，不是语义重复识别，积压按创建年龄、调整按保留活动记录；不自动清理。review 是当前数据及可追溯专注样本，不是历史计划快照或全部真实工时。
v3 管理回执结果正文提交日起7天后逻辑不可读，后续业务提交时清空已过期正文，保留状态和请求摘要作为去重墓碑。不是安全擦除，不清理旧v2回执或SQLite WAL/备份；预览实际可应用期仍为15分钟。高权限关闭后不返回高级回执内容。结构化业务拒绝码见 schema；旧业务及底层CLI传输错误保持原返回格式。禁止用直接 update 绕过用户要求的预览。
## 验收与并行分支
从 d528ccf 精确复用 3d47350 的 productivity/time-intervals/planner-interaction/weekly-planner/duration-forecast 五个核心模块及规划质量测试，不合并原分支，未引入其UI改动；后续整合时需复核UI和重复变更。独立 com.weepwood.todo.qa.climanagement、合成云端配置，真实WebView授权探针仅QA、非安装二进制；无探针候选实际运行。六组业务通过，11项合成任务、41份saved及5份预期cancelled（含本地MCP实测）；SQLite integrity ok。Rust16/16、定向领域38/38（含256组规划穷举对照）、浏览器6/6、原云端协议3/3，前端及原生构建通过。证据 /Volumes/data/AI-Development/artifacts/TODO/cli-management/。全局CLI及共享Skill升级，旧入口、二进制和Skill备份保留。正式应用未替换、真实工作空间未接入、模型自主调用及正式跨端同步未验收。
