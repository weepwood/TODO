# ActivityWatch 轻量集成 · 本地候选

## 决策与范围

基线 ccd8c20e000f118946e00540d7321ce9b3deb346，独立 feat/activity-tracking。用户明确从自主采集改为复用 ActivityWatch。冻结 src-tauri/activity-core 及 R1–R4 原始研究、日志、历史提交；不再开发自研 watcher、宿主、队列或 SQLite 活动库，不把该 crate 接入正式应用。前序证据留在 todo-activity-r1-r3、todo-activity-r4-native。发布工作区、main 和正式数据保持不变。

## 上游核对及许可证

- [官方 REST API](https://docs.activitywatch.net/en/latest/api/rest.html)：info、buckets、events 查询范围、RFC3339、秒为时长单位、返回顺序与 limit；Python 和 Rust 服务错误响应有差异。API 尚未冻结；本候选接受 0.13/0.14 版本族，不能承诺所有版本真实兼容。
- [官方标准查询](https://docs.activitywatch.net/en/latest/examples/querying-data.html)；实际读取固定 [aw-webui queries.ts](https://github.com/ActivityWatch/aw-webui/blob/db9da795f8d035401649eab900bd03808483cb49/src/queries.ts)：窗口、AFK、浏览器区间匹配、flood、filter_period_intersect、浏览器与前台匹配。MPL-2.0 LICENSE.txt 已取得。TODO 复用 REST 协议和区间交集思想，不复制代码，不使用 flood 补缺、不把可闻后台活动算作有效时间，故与官方 Web UI 口径可能不同。
- [现行 Rust 客户端](https://github.com/ActivityWatch/aw-server-rust/blob/95837c33f41d9e0a36e3cee95993077885263366/aw-client-rust/src/lib.rs)：实际读取 AwClient、reqwest、URL、认证配置；同提交 MPL-2.0 LICENSE 已取得。旧 aw-client-rust 独立仓库归档。采用 TODO 已锁定 reqwest 0.13.5、chrono、serde，不引入 ActivityWatch 运行依赖，也不复制上游源码。完整上游副本仅在外部研究产物，不进入 TODO。
- 本机 /Applications/ActivityWatch.app 的 Info.plist 显示 0.14.3；lsof 发现已有 aw-server 监听 127.0.0.1:5600。仅观察安装版本和监听地址，未向该服务发出请求、未访问 bucket/事件/数据库、未启动或停止已有程序、未修改设置、未安装扩展、未申请权限。GitHub API 目录枚举返回 404，改用固定 SHA 的 raw 文件读取，实际源码和许可证已保留。

## 实现

新独立轻量 provider crate src-tauri/activitywatch-provider，无数据库、无后台采集。仅桌面主窗口增加 native_activitywatch_status / native_activitywatch_report 两个 IPC，移动/录入窗口无权限。连接检测由显式按钮触发，仅查询 info/buckets 元数据；选定日期再按按钮授权读取。consent 参数和窗口 ACL 是本应用交互约束，不是对本机恶意进程的认证；ActivityWatch 自身 API 默认可能无认证。本版不支持启用 API key 的实例，不接受任意 URL/端口，不发 POST/PUT/DELETE，不跟随重定向、不走代理；请求固定 IPv4 loopback，连接2秒/单请求5秒超时。使用单个本地日期（最长26小时，包括DST），每流20,000事件上限（多取1条判断截断），每响应8MiB上限；异常、缺必要数据源、重叠冲突明确拒绝，绝不静默计算截断数据。

当前仅选择 server info hostname 对应的唯一 currentwindow 和 afkstatus；其他主机不访问事件。事件按照半开区间裁剪、排序、同主体重叠合并、不同主体重叠拒绝。共同覆盖率=应用状态与已知 AFK 状态交集/所选查询范围；有效应用时间只计 not-afk 的交集，缺失不算空闲。Chrome/Edge/Firefox/Brave/Chromium/Safari 识别采用明确应用名称和 bucket 前缀映射，重复浏览器 bucket 跳过；实际 watcher 命名、多个 profile、多设备、历史同步桶仍待真实验收。网页时长仅统计前台对应浏览器内有效的已识别域名区间，属于有效应用时间子集。没有网页源时标为未知。域名为 URL hostname（含子域），不保留 path/query/fragment、凭据、IP、localhost/.local、窗口标题；只排除来源明确标记的 private/incognito，旧记录缺标无法判定隐私模式。原始 REST 响应可能包含 URL 和标题，仅在 Rust 内存临时处理，不返回原始事件、不写文件、不上云。已排除区间仍参与重叠校验。不能阻止 ActivityWatch 自身记录敏感数据，使用前须由用户核对其隐私配置。

实际 UI：工作台工具→活动分析，移动端更多入口；复用 Module Card、WorkspaceMetrics、原有主题令牌。连接状态、显式授权、离线错误、断开清除、日期过滤、应用/网站排行、应用活动时间线及覆盖率。页面卸载/账号切换/日期修改清理旧结果并丢弃过期异步响应（请求本身在超时内可能结束）；不保存授权或报告。Web/PWA 禁止本地 API 访问，可主动查看明确标注的合成示例；示例关联只用示例任务，不混用真实业务。每项任务展示整体预计时间、当日规划块（含补充分段）、专注记录与活动时间重合；使用已有 uniqueWallInstant / expandPlanBlocks，去重同任务重叠，裁剪查询范围，专注起点+记账秒数为近似，不证明任务实际投入，任务间重叠不可加总，不自动写回或同步。

## 验收和未完成项

- 独立 Rust 9/9（随机端口模拟 HTTP 服务，真实 GET 请求路径、日期/limit、标准夹具区间算术、元数据检查、缺 AFK、错误版本、重定向/认证/错误响应、域名/隐私/重叠、无网站源）。单独测试未使用真实服务。
- TODO 前端 311/311（含新3项日期、关联、重叠及原状态不变测试）。初次 ACL 审计只解析同步命令，改为解析 async fn 并加桌面专属权限断言，原全部权限检查保留；失败日志保留。
- macOS Tauri --lib cargo check --offline --locked 通过，Vite 生产构建通过（原有 chunk 警告）。未构建安装包、未运行正式 Tauri IPC 链路。
- Chromium、WebKit 各3/3 实际生产 Web 界面测试（1440 Classic light、1440 Native dark、390 Native light），网络拦截非隔离 origin，主动示例、默认不连接、日期重置、无活动持久化及横向溢出检查；3张最终实际截图。不是实际 ActivityWatch 连接/桌面 IPC 或 Firefox、Windows、Linux、Android 验收。
- 已核验 ccd8c20 至本轮活动自研 crate、两份历史研究文档差异为零。未复跑未改变的原20项自主采集测试。
- 证据目录 /Volumes/data/AI-Development/artifacts/todo-activitywatch-integration，含固定源码、许可证、构建、原失败和最终日志及截图；无真实活动数据。

后续仅在用户授权读取选定真实日期后验证真实 ActivityWatch API、数据桶兼容性、锁屏休眠及 AFK 口径对照、原生 IPC 实际界面与连接异常、数据上限和多浏览器覆盖。先取得真实数据证据再考虑优化；不恢复自主采集和本地持久化，不接云端，不发布。
