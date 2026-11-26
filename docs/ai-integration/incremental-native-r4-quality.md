# R4 实际原生质量收口（2026-11-26）

基线745f1b6。仅独立research-r4 feature及研究WebView，正常TODO入口、数据库及同步服务未改变。本批完成上轮未通过的类型化操作、正式回执队列、短批次万级真实IPC性能及千级300历史版本耐久；原WebView停滞根因尚未证明，生产采用门禁仍关闭。

## 1. 故障现场及隔离

保留原artifacts/TODO/incremental-native-r4/run/r4-research.sqlite3及backup-v49.sqlite3，两者本轮前后SHA256校验一致；通过SQLite backup读取独立版本49副本到incremental-native-r4-quality/run。新研究二进制只接受该新root下的run或small，要求原隔离Bundle ID、main window、无外部网络CSP、固定合成scope及专用文件名；拒绝符号链接及已有DB硬链接，retention只允许small目录。正式入口、真实数据库、真实账号、正式安装与全局CLI不变。没有停止其他开发任务，不修改系统安全或Swap策略。
上轮停滞缺少细粒度证据，不能追溯确定根因。实际观察到重复全量canonical字符串分配、相同基准队列重复plan及同步IPC命令。此次改为结构比较、已有patch复用、耗时原生命令async执行；SQL仍串行Mutex、同事务保护不变。async不是无阻塞SQLite，也不能单独证明是此前的停滞原因。新增分段trace.jsonl（WebView阶段、native commit begin/end/耗时、请求UUID与版本，不写任务正文），研究IPC 20秒客户端超时，超时表示未知结果而非取消，原envelope保留、不得换UUID盲重试；外层85/95/65秒有限运行，仅管理自有进程。实际没有触发超时；无事件循环卡死时的强制JS定时器保证，外层超时仍必要。上轮停滞未复现，不宣布已根因修复。

资源背景：16GiB RAM、启动前Swap约9481MiB、实验时9473MiB。分段执行，不并行启动重型WebView。千级耐久采用本轮保守的系统memory_pressure free percentage>=25门禁，每批前及运行中检查，实际批前40/39/41/41%；该百分比是系统工具估计，非空闲物理内存直接比例。系统vm_stat Swapins增量：quality 8、perf 72、retention四批116/32/24/12；六段Swapouts增量均0。页16KiB，系统级计数，不能归因单进程。已有高Swap占用不等同持续换出。采样native RSS quality317728KiB、perf274704及203872KiB，非全进程组峰值，未实测WebKit独立峰值或数小时增长。资源高压下不扩大万级长耐久。

## 2. 前端捕获和真实回执队列

changes.mjs保留sealWorkspace、jsonGraph、migrateState、独立replay及预算约束；已验证JSON的相等比较复用正式sameRecord，减少全量canonical字符串分配，保守路径共享diffValidated避免重复seal/jsonGraph，普通顺序判断不再生成两份完整ID数组。受控标题/优先级编辑仍保留原共享编辑器、锁定保护与字段白名单；复杂操作仍完整领域校验。不绕过生命周期、父子关系、同步及正式历史保护，不改变生产GUI。新增120次Unicode/普通修改canonical独立对照、键顺序无变化、非法undefined拒绝测试。
queue-r3保留原有非合并receipt barrier。stage完整验证后的patch绑定base对象，flush基准完全相同时复用；普通操作合并后基准无效则重算；failed/lost请求保留原envelope。正式回执原子保存仍由Rust实际引擎负责。
在v49独立副本真实WebView执行此前未完成的typed parent、tag两操作，每次独立R2 plan及replay一致，提交后完整对账。接着实际Rust enqueue update，通过真实IPC queue：第一次注入提交前失败，receipt仍received且原版本不变；后续两个人工编辑入队；第二次同envelope成功提交但模拟丢ACK，receipt saved且实际状态为第一笔；第三次同envelope返回持久化ACK；第四次合并人工编辑提交，无receipt且保留全部结果。三次同请求字节相同，四次IPC仅两笔成功事务，未越过回执屏障。最终v53/history50/10003任务/53 ACK/无pending/零完整当前快照/integrity ok。真实用户确认及生产外部CLI进程连接未验收，测试调用原Rust enqueue/receipt而非实际AI。

## 3. 万级实际WebView性能

在同一真实隔离应用、同一编辑前后状态测量30次受控优先级编辑及独立完整计划；每次比较patch并用原canonical重放作为独立oracle，每10次及末尾完整export/history握手。oracle和阶段日志/定期审计不计入相应计时段；IPC包含原生提交，不能两项相加。WebView计时分辨率有限，非独占设备。

|阶段|P50 ms|P95 ms|max ms|
|---|---:|---:|---:|
|受控编辑及增量捕获|8|55|59|
|同一结果的保守完整plan（不含编辑）|18|111|116|
|独立canonical replay对照|83|450|466|
|实际IPC往返|85|208|221|
|Rust提交（IPC内部）|84.137|125.992|129.567|

