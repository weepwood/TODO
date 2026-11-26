# 存储性能剖析与安全优化

基线 09d89c8；同一 Mac、真实文件 SQLite、Rust Cargo release profile [optimized]，同一合成数据生成器，数据库位于系统临时目录，测试结束清理。6组，每组12次单任务修改、摘要/详情读取和相同快照保存；不含GUI、IPC、网络、完整领域属性或外置盘测量。每个任务初始1或5条合成活动。P50为排序后上中位数，12个样本的nearest-rank P95等于最大值，不能当作稳定尾延迟估计。先基线后优化，非严格硬件隔离，可能有其他开发负载。最终优化矩阵重新运行，非只引用中间结果。

## Release 对照（ms）

| 任务 | 活动/任务 | 快照字节 | 保存P50 基线→最终 | 保存P95 基线→最终 | 摘要P50 基线→最终 | 详情P50 基线→最终 |
|---:|---:|---:|---:|---:|---:|---:|
|1000|1|225693|6.327→5.443|11.035→6.494|2.474→0.438|2.364→0.458|
|1000|5|765253|19.831→16.129|32.521→17.706|8.205→1.425|8.110→1.465|
|5000|1|1141693|29.391→28.050|48.488→32.694|11.124→2.175|10.798→2.076|
|5000|5|3857253|84.637→84.385|106.134→94.002|38.580→7.599|38.138→7.366|
|10000|1|2286693|61.873→56.882|71.677→81.490|23.732→4.507|23.303→4.282|
|10000|5|7722253|165.743→166.092|204.346→211.220|73.839→14.813|73.309→14.408|

高密度万级摘要中位数约80%降低；保存中位数没有改善，尾样本甚至更高。调试构建上一轮1.95秒与本轮Release不可直接作为优化倍率。基线高密度单次JSON解析P50 18.616ms，canonical序列化+SHA256 31.561ms；最终20.311ms、30.373ms。分段独立回滚实验5次：两份JSON解析40.727–46.245ms、索引更新7.888–8.236ms、日志及指纹68.285–72.684ms、单次snapshot UPDATE SQL 2.499–3.603ms。分段不含commit、完整回执、释放及备份等，不能直接相加解释总耗时；证实解析、序列化/哈希和差异仍是重点。raw证明减少历史读取的完整JSON处理，但写入须维护新旧兼容的canonical及raw校验，不能消除大快照写入开销。

## 完整原生存储路径（persist_store）

独立万级、5活动/任务，8次/组；实验专用wal_autocheckpoint=0并在组间TRUNCATE，统计WAL文件字节，不代表真实SSD写入或实际长时间WAL。约9.38 MB store包含完整快照JSON字符串及合成元数据。未修改生产SQLite参数。

| 场景 | P50 ms 基线→优化 | WAL字节 基线→优化 |
|---|---:|---:|
| 相同存储 | 102.995→76.269 | 0→0 |
| 仅元数据 | 82.325→78.936 | 9492512→9492512 |
| 单任务编辑 | 189.177→181.398 | 17477072→17510032 |

该测量在单版本详情改动前完成；后者不影响持久化路径。原有FTS已经增量维护，旧版相同内容SQLite本身没有写WAL。条件UPDATE避免无意义更新和相关触发器执行，但不能宣称磁盘写入量下降。真实变更WAL略增，辅助证明也有少量存储成本。现有snapshot和workspace_store仍保留完整JSON；不改正式数据布局，不引入新的分块存储或迁移。在后续增量设计前需要明确跨端数据权威、兼容/降级、备份、回执、恢复证据和双写期间崩溃正确性。

## 安全与兼容
- 既有canonical指纹继续作为历史证据。辅助表operation_history_raw_proof仅在已验证快照保存的同一事务更新，绑定scope/version/canonical/raw hash。读取实际字节重新哈希；缺证据或字节变化回退原完整验证。旧程序不同序列化但相同语义不误判；真实业务改变检测gap。旧程序直接写入导致断层仍拒绝恢复；同OS用户可访问数据库并非安全沙箱。
- 摘要SQL只返回count/gap及元数据，不将正文转为Rust Value。按单版本详情不加载其他正文、仍限制scope、时间、预算；历史恢复读取连续日志并保持原校验。读事务保证一致视图。只新增可重建辅助表，不改既有表格式或正式数据库。
- 同条件Release矩阵及完整store实验、分段实验通过；最终Release Rust26/26，强杀WAL恢复两边界（57712字节），领域60/60、历史浏览器1/1（模拟IPC），前端及Release原生构建。新隔离QA com.weepwood.todo.qa.historyperf仅从确认全合成的旧QA SQLite使用backup API复制；无探针实际运行，旧V24读取、V1详情、V24恢复预览，新任务V25、单版本查询及proof确认，11任务/78 saved/2 cancelled/无pending/完整性ok。没有执行恢复提交、真实双端或模型会话。
- 正式应用路径~/Applications/TODO.app，bundle ID com.weepwood.todo，版本1.2.0-alpha.1，ad-hoc签名完整、无Team ID，运行中；只读文件元数据发现主库4096B/WAL177192B/SHM32768B，大小为检查时快照，不可据此判断真实任务数。未打开数据库、停机或安装；全局CLI v4 34项不变。正式安装须用户另行授权：停止应用后核验一致备份（SQLite及WAL、WebView、原应用与相关配置），在隔离副本验证新版本启动、旧数据和回执、恢复、兼容/降级限制，再更换正式包并真人确认。不能用QA二进制替换正式应用。
- 证据目录 /Volumes/data/AI-Development/artifacts/TODO/history-storage-perf/，base-release.log、optimized-final-matrix.log、phases.log、base-store.log、optimized-store.log、release-final.log、release-crash.log、domain.log、browser.log、native-report.json、install-preflight.txt。基准复现：在隔离源码和已构建前端条件下执行 cargo test --release --locked --lib --features tauri/custom-protocol history_release_matrix -- --ignored --nocapture；另两个测试名 native_store_write_amplification、profile_storage_phases。正式发布仍未就绪，需更多重复样本和真实完整工作空间、UI端到端及跨端验收。
