# R4 实际原生增量集成研究（2026-11-26）

基线0bf2d9d，独立feat/incremental-storage-research。采用隔离真实Tauri WebView研究程序，不接入正式React桌面主界面、托盘、快捷键、通知、账号、自动更新或网络。正式run()/main入口及存储路径不改。R4完成部分原生集成正确性验收；第二轮长时/快路径实际验证因WebView停滞未收口，不能当作发布候选。

## 1. 隔离原生IPC

显式Cargo feature research-r4、独立bin todo-r4-lab，仅feature编译研究命令；build manifest按feature声明权限。构建时复制研究源码至独立artifacts目录，prepare-r4.py仅允许固定非Git复制目录，替换配置为com.weepwood.todo.qa.r4、单main窗口、无外部网络CSP、仅R4 capability。使用已有esbuild打包合成页面；cargo +stable release --locked --bin todo-r4-lab --features research-r4,tauri/custom-protocol。直接运行独立二进制，无安装/正式bundle/签名发布。setup强制匹配Bundle ID、固定artifacts/run canonical路径，专用r4-research.sqlite3文件、拒绝符号链接，已有库必须有R3标识；只开放固定guest合成scope及main窗口。正常生产构建没有R4 handler。隔离并非恶意同OS用户沙箱。未联网、未使用真实账号/任务/数据库。
r4_seed、load、commit、journal、enqueue、receipt、checkpoint、report连接实际WebView invoke和R3单权威事务。seed只允许合成qa-*标识，不能重置已有库，利用原有CLI bind/advanced在合成库建立测试许可后迁移；测试确认元数据是合成，不是真实用户授权。每次envelope验证scope/base/id/patch/receipt，实际Rust CAS/回执/正式history_apply校验，ACK含scope/id/revision/fingerprint/nativeMs；前端以实际Rust canonical原始字符串计算snapshotFingerprint，readConsistentHistory检查同一已提交工作空间，不将JS JSON.stringify字节误当Rust canonical。定期独立JS语义重放及native完整export对照。普通编辑、正式回执保留、全量fallback保留所有store keys；没有把元数据默认为空。真实CLI进程未连接本研究DB，结构化请求由专用IPC调用真实Rust enqueue/receipt，真实UI确认未验收。

## 2. 原生首轮及重启

Release原生首轮10,000合成任务（真实newTask，低初始活动密度，非R3五活动/任务密度）；共享编辑器、实际WebView IPC和正式Rust事务，11个命名检查：创建、批量及提交前失败重试、排序、完成、重开、重复实例、系列修改、父子关联+metadata、现有三方合并+显式完整store fallback、实际prepareHistory/持久化preview/apply及提交后模拟丢失响应、真实IPC队列普通编辑合并及原envelope重试。正式update/preview/apply三条真实Rust结构化请求均saved；history-apply复用正式权限/确认/字段范围，确认内容由测试构造。此处真实队列丢ACK发生在普通编辑；带CLI回执的丢ACK由单独实际history-apply验证，真实队列内CLI barrier仍需下一轮，已有队列独立模拟测试覆盖。原同步opaque base保持，不含实际双端同步或Supabase调用。
首轮完成44持久化revision、10,002任务、42正式history head、44 transport ACK、零当前完整snapshots/store、零pending、integrity ok。实际关闭owned实验进程后再启动完整WebView，revision/任务数/history/指纹与首轮完全一致。fingerprint 311160242c42e3d8ee3471b22085e552863a0e62d02d29e8cee5eeffb4933413。此处关闭进程不是提交中强杀；R3强杀证据保留，不宣称新R4 GUI提交中强杀通过。

## 3. 类型化变更捕获与实际阻塞

capture.mjs受控API新增create、batch(title/priority，1–100项、现有任务、唯一ID、范围/字段白名单)、reorder、complete/reopen、parent（canLink拒绝循环）、tag跨实体。统一applyWorkspaceEdit、内部操作元数据、锁定保护、现有领域逻辑；只有受控existing-row batch走diffSealed减少全量migrateState/replay，其余仍完整plan；未知/自动化/导入走保守路径。Node独立测试七类操作与R2 plan/replay/migrateState一致、拒绝循环/未知字段/重复创建/无效日期/超范围优先级。浏览器TextEncoder代替Node Buffer计量，不更改正式编辑器。
第二个Release研究二进制在同一隔离库执行类型化阶段：完成前五个提交（创建、批量、排序、完成、重开），revision49后持续不推进且无报告、native/WebKit进程采样CPU为0；检查时系统Swap已使用约9489MiB（16GiB RAM），资源压力是相关背景，不证明根因。仅停止owned实验进程，不停止其他服务。剩余父子及跨实体类型化路径只有Node独立测试通过，首轮原生保守路径对应功能已通过，但类型化路径原生未完成；60次额外快路径性能采样及更长240次耐久未运行，不记通过。未执行的durability模式代码已撤回。不能把停滞归因于已证明的存储缺陷，也不能声明修复。
独立只读SQLite校验全部任务body hash、head/fingerprint、无pending、无完整当前snapshots/store、3个正式回执；最终49版本/49 ACK/10,003任务/history46，integrity ok。在线SQLite backup至独立新文件backup-v49.sqlite3，重开integrity、head及11表行数一致（非逐字节全库对照）。再次启动真实WebView以保守完整校验、history handshake和checkpoint复验v49通过，fingerprint 0cc7822104c3373f6bc74beab1c916665eff4a6f99397a65353891eea45e069a。保留原生停滞证据和首轮报告，不覆盖。
旧已安装CLI实际 todo --data-dir <R4 run> doctor返回exit2/database not found，未创建todo.sqlite3；专用文件名门禁有效，不代表正式迁移后旧二进制全面兼容。没有直接运行真实旧版GUI或双端同步；R3迁移/降级契约仍保持。

