# Alpha.3 最终发布门禁（本地验收）

基线 02b246c79ce8c6d3525a15286993fbde60aedb83。读取 activitywatch-release-audit.md 和 AGENTS.md，工作树初始干净；fetch 与两次 ls-remote 核对远端 main=49aa0885e76cb8edd4df7e026aaf54d72e1a36d9，0:11，无分叉。远端仅 alpha.1/alpha.2 标签，未见 feat/activity-tracking 或 alpha.3。GitHub connector 核实 main 提交记录（Alpha.2 手动预发行，真实OAuth、注册、完整升级及自动更新门禁未完成），候选 PR workflow 查询为空（仅 PR 查询，不能推断所有事件）；本机 gh API/GraphQL EOF，未核实远端 secret/variable 配置，未读取密钥。未推送/合并/触发远程工作流/发布。

## 完整累计UI与失败治理
- 按 ui-review 的合成环境变量、Chromium channel、现有 ci-scope release / ci-run-browser，2 workers，完整122文件391项；无上一轮150秒截断。Node v26.12.0/Playwright 1.65.1，本地 macOS，不是 Node22 Ubuntu CI；既有依赖缓存，不代表 clean npm ci。单测324/324、Web build通过（旧chunk警告）。
- 原始全量472916.986ms：363通过、5失败、23原有条件跳过、0未运行。原 ci-list 与 ci-result 测试ID集合严格一致，全部391项有结果。跳过18项冻结实验性迁移/分片、1项需独立PG/API、4项专用压力/堆/持续会话资源预算；未新增skip或降低门禁。
- 修正4文件5个失败：选中态测试保留19px/5px与3px间距，改为实际相邻today/upcoming、inbox/work；v16-second/third 从任务交换返回设置后重新选本地数据，保留原层级导入/备份完整性/不覆盖断言；日历补充段标签由10时改为实际10:00，保留真实拖放和主段不变断言；v07使用逐字符Shift+ArrowLeft替代平台差异Home/Shift+End，增加实际选中文本检查，保留粗体、Markdown往返及复杂源文保护断言。5/5定向通过，4个修改文件完整21/21。原始失败、截图和两轮复验均保留。
- 独立核对原始391 ID与21项复验ID，全部原失败均包含在通过的复验中。累计368通过+23既有条件跳过，**不等于一次无失败的最终SHA全量**。保留原始失败报告；不得合成全绿 CI 结果。此次仅测试和文档变更，生产代码/依赖/工作流相对4335274无差异，未重复未受影响的原生测试和原始全量；最终提交仍须按正式同一SHA门禁执行成功的远程手动完整UI。未降低门禁。

## 新增升级与制品检查
- 旧 alpha.2 tag 18450487 与当前候选真实生产构建同一隔离 origin（45688），CI合成云配置、外网请求阻断。实际旧Service Worker 9b2e844fd1ca0663 切换至新 687c78e65b41acd7，旧任务数据一致，新线程离线重载、写入、再次重载通过。前两次测试驱动在切换中读取状态过早失败，保留日志；最终以新构建实际worker版本为准，等待并校验。非正式PWA设备安装或线上升级。
- 复核上一轮 .app 的 codesign --verify --deep --strict 与 SHA256 b9b5d40e8d887bd0776317e46068e056480e53d40f3595fa34ded3a45798bf74；生产源码/依赖/工作流/公开资源零差异，沿用既有原生14、Provider15、Firefox/WebKit各5、Web旧新8及原生旧新10项证据（两scope、3旧备份、FTS、integrity_check、双正常退出，活动请求0）。未将既有制品宣称为新提交精确SHA签名包。
- 从既有ad-hoc app复制制作独立本地QA DMG，hdiutil verify内部CRC通过；只读挂载被远程会话拒绝权限，未改权限或尝试绕过，未安装或启动正式标识软件。非Tauri正式DMG和公证/升级证据。

## 跨平台与签名门禁
- release-config版本通过：alpha.3、preview、Android102003。正式 signed-release.yml 先核验精确SHA手动full UI，再检查两公开变量及四secret（TODO_UPDATER_PUBLIC_KEY、TODO_ANDROID_CERT_SHA256、TODO_SIGN_UPDATER_KEY、TODO_SIGN_UPDATER_PASSWORD、TODO_SIGN_ANDROID_KEYSTORE、TODO_SIGN_ANDROID_PASSWORD），再 Windows x64 NSIS、macOS ARM64 app/dmg及updater签名、Android ARM64 非debug APK固定证书，产物摘要与BUILD_COMMIT，仅创建草稿。promote-release仍须独立运行证据与明确人工确认；未运行、未读取私钥或实际签名配置。updater签名不等于 Windows Authenticode/macOS Developer ID及Apple公证。
- Rust锁定离线cargo tree：macOS ARM64成功；Windows缺constant_time_eq 0.6.2、Android缺android_system_properties 0.1.6缓存，环境拒绝离线解析，不是已证实代码编译失败。cargo metadata --no-deps 确认ActivityWatch、rustls、desktop updater排除Android/iOS，todo-mobile仅Android；不是对应平台编译验收。仅安装aarch64-apple-darwin目标，未见ADB/SDK/NDK、Windows工具链或独立虚拟机。无权触发远程发布或新增基础设施；正式Windows/Android构建及真机运行、正式签名及同证书覆盖升级、真实认证、原生Safari/公证仍未验收。
- 保持真实ActivityWatch读取须另行授权的边界；本轮未连接真实服务、未访问正式数据、未改系统权限或云配置。自研原型继续冻结。现有本地规则与用户数据不动。

## 结论
本地累计测试清单已全部核对且失败均完成定向复验，现有生产候选不扩功能。正式发布准入仍不通过：最终SHA同次完整UI远程门禁、三平台正式制品/签名和安装升级、真实认证与相关实际设备证据未完成。保留原始失败，不推送、不合并、不触发发布、不发布。证据目录 /Volumes/data/AI-Development/artifacts/todo-activitywatch-final.6aXLdq（初始完整JSON、清单、复验JSON、coverage-reconciliation、升级脚本和日志、DMG、依赖解析、GitHub只读查询失败日志）。下一步仅在另行授权后执行最终SHA远程门禁与真实隔离设备验收。
