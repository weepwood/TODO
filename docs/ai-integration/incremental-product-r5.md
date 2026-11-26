# R5 真实产品集成与迁移准备（2026-11-26）

基线1903f18，独立研究分支。首次在实际TODO React界面和真实Tauri IPC中比较快照与单权威行存储；完成选定完整业务工作流，不代表已具备正式采用条件。隔离研究，不操作正式应用/真实数据/真实账号/正式网络，不合并、不发布、不安装。

## 1. 实际产品界面与隔离

research-r5显式Cargo feature、独立todo-r5-lab bin、固定com.weepwood.todo.qa.r5、独立artifacts/TODO/incremental-product-r5/{snapshot,row}/r5-research.sqlite3；专用复制目录构建，拒绝符号链接/硬链接及不匹配数据库模式。单main window、合成guest scope、仅必要研究和原生查询命令、无外部网络CSP、dummy loopback Supabase配置；不启动正式托盘、快捷键、通知、更新及账号恢复服务。研究WebView使用隔离本机偏好（两模式共享该QA profile，自动化测试在真实规则编辑器中仅清理先前的同名合成规则）；backgroundThrottling=disabled仅用于实验配置，不是正式产品策略，也不证明解决旧WebView停滞根因。不得用同一系统用户恶意篡改实验文件的能力作为安全保证。
VITE_TODO_R5_LAB=1编译时选择R5Root，最终版在任何工作空间加载前必须完成真实native handshake（protocol=1,guest,mode），正常构建不启用；保留真实React App/AccountWorkspace、useWorkspaceEdit、useWorkspacePersistence、createNativeStore队列、原useCliOperations、真实确认Modal、真实OperationHistory。复用正式Rust enqueue/next/receipt、历史摘要/详情及字段恢复逻辑，row history读取仍完整核对canonical及正式head。确认是脚本点击真实React弹窗，不是真人授权或真实AI模型/独立外部CLI验收。合成任务及操作UUID正常生成。
product-store在正式队列writer边界计算完整验证后的行补丁、keys前后值及明确完整store fallback；固定协议scope/base/UUID及不可合并receipt，unknown outcome保留原envelope，成功ACK严格检查scope/id/revision及实际canonical指纹。最终版快照ACK也从实际已保存store生成，拒绝不一致。原生严格envelope字段；原正式默认normalize identity，研究模式使用canonical序列化。现阶段仍完整JSON序列化、解析、领域校验与比较，不是R4直接捕获快路径接入真实GUI。JS与Rust canonical极端数字/键序差异仍需更广测试，发现不一致则失败关闭；不能将此适配器直接作为生产接口。
本轮发现同步耐久门禁原来固定JSON.stringify字节，研究canonical存储会永远等待；增加可选writer serializeWorkspace契约，默认正式序列化不变，仍执行提交前、flush后两次精确字节比较和当前UI身份检查。实际同步服务器未连接。

## 2. 实际业务验收

同一1000任务初始fixture，两种真实原生程序串行运行。初次脚本未带version的CLI update被现有领域规则拒绝，持久化cancelled（snapshot-rejected及其日志）；修正为实际prepareCliOperation show生成任务version后重跑。自动化第一次脚本click未触发Radix菜单，两个模式返回timeout明确报告；改用真实侧栏自动化工作台及键盘事件选择现有控件后通过。两次都是验收脚本问题，不把它们当作存储缺陷或成功数据。
三批实际产品工作流（相同业务序列、相同初始fixture，非相同随机UUID/时间）：
- 首批：真实任务工作台人工添加、实际CLI update且点击真实确认弹窗、命令面板进入历史归档、版本详情、恢复预览并确认，恢复原任务标题/优先级。1001任务、3正式历史、1 saved receipt。
- 第二批：实际CLI entity-create标签、批量create重复任务与父/子任务（父子/标签关系校验）、complete生成唯一下一实例；正计时start/pause/save，短于60秒按现有默认不记专注。1005任务、9正式历史、累计7 saved receipts。
- 第三批：真实自动化工作台配置创建触发不限日期高优先级规则、开启本机自动化，人工创建后实际自动化run及priority=3落盘；真实设置页面关闭不足1分钟忽略，实际计时2秒后保存，1条专注记录绑定该任务。1006任务、13正式历史、累计9 saved receipts，无pending。
两模式独立进程重启后显示真实业务界面，历史完整、1006任务、恢复任务保留；独立SQLite只读核对重复系列、自动化、专注、回执、正式history head，row全部任务ID/pos/body SHA256、零当前snapshots/workspace_store。创建backup-snapshot.sqlite3/backup-row.sqlite3，实际表全部排序行内容一致（不是文件字节相同）。原业务cohort移至accepted-snapshot/accepted-row以保留完整证据。最终加固build在两套新fixture上重复首批真实操作冒烟，均1001任务/history3/intact；最终版完整后两批未重复执行，行为变更限前置握手及实际快照ACK核对等。原R4故障现场未修改。

## 3. 性能对照及资源

三批合计各14次实际保存（包括初始归一化、备份和9次CLI回执）；日志计算Rust收到的序列化envelope字节量、实际adapter规划及IPC往返时间。均为千级合成真实GUI，非独占机器，样本少且每笔业务复杂度不同，运行按模式分段，时间与随机ID不同。最终安全加固前已验收版本的观测值，不是最终build全面性能基准。

