# 增量存储业务等价研究 R2（2026-11-26）

基线41e2493，独立feat/incremental-storage-research。正式运行时不接入新存储：新增Rust模块及原有存储函数的影子hook均cfg(test)，JS仅位于research/incremental。未增加IPC、CLI、MCP命令、正式数据库表或安装。R1行级256桶引擎保持独立；R2是同一SQLite事务中的全量权威+行级影子检查，不是R1引擎完整业务化，也不是两个独立权威。

## 1. 业务变更集与队列

复用sealWorkspace、migrateState、共享applyWorkspaceEdit、领域completeTask/reopenTask/reorderTasks/seriesPatch/moveTaskToList和现有mergeTasks。冻结并验证JSON图（拒绝非有限数、非JSON值、稀疏或附加属性数组）、按ID比较任务before/after、新增/删除、显式完整order、其他工作空间meta前后值。按引用复用优化比较，独立重放验证整文档canonical等价；900KB补丁预算超限才返回snapshot，非法输入reject。migrateState仍做全量验证，未实现从编辑器直接输出已知可信变更、细粒度实体表或真正增量IPC；meta仍整体值，删除仅合成测试，无新增AI删除授权。

JS合成12步从真实共享编辑器生成：创建、属性修改、顺序、清单、普通完成/重开（5分）、重复完成生成下一实例、系列间隔修改、回收站、合成移除、标签+主题跨实体、现有三方merge；独立同字段冲突拒绝。使用实际createNativeStore回执barrier，实验回调接收旧完整store，首个回执写失败后保持待处理，人工后续编辑不能越过；实际顺序qa-receipt,qa-receipt,manual。没有接入原生WebView IPC、批次自动合并或真实远端传输。固定合成数据仅外置artifacts，不提交。

## 2. 同事务影子对照

测试库使用原有storage::persist_store_receipt作为唯一权威，原事务照常维护snapshot、workspace_store、历史正文及canonical/raw proof、FTS、备份、权限和回执。在提交前test-only thread-local hook接收变更集和完整权威数据，独立更新shadow_task、shadow_meta、shadow_kv及shadow_head。与R1不同，R2使用独立完整内容摘要，不复用增量根证明；read逐行核对hash/id/pos，重建有序任务及meta/kv，核对整文档digest。旧影子与权威提交前快照及kv核对，版本不符、遗漏字段、旧写者漂移、损坏元数据或任务均拒绝；显式预算fallback要求已有版本相同且旧内容一致，不自动修复损坏。初次初始化必须snapshot。提交后比较独立完整权威库的历史正文、head/fingerprint、FTS行、备份正文和workspace_store。比较不含时间戳的字面相等；不宣称独立第二套历史引擎。测试库失败整体回滚；实际生产未来若采用影子审计，需另定非阻塞故障策略。没有把本地合成scope门禁作为真实权限沙箱。

实际JS prepareHistory读取Rust正式journal，生成真实preview和apply结果，经过原有Rust enqueue/advanced scope/validate_history_commit及正式receipt。两类测试：普通字段恢复、带5分普通生命周期恢复（pointsImpact 5→0，配置保留）。拒绝未授权入队、缺确认；注入影子失败后原状态、历史及received回执保留，成功重试与独立完整库回执/历史/FTS/备份等相同，同UUID成功回执重试不再次写。确认元数据由测试构造，非真人；未独立实测新引擎重做、完整重复系列恢复、真实提醒或云端同步。既有正式历史测试未削弱，R1 hash evidence不替代正式记录。

## 3. 故障、保留与耐久

