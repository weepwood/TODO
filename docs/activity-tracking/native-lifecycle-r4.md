# Activity Tracking · 原生生命周期与 Native Messaging 隔离候选

基于 cea3cca，保持独立 feat/activity-tracking。范围为用户选定的 01/02/03/04/06/07，不开发浏览器扩展 UI 或自动安装，不连接正式 Tauri/账号/云端，不启用真实活动采集。沿用 r1-r3.md 的固定上游及许可证判断，无上游源码复制。Native Messaging 帧协议参考 Chrome 官方文档 https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging 。

## 实际实现
- Swift native_collector：显式 --isolated 1–60 秒；NSWorkspace 应用激活、睡眠/唤醒、会话激活/停用通知与2秒轮询；CGEventSource HID 输入空闲180秒阈值；CGSessionCopyCurrentDictionary 控制台会话检查。无窗口/网页标题、输入内容、截图、辅助功能、自动化、权限请求或网络。只允许 org.todo.fixture. 前缀的合成应用 ID；其他前台应用在 Swift 序列化前即排除。会话停用记 unknown，不把控制台会话存在当成屏幕解锁证据。当前没有可靠的真实锁屏适配，禁止将采样结果作为正式真实有效时间。没有回填空闲阈值边界，采样可能有延迟。
- native_ingest：有界 JSON Lines（4096字节、1000条），验证字段并再次检查允许名单；通过 Collector 写入独立 SQLite。关闭为默认；start/pause/resume/stop、时钟异常诊断、重启水位，不跨暂停/崩溃间隙补计活动。写入失败时不推进内存状态。当前 lifecycle API 尚未接入 UI 或进程监管；stop/pause 仅结算至最后观测，不推断尾部时长。
- Schema v2：事务迁移、来源质量 sampled/event/browser/unknown、诊断、保留期限水位、FIFO。相同区间和质量幂等，冲突整批回滚。保留策略只删除完全过期区间，跨边界区间保留，禁止已清理区间重放；没有自动执行保留、彻底擦除 WAL/备份、账号绑定或安全目录创建。覆盖率输出 (已知状态毫秒, 已记录毫秒, 查询范围毫秒)，excluded 是已知状态而不是有效活动；disabled/unknown 不计已知。无记录时间不能视为空闲。真实事件与两端 event 的区间质量不等于精确无误差。
- Native Messaging：独立 native_host 原型，4字节本机字节序、最多64KiB、256个区间/批、单区间至多1小时；版本、严格 JSON 字段、规范 ASCII 域名、明确 private=false、域名白名单和时间重叠验证。host 以明确本机配置的固定 fixture 设备/流写入，ACK 在事务提交后发送；错误响应不回显详情。CLI origin 精确匹配32字符扩展 ID；真正安全边界必须依靠浏览器安装的 allowed_origins 清单及安全的配置文件，argv 不能验证同用户本地进程身份。未注册 host 或安装扩展，未验证真实 Chrome/Edge 握手；现阶段只走 stdin/stdout 子进程。
- Queue：独立发送方数据库中有界持久 FIFO（最多1024项、单项64KiB），满时拒绝不丢旧数据；只 ACK 队首，重启保留并可重放；接收方已提交区间幂等。尚无浏览器端队列适配、ACK 消息 ID 自动绑定、退避/断线调度、过期队列清理或跨浏览器配置文件去重。发送端必须串行处理 ACK，不能把此原型当成完整传输服务。

## 可重复验收
使用现有 rustc +stable，离线锁文件构建，不安装全局组件。命令（在 crate 根目录）：
    cargo +stable test --offline --locked
    cargo +stable build --offline --locked --bins
    swiftc probes/native_collector.swift -o /独立产物目录/native-collector
    python3 probes/isolated_acceptance.py /独立产物目录/native-collector target/debug/native_ingest target/debug/native_host

20/20 Rust 测试（原12、新8）最终通过；初次新增测试一项因临时目录时钟粒度导致同名冲突失败，增加进程内原子序号并修正两组夹具后通过。新增覆盖生命周期、失败重试、失联与重启、隐私、v1迁移、保留、帧协议、队列及幂等。Swift 实际编译，隔离运行8秒，收到6次观测、5区间、8027ms，所有 subject 为空且状态均 excluded。未制造真实应用切换，不能将终止事件视为应用切换证据。真实进程宿主错误来源拒绝且不建库，帧往返、提交后强杀并丢弃ACK再重放、私密数据拒绝；独立 Python SQLite 写事务未提交时强杀，重新打开后仅原100ms已提交记录且 integrity_check=ok。后者验证 SQLite 故障语义，不等于 Rust 每个事务阶段均已注入故障。

本次 /usr/bin/time -l 实测 Swift 有界过程：8.31s real、0.01s user、0.00s sys（两位小数精度）、最大 RSS 9,732,096 bytes、peak memory footprint 2,605,608 bytes。仅单次默认排除路径，非真实高频切换、全链路或长期常驻性能，未测能耗/电池/功耗。未使用 sudo、powermetrics、真实用户历史数据库或改变权限。真实锁屏、睡眠、会话切换及长时间准确性需受控 GUI 验收；Rustfmt 仍缺失，未安装。

证据目录 /Volumes/data/AI-Development/artifacts/todo-activity-r4-native（初次失败日志、最终测试、Swift构建、隔离验收）。临时数据库自动删除；保留无真实身份的汇总证据。

## 下一步门禁
先验证明确锁屏信号、实际合成测试应用激活通知、休眠/会话边界、进程监督与显式用户授权，完善队列实际浏览器适配、消息关联与安全宿主注册配置，再开始产品接入；所有正式采集默认关闭。不得以本轮测试替代真实环境验证。不接云，不发布。
