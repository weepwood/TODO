# ActivityWatch 桌面运行验收与视觉精修

基线 0beedf553139095fddc1af05bbbddfe40e5d4b66，独立 feat/activity-tracking。沿用轻量只读 API；不恢复自研采集、存储或通信。用户未重新授权真实历史，因此本轮真实服务只读取 info/buckets 元数据。历史全部为隔离合成数据。

## 原生运行发现与修复
真实 Tauri + WKWebView 候选（独立应用标识 com.weepwood.todo.qa.activitywatch20261129、独立 SQLite 目录、仅加载实际 ActivityWatchView 与测试任务空集合、无云端入口、独立深链标识、不注册正式全局快捷键）。候选从基线 Git archive 与当前 UI 构建，在外部 qa-source 临时副本中仅把 report provider 指向 127.0.0.1:45681 合成服务，status 保持真实 5600，测试入口驱动原 UI 与实际 IPC。正式仓库没有可切换的任意 API URL、测试入口或 QA 标识。未安装应用或改变正式目录；仅有界运行该候选二进制及 fixture 子进程，结束后终止。不是完整正式客户端或签名安装包验收。

初次原生点击连接触发 reqwest 0.13.5 panic：Tauri updater 的 rustls-no-provider 特性合并使 HTTP-only Provider 初始化也需要 Rustls crypto provider。独立 provider 测试没有这一依赖图，cargo check 无法捕获运行时失败。实际 Cargo tree 已包含 rustls 0.23.46 的 ring 特性。复用该已锁定的传递依赖，桌面 IPC 初始化时仅在没有 provider 的情况下安装 ring 默认 provider，保留已有 provider；幂等且无额外包版本。没有变更系统 TLS 设置，不开放 HTTPS/远程 API。根 crate 实际依赖图新增定向回归 1/1（创建两次客户端，无 HTTP 请求）。全平台 cargo metadata 尝试因离线缺少 Android android_system_properties v0.1.6 而失败，未下载或更改全局环境；macOS 锁定编译与测试成功，lockfile 仅增加直接依赖引用。

修复后隔离 Tauri 运行13项检查全部通过：native runtime、默认无报告、网站默认关闭、真实元数据连接、固定合成日期、报告显示、标题不显示、排行筛选、筛选后唯一时间线、改授权范围清除、网站独立授权、断开清除及网站选项复位、不持久化活动报告。Fixture 实际事件请求顺序 app, afk, app, afk, web；真实事件请求为0。原失败证据保留。QA 使用真实 AppKit/WKWebView、真实 Tauri commands 和 provider 计算；仅报告 endpoint 与测试入口是隔离替换，不宣称已验收正式任务壳、全部桌面生命周期或真实历史读取。

## UI
复用现有 Lucide、Segmented、Module Card、Design Tokens；无新前端依赖。应用类型矢量图标（非 macOS 原生应用图标），域名统一本地图标，不请求 favicon、读取应用文件或外部服务。排行增加序号、时长、各排行分母内占比、紧凑进度条；颜色保留稳定映射。日期导航独立工具栏，隐私说明原文可展开；来源缺少网站时显示官方扩展提示。时间线5刻度、四分位网格、加高区间、紧凑明细；趋势图144px高度和网格，真实零值不再画成正柱。断开或连接失败清除网站授权选项。Chromium/WebKit各5/5，覆盖经典/Native亮暗色、390移动端、周期导航、图标、占比、隐私展开、时间线刻度及筛选；截图仅合成数据。前端316/316、Web build通过（原有chunk大小警告）。

## 网站来源排查
实际 v0.14.3 元数据：当前主机 currentwindow 与 afkstatus 各1；另有 unknown-host general.stopwatch 1，不是网页数据源。所有桶中 web.tab.current 为0。未打印主机/桶标识。常见 /Applications 浏览器目录发现 Microsoft Edge；只扫描 Chrome/Edge/Brave 常见扩展 manifest 与本地化名称，未找到 ActivityWatch。没有读取历史、Preferences、浏览器 URL 或打开现有 profile；无法排除其他安装目录、配置、禁用或自定义扩展。缺少官方扩展是合理原因而非完全证实。

官方 [aw-watcher-web](https://github.com/ActivityWatch/aw-watcher-web)、[Watchers](https://docs.activitywatch.net/en/latest/watchers.html)、[Chrome Web Store](https://chromewebstore.google.com/detail/activitywatch-web-watcher/nglaklhklhcoonedhgnpgddginnjdadi)。核对固定 HEAD 88ec6eab56a06d165f3f1cd3345622fe2d4dd1ef 的既有 web-main.ts/web-heartbeat.ts，hostname 从服务获取、读取活动标签元数据、心跳写入服务；v0.5.0 release notes说明修复旧 unknown hostname 并迁移 MV3。官方扩展自身可能记录完整 URL、标题、audible 与 incognito 状态，安装/启用及隐私配置须用户自行确认；TODO 只读匹配主机并排除明确隐私标记。建议用户在 Edge 打开官方商店链接，确认扩展权限和隐私设置，待元数据出现同主机 web.tab.current 后再授权具体日期/范围验收。不自动合并 unknown-host，不访问非本机事件，不安装扩展、不修改配置或申请权限。

## 验收与证据
/Volumes/data/AI-Development/artifacts/todo-activitywatch-desktop：元数据汇总、初次 panic、实际运行结果、QA source/fixture/runner、独立构建日志、合成截图和测试日志。原自主采集 crate 与文档保持零差异。真实网页历史、完整正式客户端、长周期/真实休眠锁屏、签名安装包和发布门禁尚未验收；本轮不扩大范围。
