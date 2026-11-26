# SQLite 增量持久化研究 R1（2026-11-26）

基线 47babb9，独立 feat/incremental-storage-research。仅 cfg(test) 模块 incremental_research.rs，没有注册 IPC、CLI、MCP、运行时存储开关、应用升级或正式迁移。测试自行创建合成数据库并清理，不接受生产路径；现有 candidate 与 main 保持原提交。

## 1. 资料与既有实现

核对日期 2026-11-26，外部仅阅读公开技术文档，未克隆或移植第三方源码，也未完成固定提交源码/许可证专项审计。
- Actual Budget [Database Details](https://actualbudget.org/docs/contributing/project-details/database/) 与 [Syncing Across Devices](https://actualbudget.org/docs/getting-started/sync/)：本地SQLite、表/字段兼容和变更累积；长久保存每次变更可能膨胀，不能把日志永久保留等同安全。借鉴实体边界和可迁移视图思想，不引入其CRDT。
- Joplin [Synchronisation](https://joplinapp.org/help/dev/spec/sync/)：本地实体模型与每同步目标的独立同步状态。数据持久化版本不等于云端同步版本。
- SQLite [Session Extension](https://www.sqlite.org/sessionintro.html)：同schema、兼容起点上的变更集与冲突处理；不假定其changeset自动满足TODO生命周期、历史和权限。未启用session extension。
- SQLite [WAL](https://www.sqlite.org/wal.html)、[Backup API](https://sqlite.org/backup.html)：原子提交与一致备份边界；实际备份实验使用VACUUM INTO，不宣称使用online backup API。
- TODO 本地 task-delta.js：稳定顺序、无删除、非任务元数据不变时才生成云端增量；shard-state-plan.js 与 web-workspace-shards.js：128桶、引用复用/冻结、独立顺序、manifest、事务和旧数据变化拒绝；native-store.js：持久化队列及CLI回执barrier。研究借鉴其契约，不改同步、现有历史或Web分片试点。

## 2. 候选模型及安全边界

独立SQLite表 lab_task（scope/id/pos/body/hash/rev）、lab_part（meta及原store各键值）、lab_hash（256桶）、lab_head（workspace rev/root/source digest）、lab_receipt（UUID/请求摘要/终态版本）、lab_evidence（任务前后摘要及元数据键名）。任务完整JSON保留原结构和数组顺序，元数据及其他store字符串原样保留；不拆解每个任务的activity，不删除未知字段。实验允许两个固定合成scope。仅实现现有任务更新、元数据替换与键值增删；任务新增、删除、排序变更尚未实现增量路径，禁止用于应用实际写入。

根摘要是结构化SHA-256：任务body哈希；桶由ID的SHA-256首字节确定，桶内按ID排序的(id,pos,hash)记录计算带bucket-v1域标记的哈希；根使用root-v1、256个桶及有序part哈希。每次提交仅重新计算变更任务、受影响桶和根。根摘要表示当前内容，不代表发生过的所有操作；workspace rev与task rev单调变化，避免ABA回到相同内容时误用旧请求。不是原canonical指纹的可替代值。无实际变化请求也可产生回执和workspace rev；任务未变则task rev不变。
事务BEGIN IMMEDIATE内核对scope、UUID请求摘要、workspace rev/root、目标任务旧哈希/版本，写实体、桶、根、证据及回执一起提交。同UUID/同请求返回原结果，同UUID异请求拒绝；旧workspace版本与任务旧版本拒绝。原子性不等于业务正确性。独立export使用读事务，从实际行内容逐行重算SHA256、验证id/pos/bucket、重建manifest与完整根，并还原原store；另用完整Value对照，不只依赖新根。增量提交依赖未改行及辅助manifest已验证，无法即时发现所有未触碰行被外部篡改；生产须设计可信写者、定期scrub、异常只读和恢复策略。不是OS级沙箱。
lab_evidence仅前后哈希及变更键名，保留300条，不能恢复字段、生命周期、重复系列或积分；未实现正式日志30天/16MiB/读取预算、确认凭据、FTS、原CLI回执迁移、提醒、备份政策、cloud base/CAS、任务领域验证、ACL等。实验回执未设生产保留策略。现有业务引擎仍是权威；原型不降低正式保护，但自身不是正式引擎的等价实现。

## 3. 迁移与故障验收

原store独立来源，确认semantic source hash；事务内写入、完整导出对照成功才提交，不覆盖已有scope。保留原SQLite和元数据；往返实验由现有persist_store写入合成旧库，迁入实验库，编辑后导出到新的旧格式数据库，确认原库不变。VACUUM INTO到新文件，再独立打开并验证完整数据；原旧库中的历史、CLI回执等不迁入，不允许直接降级替换。旧source发生变化时拒绝直接导出为替换候选；实验输入是已读取的source副本，尚未实现跨数据库真实写者锁/停写协议，不能当作在线迁移。导出为新库不是恢复全部历史与回执。
- 注入中途迁移失败、提交前失败，事务全回滚；错误source摘要、重复迁移、非法scope、跨scope隔离、无效任务hash、重复任务变更、旧base、同请求不同内容拒绝。
- 320次确定性伪随机修改，对每次任务及元数据变化进行完整Value比对；另一SQLite连接幂等重试和旧版本拒绝；保留300证据、320回执。包含未知字段、Unicode、null、数组顺序、父子、依赖、重复字段、专注记录和opaque cloud base；不是运行真实领域生命周期。
- ABA测试：任务改回原内容后根相同但版本已前进，重新绑定最新workspace的旧任务版本仍拒绝。
- 真实测试子进程强杀：迁移前提交WAL 440872B，重启无head/任务；迁移提交后WAL 444992B，完整迁移；增量提交前WAL 20632B，原版本和无回执；提交后WAL 20632B，新版本且1回执。四次integrity_check均ok。非断电，非正式应用强杀。
- 最终Release Rust31/31（含既有26项、5项新增，crash_child默认无环境时为空入口），独立强杀1/1、三组矩阵1/1、两次独立内存实验各1/1；现有JS定向60/60。没有实际原生UI或模型调用，研究仅测试模块。

## 4. 最终Release矩阵

同一设备、同一Rust release profile、真实文件SQLite，三组合成任务，每任务1/5条初始activity，60/60/120次确定性单任务更新。完整路径调用当前persist_store（含序列化、历史、索引、备份、快照），增量路径从已知任务变化构造请求并apply（含行/哈希/证据/回执）。两者业务能力不等价；这个比较只能说明已知变更下的存储层潜力。每20次及最后一次完整导出并独立对照。对照采用先完整后增量，同进程交替执行，非独占设备。隔离文件在外置实验TMPDIR；两个连接均关闭auto-checkpoint并在开始TRUNCATE，仅用于观察WAL增长，不修改生产参数。P95/P99 nearest-rank；60样本P99等于最大，120样本P99不是长期SLO。下表为加入任务版本后的最终复测，初次矩阵另有log。

|任务/密度|采样|完整保存 P50/P95/P99/max ms|增量 P50/P95/P99/max ms|完整 WAL B|增量 WAL B|
|---|---:|---|---|---:|---:|
|1000/1|60|6.389/6.580/7.254/7.254|0.429/0.660/0.704/0.704|2010592|1409072|
|5000/5|60|107.721/114.062/204.953/204.953|1.700/1.963/2.450/2.450|5689752|1396712|
|10000/5|120|224.468/307.430/374.960/383.743|2.948/4.247/6.476/9.170|11449512|2970552|

万级中位数约76倍差距，WAL约少74%；不等于应用整体提速76倍/真实SSD写入下降74%。数据库文件在checkpoint前分别18989056/11284480B，不能与WAL简单推断长期占用。迁移1099.891ms；独立完整导出+semantic digest对照P50 359.256ms；完整输入解析、克隆及定位单任务P50 45.711ms，仅是桥接成本下界，不含真实JS差异、序列化、IPC、同步。若每次保存前后全量校验，收益会大幅被抵消。校验批次必须有明确故障检测策略，不能用性能理由跳过保护。

|独立内存进程，10000/5，30次|完整路径|原型|
|---|---:|---:|
|编辑总耗时 ms|7401.470|61.573|
|最大RSS B（macOS time -l）|816250880|511672320|

两进程都含初始化和最终校验，非应用常驻内存；初次同进程三组矩阵峰值RSS1062895616B，混合路径不能归因单引擎。真实磁盘写入、物理SSD磨损、数小时耐久、频繁重排、删除、新增、完整领域任务、并发同步与UI端到端均未验证。

## 5. 采用判定与下一阶段

结论：保留当前快照作为正式权威，独立候选值得继续研究，不采用、不替换。实际生产至少需要：
1. 增量契约从已有不可变业务状态及原生队列产生，不让AI绕过共享领域逻辑；插入、删除/回收站、排序、活动、提醒、积分、列表等跨实体变化必须同事务，并提供完整快照fallback。
2. 独立原型对照迁移原canonical历史语义、恢复预览、原子回执/确认、权限、FTS、同步base与备份；原业务与测试不能删减。研究事务内更新历史diff、任务版本和proof，原hash证据不替代正式历史。保留历史预算、回执策略及数据隐私。
3. 先做只读shadow校验或复制库双轨（非两个独立权威），明确单写者、旧程序版本门禁和兼容/降级协议；故障注入验证迁移/双写/切换/回滚。任何真实数据库或安装单独授权。
4. 以完整业务路径、同等日志/权限/备份、不同数据密度、更多重复及真实独立运行，验证P95/P99、WAL checkpoint、内存/长期增长与跨端一致性，再决定采用。若增量路径不等价则不切换。

证据：/Volumes/data/AI-Development/artifacts/TODO/incremental-storage-research/；matrix-final.log、matrix.log、release-final.log、crash-final.log、memory-full.log、memory-incremental.log、domain.log。复现：独立工作树构建合成前端后设置任务独立CARGO_TARGET_DIR/TMPDIR，cargo +stable test --release --locked --lib --features tauri/custom-protocol；另运行 incremental_matrix、incremental_crash_boundaries、engine_memory_sample（TODO_LAB_ENGINE=full/incremental）加 -- --ignored --nocapture。rustfmt未安装，未修改工具链，保留现有项目紧凑Rust风格。无新增付费资源。
