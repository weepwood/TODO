# 增量持久化 R3：单权威行存储研究（2026-11-26）

基线 a988fc7，独立 feat/incremental-storage-research。R3 Rust 引擎只在 cfg(test) 编译，JS 代码仅位于 research/incremental；未注册 IPC、CLI 或 MCP，未设置运行时存储开关，未改正式数据、安装或发布。正式 storage/operation_history 中抽取原有回执准备/结束、历史来源、旧捕获处理、字段/活动/生命周期证据和日志写入/保留、读取预算等共享函数，正常保存仍按原顺序执行。保留 R1/R2，未用实验哈希替代正式日志。

## 1. 可信业务变更捕获

受控 capture session 复用 applyWorkspaceEdit，内部生成操作元数据，固定禁用自动化，当前仅支持校验过的现有任务优先级修改。初始 migrateState、深冻结及 JSON 图检查；基于不可变引用生成 put/remove/order/meta，独立 R2 plan/replay 和 migrateState 每次用于测试 oracle，不在受控快路径重复调用。非法优先级、未知 ID 拒绝。未知/导入/外部合并及其他操作走 R2 完整验证，预算过大显式 snapshot；不把任意共享编辑器回调视为可信。仍遍历任务 ID/引用，非 O(1) 捕获。没有更改实际 GUI 编辑器。
Node 每组30次真实领域编辑，受控 editor+capture 与随后独立 R2 完整 plan（不含 editor）的同机对照：

|任务|受控编辑+捕获 P50/P95/max ms|R2独立plan P50/P95/max ms|补丁典型 B|
|---:|---|---|---:|
|1000|0.586/1.053/6.670|10.935/13.570/13.804|1542|
|10000|7.100/12.049/29.818|119.887/125.647/125.726|1542|

所有60次捕获与独立重放/完整领域校验一致；对照范围不相同，非端到端提速比例。实验 queue-r3 用完整 R2 验证生成 scope/base/request UUID/patch/receipt envelope，保留未获确认的确切请求、CLI barrier、普通编辑合并；测试模拟提交后丢失响应及错误scope响应，重试原包，后续编辑未越过回执。队列仍未连接Rust/真实IPC，未纳入快路径时延，超过预算需另行完整store回退，不默认删除其他keys。既有 native-store 的回执队列测试继续通过。

## 2. 单权威事务

独立合成SQLite内 r3_task(scope,id,pos,body,hash)、r3_meta、r3_kv、r3_head(rev,canonical body hash,kv hash,layout hash)、r3_ack(UUID,请求摘要,提交版本及body hash)。保留正式日志、索引、备份、CLI表；迁移后删除该scope的snapshots/workspace_store当前值，不同时写完整快照。旧保存路径被INSERT/UPDATE触发器拒绝（非恶意同OS用户沙箱）；备份仍按原逻辑保留必要的完整快照（首次/小时级，最多24份），不是无任何完整快照。
BEGIN IMMEDIATE；验证传输UUID/摘要、原版本、scope、原行/元数据/键值、完整canonical及布局指纹、正式head；复用正式prepare_receipt、history_request、validate_history_commit、finish_captures及finish_receipt；行/顺序/元数据/FTS/历史/备份/回执/传输确认同事务。重试同UUID同内容返回原ACK，不覆盖更新；同UUID异内容或陈旧版本拒绝；取消回执不可修改业务状态或keys。r3_ack未设置生产保留政策，后续要明确幂等生命周期/数据隐私/容量。受控数据只为合成scope，不是新权限系统。
初版每次解析全部行与完整Value重放，虽然WAL降低但速度退化。最终对既有任务<=100条、无结构/顺序/元数据/keys变化且非history-apply的请求使用受限快路径：每次读取所有行原字节、逐行SHA256，校验按位置的长度前缀ID/行hash布局摘要、连续位置及canonical完整body hash；仅解析/比较被触碰的Value，按sorted keys与原始canonical任务JSON拼装工作空间；用真实变更对共享正式history_rows生成相同字段及活动/生命周期证据。完整canonical fingerprint仍与正式history head相同，不用布局摘要替代。FTS仅局部变更，超过100走原完整索引判断；原有正式history保留30天/300版本/16MiB/读预算。结构变化、完整store fallback、history-apply仍完整解码，重新执行原全工作空间确认校验。没有自动把损坏数据重建为“正确”数据；拒绝并要求独立恢复。
布局摘要包含ID及有序行hash，canonical摘要覆盖内容/顺序；独立export重新解析完整JSON、核对行ID与序列化。快路径仍O(全体字节)读取/哈希/拼接和store预算计算，未实现真正局部读取或分桶根替换。触发器并非对恶意DB修改防护，协同篡改所有信任锚无法被此模型抵御。

## 3. 历史、回执及兼容验收