最终Rust Release 36/36（含R1和正式用例；crash child默认无环境为空入口；本次传入JS fixture和proposal路径，实际跨语言用例执行）；JS现有领域/同步60/60，额外fixtures 12步及queue通过。R1迁移/提交前后四个进程强杀边界复验、正式history_apply WAL前后两边界复验；新R2同事务shadow前后强杀2/2，均观察WAL53592B，重启分别head0/1，原快照、影子和历史一致，integrity ok。不是GUI进程强杀/断电；新R2强杀场景没有CLI回执，回执原子性由独立正式强杀及R2注入回滚用例支持。
1000简化任务、320次真实文件影子保存，8次每40提交checkpoint(TRUNCATE)、关闭重开，逐次核验数据；300条正式历史保留，shadow rev320，VACUUM INTO独立备份重开并对照历史/索引/备份等。P50 8.461ms/P95 9.650ms/max45.769ms（低活动简化任务），checkpoint前WAL 1499712–2364912B，非数小时耐久。无真正在线迁移、降级或生产备份恢复。

## 4. 成本测量（Release）

最终同设备文件SQLite、每任务5条初始合成活动，每组30次单任务编辑，先完整后完整+影子，交替同进程。完整路径和双轨路径均运行原正式历史、FTS、备份等；benchmark为普通保存，不含CLI回执写入，回执成本只在上述功能用例验证。每次完成后独立完整库对照（不计入提交时间），影子内部完整校验计入。实验禁用auto-checkpoint、起始truncate，生产参数不变。P95 nearest rank（30样本约尾部第二值），不作为长期SLO。实际结果：

|任务|完整P50/P95/max ms|完整+影子P50/P95/max ms|完整WAL B|影子WAL B|
|---:|---|---|---:|---:|
|1000|20.678/30.441/35.642|74.773/111.753/147.435|1582112|1829312|
|10000|212.020/295.577/311.408|797.994/954.363/982.806|7786832|8034032|

同一双轨对照进程最大RSS1109213184B，含两数据库、合成数据、验证及初始化，不能归因某一个引擎/应用常驻内存。R2双轨不是行级单写方案，无性能收益，WAL增长也未降低。R1独立低层2.948ms结果不能与R2解释为同等业务性能。

JS独立20次/组，真实newTask与shared editor（编辑本身不计入plan/serialize计时），普通单项优先级变更：
|任务|plan P50/P95/max ms|JSON.stringify P50/P95/max ms|补丁典型 B|完整快照典型 B|
|---:|---|---|---:|---:|
|1000|11.775/12.892/23.125|0.992/1.127/1.221|1475|545840|
|10000|119.091/133.272/177.513|9.087/9.996/11.388|1475|5441840|

plan含深冻结/验证、migrateState、重放及完整canonical对照和预算检查；额外test assert、传输/IPC不计。数据量下降并不等于CPU开销下降。高密度万级R2影子使用多次整文档读取/哈希，证据足够说明全量双写不宜作为长期实现。

## 5. 采用结论及剩余研发

只作为正确性研究，不采用、不替换正式快照。下一阶段先建立共享编辑器可信变更捕获（结构变更及元数据版本，避免全量重复验证；独立oracle仍保留），然后研究单权威行级事务接入现有正式历史/索引/回执/备份，而非每次重建并写完整快照。须明确故障后恢复、旧格式/读者门禁、回执屏障、保护字段、同步CAS、版本与根证明、备份恢复及完整审计策略；同等业务成本的单写引擎尚未完成。先在隔离副本验证完整数据及日志，不把快路径信任假设当成已证明。不新增功能、不安装、不操作真实数据、不合并发布。

证据 /Volumes/data/AI-Development/artifacts/TODO/incremental-business-r2/：fixtures.log、domain-fixtures.json（仅合成）、domain.log、history.log、release-final.log、retention.log、crash-r1.log、crash-official.log、crash-shadow.log、shadow-matrix-final.log、js-bench.log。复现：在研究工作树准备现有node_modules及合成dist，运行node research/incremental/fixtures.mjs <隔离路径>；设置TODO_R2_FIXTURES为该文件、TODO_R2_PROPOSAL为research/incremental/history-proposal.mjs绝对路径、独立TMPDIR/CARGO_TARGET_DIR，cargo +stable test --release --locked --lib --features tauri/custom-protocol。额外shadow_cost_matrix、shadow_retention_checkpoint_restart、shadow_crash_boundaries加 -- --ignored --nocapture；node research/incremental/bench.mjs。未修改全局工具链、未新增依赖。
