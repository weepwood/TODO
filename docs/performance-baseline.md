# V1.2 合成工作空间性能基准

实际测量环境：2026-11-25，Apple M4，darwin arm64，Node v26.12.0。合成记录，不读取真实任务或账号数据。3次预热，20次计时，P95取升序第19个样本；GC后记录夹具保留堆增量（不是浏览器或进程总内存）。

| 规模 | 命令匹配 P95 | 标题排序 P95 | 夹具堆增量 |
|---|---:|---:|---:|
| 1,000 | 0.36 ms | 3.21 ms | 228,912 bytes |
| 10,000 | 2.37 ms | 32.99 ms | 1,729,168 bytes |

复现：`node --expose-gc scripts/benchmark-workspace.mjs`。这是纯算法基线，不包含React渲染、输入事件、原生SQLite、浏览器存储或网络，不能视为实际交互延迟。完整JSON保存在本机外置artifacts/TODO/design-system-algorithms.json。

浏览器补充基准：`e2e/ui-performance-baseline.spec.js`使用隔离合成工作空间，测量导航至首行可见、DOM渲染行数、输入至命令选项可见（5次样本）、Chromium可用JS堆快照；输出test-results/performance-*.json和截图。5次样本的P95仅为描述性最大值附近观测，不作稳定统计承诺。当前本机资源门禁阻止最终浏览器执行，待CI结果。长期内存泄漏、真实设备与虚拟列表拖拽不在此测量中，保留超过300项禁用拖拽的限制。