|指标|快照|行存储|
|---|---:|---:|
|14次envelope总字节|23366588|711785|
|envelope中位字节|1671186|3245|
|adapter规划P50 ms|2|15.5|
|IPC P50 ms（含native）|48|36.5|
|native事务P50 ms|31.937|34.037|
|DB主文件字节（关闭进程后）|3919872|2220032|

传输量减少约96.95%，不代表物理磁盘写入或端到端提速。行存储原生P50没有提升，前端计划成本反而增加；不将各阶段独立中位数相加，也不以单次人工新建时延推导稳定结论。还未测UI事件到绘制尾延迟、万级完整真实GUI、同条件长耐久、WebKit进程组峰值或物理SSD写入。资源门禁使用memory_pressure系统估计>=25%分段启动，已监测的7段系统Swapouts增量为0；系统级非进程归因。已有约9.18GiB Swap背景；不停止其他工作、不修改系统策略。没有新生产采用理由。

## 4. 跨端与实际迁移复制协议

本地adapter handshake不接受未知协议/其他scope；JS独立测试真实task-delta连续重放、跳版本拒绝、非冲突三方合并、同字段冲突、结构变化fallback和原云端3.5MB容量门禁。保留云端CAS版本与本地row revision不同命名空间。真实服务器、两设备联网、历史客户端服务器写入阻断未验收；现有服务器尚无R5 epoch fencing，不得把本地握手当成跨端权限。未增加任何云资源。
实际product快照第二批完成后的副本cutover-source.sqlite3，独立Rust专项actual_product_cutover_and_receipt_retention：BEGIN IMMEDIATE占有写锁，竞争现有persist_store写入拒绝；另一读连接VACUUM INTO新候选；在副本检测pending阻断、终态回执保留、陈旧expected拒绝、注入迁移失败保持旧store、真正迁移及完整export等价、历史正文一致、旧快照写入口拒绝；行提交同UUID重试原ACK、改base同UUID冲突；仅导出新旧格式文件，原source不变，历史、回执及integrity ok。写锁释放后旧源仍可能被旧程序写入，故此是停写期间的复制/验证研究，不是可直接启用的在线切换机制。
生产迁移前需要：明确用户授权；停止所有写者/CLI入口并排空pending；独立校验备份与签名/版本；记录source fingerprint、epoch与范围；持有独占写租约/防止旧应用重新打开原路径；在新路径准备候选、逐scope验证完整状态/历史/回执/FTS；原子切换受控入口并保留只读旧源；异常不启用候选；降级导出新文件并重新授权切换。真实旧二进制/双端停写/恢复演练均尚待验证。

## 5. 历史及回执长期治理

沿用正式history 30天/300版本/16MiB读写预算及小时级备份；实际产品cohort13历史，既有R4 300版本证据不重复计数。迁移副本专项对真实history-list保存回执注入8天年龄：读取逻辑过期，原enqueue同UUID触发既有7天结果body清理，保留terminal状态/digest；相同UUID不同内容拒绝。没有删除真实数据、未改变现有CLI TTL。当前部分旧操作result/请求正文仍可能长期保留，r3_ack包含摘要、版本、fingerprint而不保存原prompt，但无容量上限；清理SQLite逻辑行不等于安全擦除WAL/备份。
建议（未实现生产策略）：按scope审计request/result/history/backup/ack字节，设可观测容量门禁；终态敏感正文采用最小保留、保留不可重复执行的UUID/digest/status；未确认请求与恢复必要证据不得淘汰；不直接删除旧ACK，直到有经验证的epoch拒绝陈旧请求、明确离线最长重试边界、用户授权及恢复策略。备份与导出单独权限/保留/加密政策。现阶段没有无损无限空间的承诺，不增加破坏性清理。

## 6. 验收与正式采用门禁

默认Rust Release41/41（17 ignored，实际R2/R3 fixtures/proposal传入）、相关JS38/38（含3个新增store/sync测试）、实际产品迁移/回执专项1/1、真实React两引擎三批业务及两次重启、最终加固版首批冒烟两组通过。R5完成可行性研究和选定业务等价，正式采用仍不通过：真实GUI完整覆盖和真实AI/真人、异常进程/生产级IPC重启恢复、实际云端双端/旧客户端fencing、原WebView根因、万级长耐久、同条件端到端性能及物理写入、回执隐私容量政策均待验证。不直接替换稳定快照，不新增依赖。
证据 /Volumes/data/AI-Development/artifacts/TODO/incremental-product-r5/：accepted-{snapshot,row}/report-first.json/report-business.json/report-automation.json/report.json/writes.jsonl/stages.jsonl、comparison.json、backup-{snapshot,row}.sqlite3、cutover-source/candidate/legacy.sqlite3、cutover.log、regression-js.log、release-final.log、build-final.log、最终snapshot/row/report.json；snapshot-rejected及automation-menu-error报告保留失败证据。复现使用固定root/source非Git复制目录、prepare-r5.py、VITE_TODO_R5_LAB=1与dummy loopback Supabase及VITE_TODO_EXTERNAL_API=0、npm run build、cargo +stable build --release --locked --bin todo-r5-lab --features research-r5,tauri/custom-protocol；root/fixture.json必须为合成newTask qa-*；TODO_R5_RUN_DIR指向snapshot或row，test/business/automation/restart阶段按顺序一次执行，不在已完成数据上盲重跑。只管理owned进程。迁移专项使用独立cutover-source副本，目标文件必须不存在，测试注入回执年龄，仅限合成数据。
