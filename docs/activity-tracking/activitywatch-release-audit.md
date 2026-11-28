# ActivityWatch 正式发布前审查（本地冻结候选）

审查基线 4335274e103536c1f6c5021a7ce37d06eb31ea28。git fetch --no-tags origin main 与 ls-remote 两次复核远端 main=49aa0885e76cb8edd4df7e026aaf54d72e1a36d9，是候选直接祖先，0:10，累计118文件、+5689/-223，包含前期设计词汇、双主题、设置分页、侧栏长按排序、连续折叠及活动统计，不仅是 ActivityWatch。未合并、变基或移动正式工作树。alpha.2 标签 18450487a437c37a836d0ba1a84d642c38daca93 与当前远端 main 文件树一致；候选 alpha.3、Android 102003，远端未见 alpha.3 标签。只读远端核验，不推送、不发布。

## 累计验收及修正
- 完整前端单测324/324、实际完整 Tauri 根 crate 单测14/14（含 SQLite、索引、备份、事务、隔离）、Provider15/15；生产 Web 构建通过（原 chunk 警告保留）。
- 正式 release scope 122个文件、391项测试。第一次 Chromium 本地全量按5失败上限停止，18通过/5失败/1中断/367未运行；5项均为旧设置布局导航。累计核查并在9个历史测试文件补充具体分类导航，保持业务断言。定向19项首次17通过、2个日历触摸拖放失败：目标06:00被新版08:00初始滚动裁剪，补充滚动至目标及命中验证，日/周两项复验通过。
- 第二轮全量按本轮150秒本地预算有界结束；日志124通过、2失败、1按既有条件跳过，264项没有完成记录，绝非完整通过。两项详情问题：一是记录取消操作时下拉焦点尚未稳定（单线程原断言复现测试通过，双线程全量发生一次失焦提交；不能证明不存在产品竞态），先等待优先级恢复焦点、核实数字控件实际聚焦并增加恢复30分钟值的断言；二是 viewport Y 被自动滚动改变，测量卡片相对详情内容的坐标，保持2px布局断言。双线程重复各3次合计6/6，未删除原业务断言；共享控件生产代码未改。第二轮限时结束后仅终止本次遗留的4178 Vite进程，未停止其他预览。两轮原始日志、失败截图、复验日志保留。须在最终提交完整执行122文件正式门禁；不得用定向复验代替。
- Firefox/WebKit 实际独立浏览器各5/5（启动、任务、活动合成报告、规则检索、主题），Firefox 启动问题本次未复现；非全站认证，也非原生 Safari。累计 UI 测试共修订11个文件，仅测试导航/坐标/焦点及加强断言。生产 src、src-tauri、依赖与工作流相对4335274零差异，冻结自研原型及原证据相对ccd8c20零差异；未新增产品功能。

## 构建、签名及版本门禁
在外部 bundle-source 用4335274归档及既有锁定依赖缓存构建实际 macOS ARM64 Release .app，17.70MiB；显式 ad-hoc signingIdentity=-，禁用 updater artifacts，未使用正式签名密钥；codesign --verify --deep --strict 通过、Mach-O arm64、com.weepwood.todo、1.2.0-alpha.3；二进制 SHA256 b9b5d40e8d887bd0776317e46068e056480e53d40f3595fa34ded3a45798bf74。复制制品到证据目录，不安装不运行正式标识应用。不代表 clean npm ci、签名 updater、Developer ID 或公证。签名 preflight 在清空环境的受控测试中拒绝缺少配置；未读取、验证实际生产私钥或正式 CI secret，不据此推断其存在/不存在。当前仅 aarch64-apple-darwin Rust target；没有 Windows/Android 独立构建或运行环境证据。正式 signed-release/promote-release 仍要求精确候选 SHA 的成功手动全量 UI、签名制品及 Android runtime 等，未触发远程工作流。正式签名、安装包、跨平台/原生 Safari、实际认证及 updater 升级门禁未通过验收。

## 原有数据保护及升级
- Web：以实际 alpha.2 tag 和4335274的生产静态资源，在同一个独立浏览器 origin 45685 切换版本，外部网络路由阻断、Service Worker 禁用（非PWA升级验收）。真实创建合成任务/附件，升级后 tasks/lists/sessions 对比一致，dark/teal 保留，默认 Classic 迁移，附件实际下载字节一致。8项检查通过。
- 原生：旧/新分别由真实 alpha.2、4335274 源码归档构建完整 Tauri Debug 主壳，QA 副本仅替换应用和深链标识、本地假云/API地址及 CSP、自动化入口。首次旧版图标按钮按文字定位错误失败；第二次旧/新从不同裸执行路径启动，SQLite 两账号及索引通过，外观失败。保留各失败日志及各自独立目录。最终使用同一隔离标识 com.weepwood.todo.qa.activityupgradepath20261129、同一启动路径依次替换旧/新QA二进制，不触及正式应用。旧3项、新7项运行检查均通过，均按原生退出事件 flush 正常退出0；独立只读 SQLite 验证两个作用域 tasks/lists/sessions 一致、3份旧备份原行保留、FTS索引相等、非当前账号 store 完全一致、integrity_check ok。旧合成数据库另存备份。新旧外观 dark/teal/classic 通过。ActivityWatch历史请求0、其他意外本地请求0。没有签名安装包覆盖安装、系统安装器、updater签名升级或真实用户数据迁移；不得将这个隔离实验等同正式升级门禁。
- 审查 ActivityWatch 本机 loopback、GET、无代理/重定向、响应/条数/范围上限、当前主机匹配、网站单独授权、桌面主窗口ACL、内存结果、独立本机规则配置、退出/暂停清理；与云端工作区 snapshot 和 SQLite业务 schema 不相交。生产代码零改动；未连接真实 ActivityWatch、未读取真实历史、未使用真实账号或安装扩展。真实网页、锁屏、休眠、跨午夜及真实年度性能仍待单独授权验收。

## 发布结论
本地候选继续冻结，只提交11个测试修正及验收文档。正式发布准入 **未通过/证据不完整**：完整391项门禁未完成、最终提交精确SHA远程UI门禁未执行、Windows/Android及正式签名/公证/安装器与真实升级未验收。不要推送、合并、打Tag、发布或降低现有门禁。证据：/Volumes/data/AI-Development/artifacts/todo-activitywatch-release-audit（完整两轮日志、复验、macOS制品、SHA、旧新源码与合成升级证据）。本次本地构建使用既有离线缓存，不修改全局依赖。保留正式用户数据与并行工作。