## 4. 实际WebView性能及资源

首轮30次现有任务优先级编辑，真实共享编辑器+完整R2 plan、真实IPC、真实Rust行权威保存，期间每10次独立完整对账不计入计时。WebKit performance.now分辨率有限，非独占设备，样本30。非同条件正式旧GUI对照，不宣称端到端提速。

|阶段|P50 ms|P95 ms|max ms|
|---|---:|---:|---:|
|编辑及保守变更捕获|487|599|672|
|IPC往返（含原生提交）|208|492|640|
|原生提交（IPC内部）|106.387|476.335|550.535|

主要剩余瓶颈是前端保守全量领域验证/重放及原生仍需全体字节校验。IPC与原生时间有重叠，不直接相加。第二轮实际fast阶段没有完成60采样，不能给优化后的WebView性能结论。首轮某时刻采样native RSS288704KiB、WebKit WebContent477616KiB（不同采样时刻）；第二轮native采样最大315328KiB，非全进程组峰值/独占归因。未完成数小时运行、真实设备物理写入、长时内存增长或万级历史恢复性能矩阵。最终checkpoint后WAL清零，非SSD写入量。

## 5. 局部读取与增量证明实验

独立test-only incremental_local_proof在首轮成功DB的SQLite backup副本上，先以R3完整export构建绑定revision的256桶有序ID/pos/body hash manifest与root。读一个桶按经审计成员的主键查实际行，核对ID/pos/body SHA256及bucket hash；旧revision拒绝。R3 canonical事务成功后对已知既有行替换增量更新对应桶；结构、metadata或不完整变更集必须重新审计。独立每10次全量重建根，30次一致；选中桶损坏拒绝、未选中桶损坏只有完整审计发现（故意破坏的是单独proof-copy.sqlite3，不是已验收native DB）。证明依赖可信完整变更集与revision，未提供跨进程持久化可信根/防篡改保证，不授权写入，不取代R3 canonical指纹。
真实文件复制库30次：初始完整审计310.727ms，局部读取P50/P95 0.225/0.449ms（每桶30–51行），增量证明更新P50 0.054ms。成本不含建立证明、R3完整写入、IPC，不能宣称完整保存0.225ms。此轮正式写入仍需全体字节校验，局部读取仅研究候选。

## 6. 回归与采用结论

最终默认feature路径Release Rust41/41（16 ignored，R2/R3实际fixture/proposal均传入；新增local proof专项1/1），JS定向60/60，新增类型化捕获与队列2/2。两次真实原生重启对账；首轮11检查通过，第二轮5提交已保存但整体停滞，不能判定R4完整验收通过。原有12个强杀边界为R3累计证据，本轮未重新运行全部。没有新增依赖。保留既有正式快照为生产权威，不采用R4，不合并、不发布、不安装。下一阶段优先定位WebView停滞（资源低压环境、阶段化报告/超时、可恢复fixture），真实队列CLI barrier、快路径万级同条件及长耐久；再考虑局部指纹写入信任链、跨端同步、正式旧客户端协议、传输回执保留策略。不要重复全量研发或把原型直接接入正式应用。

证据 /Volumes/data/AI-Development/artifacts/TODO/incremental-native-r4/：build.log/build-fast.log、native-first.log/native-fast.log/native-restart-v49.log、run/first.json、run/restart-v44.json、run/fast-partial.json、run/restart.json、rss-fast.log、backup-v49.sqlite3、proof.log（故意损坏的proof-copy仅实验）、capture-final.log、domain.log、release-final.log、old-cli-gate.log。构建复现：独立artifacts/source复制研究源码，使用现有node_modules，python3 research/incremental/prepare-r4.py <source>，esbuild research/incremental/native-r4.mjs --bundle --platform=browser --format=esm --outfile=dist/native-r4.js，复制native-r4.html到dist；cargo +stable build --release --locked --bin todo-r4-lab --features research-r4,tauri/custom-protocol，专用CARGO_TARGET_DIR/TMPDIR。设置TODO_R4_RUN_DIR为固定artifacts/run，直接运行独立bin；默认新库自动首轮、已有库只重启验证。TODO_R4_PHASE=fast仅对初次44版本合成库一次性执行，停滞后不应原样重跑（存在已创建ID）。用外层受控超时管理owned进程，绝不删原库或操作其他应用。局部证明使用独立SQLite backup副本、TODO_R4_PROOF_COPY指向proof-copy.sqlite3，cargo test audited_local_read_and_incremental_proof -- --ignored --nocapture，测试会故意损坏副本，禁止传正式路径。