R4首轮编辑+保守捕获487ms、IPC208ms为不同运行与测量条件，不能直接推导正式应用提速比例。此次同输入比较快路径与完整计划成本不同（前者含编辑，后者不含），不宣称严格同成本倍率；没有运行旧引擎完整GUI对照。30次真实提交全部完成，v83/history80/10003任务/83 ACK；独立进程重启后完整指纹与历史、回执数、任务数一致，checkpoint清零WAL、integrity ok。原停滞未复现，仅限本次短批次。

## 4. 真实原生300版本耐久

为降低资源负载，独立small数据库1000个真实newTask合成任务，四个独立原生进程各80次编辑，共320次真实WebView提交，批间重启3次，每40提交完整对账及checkpoint共8次，批末再次审计。每批恢复已提交版本继续，绝不重置。最终history head320，正式日志保留300条（21..320），transport ACK320、当前快照0、integrity ok。无未完成请求。

|累计版本|该批IPC P50/P95/max ms|受控捕获 P50/P95/max ms|
|---:|---|---|
|80|9/12/16|1/1/5|
|160|10/14/29|1/1/4|
|240|10/12/20|1/1/4|
|320|11/12/21|1/1/4|

本次不是万级320提交、不是数小时连续耐久，不宣称解决长期内存或物理磁盘写入。万级v83及千级v320全部任务行SHA256及ID检查通过；独立SQLite backup重开，r3_head/task/meta/kv/ack、正式history/head、direct requests、cli meta、backups、FTS共11表实际排序行内容相等（非物理文件字节相等），两份新备份保留。旧CLI文件名门禁沿用R4已有真实验证，R3迁移/降级、新旧数据保留契约仍由既有回归覆盖；未直接运行正式旧客户端或跨设备切换。

## 5. 局部证明信任链

test-only proof root新增固定scope、revision、canonical body hash及256桶摘要绑定；局部读取检查当前head及选定桶已知成员ID/pos/body/hash。由proof owner从实际提交的完整patch提取全部既有行before/after，调用原R3 canonical commit后才推进证明，不允许外部调用者提供更小子集；旧revision、外部commit、结构/metadata/keys操作使proof失效，要求完整审计。若提交成功但证明更新失败，返回实际已提交回执、proof为空，不将其伪装为提交失败。仍在测试内部运行，不提供正式IPC写入信任授权。
30次既有行真实文件提交与局部证明，独立每10次完整重建根；外部元数据提交使旧证明失效，不支持的结构patch不提交；故意破坏独立副本的行，选中桶读取拒绝、未选中桶成功但完整审计发现损坏。完整审计253.835ms、局部读取P50/P95 0.246/0.410ms（30–51行）、完整canonical事务+证明更新P50 81.846ms。最后指标包含真实提交，不与上轮纯证明更新0.054ms直接比较。局部证明只能验证已知成员，不证明全体未读记录、额外插入或恶意共同篡改；没有跨进程持久化可信根。所有写入仍执行完整canonical校验，不以局部证明代替正式历史。

## 6. 回归、交付与采用门禁

默认feature Rust Release41/41（16 ignored，R2/R3 fixture/proposal实际传入），相关领域/同步35/35，研究JS4/4（含120步canonical独立对照），局部证明专项1/1（30提交及故障），真实原生两未完成typed操作、实际CLI回执barrier、万级30次性能及重启、千级320次/300历史/周期重启与备份均通过。不重复原R1/R2/R3的无关强杀矩阵，旧证据不计入本轮新通过。未新增依赖，不合并、不发布、不安装。保留R4研究分支，正式存储继续使用稳定快照。

仍未通过生产采用门禁：原停滞根因未定位；无实际正式React UI、真实真人确认、真实云端双设备同步、全面旧客户端二进制停写/切换协议、生产回执保留策略、万级长耐久和低压同条件旧GUI性能、长期WebKit内存/事件循环及物理写入数据。局部证明不降低现有写入完整性。下一阶段先做真实业务UI隔离集成与明确性能/运行稳定性门禁、跨端及旧客户端协议，资源条件允许再万级长时验收，不能直接迁移正式应用。

证据 /Volumes/data/AI-Development/artifacts/TODO/incremental-native-r4-quality/：preserved-before.sha256、run/trace.jsonl、run/quality.json、run/perf.json、run/restart.json、retention-1..4.json、small/trace.jsonl、各阶段vm-before/after及RSS、build.log、js-final.log、domain-focused.log、release-final.log、proof.log、backup-run-v83.sqlite3、backup-small-v320.sqlite3。proof-copy.sqlite3为故意损坏副本，禁止作为恢复源。
复现：仅复制研究源码至该root/source非Git目录；prepare-r4.py、esbuild打包、cargo release research-r4,tauri/custom-protocol同前。run使用旧v49备份的新副本；TODO_R4_PHASE=quality一次性从49开始，成功后perf一次性30采样，normal仅重启校验；small仅retention模式，空库seed1000任务，每次最多80笔直至320。各阶段独立进程、受控外部超时、检查memory_pressure和Swapins/Swapouts，保留报告后再启动下一阶段；不可在已执行完成的数据库重复执行quality/perf或继续retention。局部proof专项仅允许新root/proof-copy.sqlite3专用新备份副本（会故意损坏），禁止运行在原生验收库。完整验收数据保留于本机，不提交合成DB或日志。
