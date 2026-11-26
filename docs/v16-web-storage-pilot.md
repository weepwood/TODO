# V1.6 Web 存储试验与正式切换门禁

日期：2026-11-26；基线：ecd536f。业务冻结，不直接迁移真实工作空间。

## 1. 方案及边界

上一阶段隔离真实浏览器实测 localStorage 的 10000 个默认完整字段任务无法首次写入，WebKit 的 4000 项完整备份也可能失败。采用浏览器原生 IndexedDB 事务（不加第三方依赖），复用现有原生 SQLite 的同步读取内存镜像/异步快照提交接口；不是把原生 SQLite 改成 IndexedDB。

试验仅在同时满足 VITE_TODO_IDB_PILOT=1、非原生、127.0.0.1:4178、会话标记 todo-idb-pilot=synthetic-only 时加载。Playwright 使用隔离浏览器 context 和合成夹具，禁止真实账号登录，禁用测试 service worker。普通开发服务 4197 和普通生产构建不启用，普通构建应无试验数据库 chunk。不能将会话标记用于真实数据迁移。本轮不提供公开激活入口。开发时运行：

```sh
# 遵守本机 resource-budget，使用隔离的 4178 测试服务器。
# TODO_BROWSER_ENGINE 可选 chromium / firefox / webkit。
TODO_IDB_PILOT=1 node node_modules/playwright/cli.js test e2e/ui-idb-pilot.spec.js --workers=1
```

## 2. 数据和事务

数据库 todo-web-workspace-pilot-v1，单对象仓 workspaces，固定 guest 记录。记录包含 scope、revision、mode、source（原始主数据/备份等允许键的精确字符串副本）、values（当前主数据/备份/元数据）。迁移先读原始数据，再校验主数据结构及允许键，事务内读取已有记录、若不存在则原子 add。原始 localStorage 完全保留，不覆盖、不删除。不允许主数据缺失但有备份的情况下创建空记录；原始损坏拒绝迁移。重复打开返回已有记录；原始工作空间改变则 fail closed；写入前再次核对原始键。没有云账号作用域迁移，其他本机偏好/附件索引/工作流等仍遵循现有存储。

写入前校验主数据，事务内检查 scope/mode/revision，单次 put 更新全部键；完成事件之后才更新已提交版本。使用 strict durability 提示，旧实现不支持选项时退回默认事务选项；不保证断电或异常浏览器关闭。请求错误/中止/配额异常不提交；复用内存镜像、flush、retry、pending/error 状态。并发旧版本拒绝覆盖，保留待保存内容供导出。数据库版本变化时关闭连接，升级阻塞时明确失败。浏览器仍可能回收非持久化 origin 数据，配额依引擎、磁盘与用户设置变化。

## 3. 迁移和回滚协议

- 初始迁移：原始数据 -> 校验 -> 单事务提交 -> 读取已提交记录 -> 工作台挂载。
- 迁移失败：不启动空工作台，不写原始存储；恢复页支持导出可读取的 IndexedDB 记录及原始数据。
- 普通保存：在内存镜像中合并主数据与备份写入，异步提交完整记录；未完成/未提交/错误时禁止静默离开（浏览器确认受浏览器策略限制）。事务失败可以导出当前内存数据或重试，不把导出当成保存。
- 无损回退：rollbackPilot 仅在 revision 精确匹配、模式 active、原始键未改变且当前全部键和原始数据完全一致时标记 retired；不删除 IDB 记录，不写 legacy；再次进入试验拒绝自动创建。当前实现为底层事务 API，尚未开放真实用户的回退 UI。
- 有修改/超配额：不允许直接切回 localStorage，先导出并由用户明确选择恢复目的地；大文件不能保证原存储可容纳。正式切换必须提供可核验的恢复文件、导入验证和防止旧客户端回退的控制。

## 4. 正式启用前仍需完成

1. 生产级独立迁移/恢复 UI，显式用户选择、迁移前后记录数量及摘要对照、双向备份导入验证、恢复部分不可读数据；避免通过清除标志来绕过已迁移版本。
2. 账号作用域、云同步事务与异步提交顺序、冲突备份、云端 3.5 MB 上限（与本机存储独立）、跨标签页及旧 PWA/SW 版本协调。未实测云账号，不能宣称已支持万级云同步。
3. 大型数据按记录或分片增量提交、独立长期内存/写放大和浏览器清理策略；当前仍为完整快照，解析、校验、备份与写入可能产生 O(n) 成本。其他本机工具仍有 localStorage 配额风险。
4. 真实物理设备、异常关机和浏览器关闭、磁盘不足、私密模式、持久化授权、升级阻塞、正式 CI 与独立 QA。冻结原始用户工作空间；不自动删除备份或迁移真实数据。

## 5. 参考资料（2026-11-26 核对）

- W3C Indexed Database API 3.0：https://www.w3.org/TR/IndexedDB/ （事务原子性、提交、durability 提示和错误中止）。
- MDN IDBDatabase.transaction：https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/transaction （事务模式与持久化选项）。
- MDN 使用 IndexedDB：https://developer.mozilla.org/zh-CN/docs/Web/API/IndexedDB_API/Using_IndexedDB （升级连接、blocked、versionchange、关闭边界）。
- MDN 存储配额及回收：https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria （浏览器配额、持久化及回收差异）。

实际验收记录和指标参见交接第三十节及外置证据目录。以上是试验架构，不是正式发布承诺。