12步真实共享编辑器 fixture（创建/属性/排序/清单/完成/重开/重复实例/系列修改/回收站/合成移除/跨实体/三方合并）加keys-only及显式snapshot fallback，逐次独立旧库对照完整数据、正式历史正文/来源/操作组/版本与canonical指纹、FTS、备份正文；检查当前snapshots/workspace_store为0。快路径拒绝未改任务的ID/位置/内容损坏、head及keys损坏、陈旧before和额外字段。旧scope隔离及CAS通过。未实现完整域模型的独立第二套规则；复用旧引擎。
真实JS prepareHistory读取R3 journal，普通字段及5分生命周期的撤回和重做均由原Rust高级权限、确认、精确字段校验、事务回执验证；积分5→0→5、原完成时间及后续人工主题修改保留。缺确认、超范围notes、注入失败回滚、重试、已保存回执后更新再重试验证；测试构造确认元数据，非真人。无真实原生WebView/model/双端同步。本批重用原合并与同步测试、保留opaque cloud base等键值，不代表实际服务器同步验收。
迁移使用独立合成旧库：同事务校验预期canonical store、无pending、原历史head、转换所有行、重建验证，删除当前全量快照；保持正式历史/FTS/备份/绑定及已保存/取消回执。初始化schema在迁移前单独创建，失败可能留空实验表，业务转换仍原子。R3文件仅研究用途，不接受正式路径。旧保存入口拒绝；旧版bind依赖snapshots无法新绑定，旧已绑定CLI可能仍能入队，尚未建立全面旧二进制读者门禁，禁止混用。R3重建的raw是canonical，正式WebView的原始序列化字节与snapshotFingerprint的握手仍待真实IPC适配，不假定直接兼容。
降级仅VACUUM INTO新文件再原子转换全部迁移scope，校验明确scope/revision集合、无pending、完整hash/历史；保留正式表及旧回执，恢复snapshots/workspace_store；r3_retired阻止旧研究会话再次迁入同一副本。独立两个scope、旧路径实际再次编辑、历史继续生成、原R3保持不变通过。不直接覆盖旧库，不是安装/正式在线迁移，尚未实现跨进程停写协议及真实旧版二进制验收；失败的候选文件不得视为可用旧版库。

## 4. Release 同条件业务成本

最终文件SQLite，1000/10000任务、每任务5条简化活动、各60次已知现有任务优先级+标题编辑；同一Rust release profile，同进程交替完整及单权威路径。两边均执行实际CLI enqueue权限检查、receipt保存、正式历史、FTS更新、原小时级备份政策；合成receipt确认非真人。计时含请求构造后的入队/存储及旧JSON序列化或R3小补丁构造，JS实际编辑与IPC/网络不计；每个回执及每10次完整独立oracle校验不计入保存耗时。实际历史恢复另测正确性，未测万级恢复尾延迟。60样本 nearest-rank P99=max，非稳定长期SLO。实验关闭自动checkpoint并在组前TRUNCATE，仅观察WAL文件增长；同设备非独占，标题长度变化可能导致完整JSON页位移，不能外推所有编辑场景。生产SQLite参数未改。

|任务|完整 P50/P95/P99/max ms|单权威 P50/P95/P99/max ms|完整 WAL B|单权威 WAL B|迁移 ms|
|---:|---|---|---:|---:|---:|
|1000|22.483/24.473/67.303/67.303|10.379/11.213/39.140/39.140|96061952|7296552|35.684|
|10000|235.419/254.989/453.626/453.626|119.346/139.190/234.995/234.995|914260992|14148112|385.195|

万级P50下降约49.3%，P95下降约45.4%；该场景WAL文件增长约少98.45%，不是物理SSD写入或平时WAL常驻量。checkpoint前db文件16478208/25317376B（转换旧库存在旧页面/空闲空间，未做空间等价VACUUM分析），不宣称总体磁盘占用降低。同一对照进程最大RSS871563264B，混合路径，非单引擎/常驻内存。
初版保守路径万级完整P50/P95 248.727/310.722ms、单权威301.157/484.530ms，证明取消全量持久化不自动解决CPU；最终快路径才产生收益。R1 2.948ms不是同业务代价，R2双写797.994ms也不是同测量样本，不能作为严格优化倍率。

## 5. 故障、保留与采用判定

最终Rust Release 41/41，15 ignored需专项运行（环境未设的child入口无操作；R2/R3 fixtures及proposal实际传入），JS定向60/60、JS捕获60次/queue1/1、R3跨语言12步及回退。R3四个真实测试子进程强杀：迁移前/后WAL45352B，原快照或行权威完整；提交前/后WAL65952B，行/正式日志/回执原状态或新状态一起保存，saved后原UUID重试一致。R1 4、R2 2、正式history 2边界复验，总计12/12；非GUI进程强杀/整机断电。
1000低密度简化任务320次普通保存、每40 checkpoint TRUNCATE并重开，8次独立对照，正式历史300、传输ack320；P50 2.200ms/P95 2.373ms/max3.102ms；checkpoint前WAL1594472–2525592B，VACUUM INTO备份独立重开/完整性与旧库对照通过。非数小时耐久、未测物理SSD写入。
结论：R3在限定同业务存储成本的场景下首次获得明确单写性能收益，值得继续研究；仍不采用为正式存储。下一阶段：真实隔离原生delta IPC与队列连接（确认指纹字节契约、receipt/group、全量fallback），扩大可信变更捕获及业务覆盖、独立实际同步与旧客户端/迁移切换门禁、回执容量隐私/备份恢复、正式性能与数小时耐久。保留正式快照为权威，研究候选不合并/不发布/不安装、不碰真实数据。

证据 /Volumes/data/AI-Development/artifacts/TODO/incremental-single-r3/：refactor.log、capture-final.log、fixtures.log、domain-fixtures.json（合成）、domain.log、queue.log、single-history.log、history-final.log、compat.log、crash-final.log、matrix.log、matrix-final.log、release-final.log、retention.log、official-crash.log、r1-crash.log、r2-crash.log。复现：研究工作树现有依赖/合成dist，node research/incremental/fixtures.mjs <隔离fixture路径>，node research/incremental/capture-bench.mjs，node --test research/incremental/queue-r3.test.mjs；TODO_R2_FIXTURES/TODO_R3_FIXTURES指向fixture、TODO_R2_PROPOSAL/TODO_R3_PROPOSAL指向history-proposal.mjs绝对路径；独立TMPDIR/CARGO_TARGET_DIR，cargo +stable test --release --locked --lib --features tauri/custom-protocol。专项 single_cost_matrix、single_crash_boundaries、single_retention_checkpoint_restart 加 -- --ignored --nocapture。未新增依赖。
