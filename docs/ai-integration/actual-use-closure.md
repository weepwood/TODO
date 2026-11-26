# AI 实际使用集成候选
## 版本和兼容性
基线 CLI 056d798 / 规划3d47350。独立候选分支 feat/ai-use-candidate；五个核心模块及规划质量测试一致，仅纳入四处遗漏UI修改和七个浏览器测试文件。无新业务操作、依赖或远程服务。两个原分支与正式main均不修改。
## 可复验的证据
独立macOS候选 com.weepwood.todo.qa.aiuse，合成云配置。QA限定包装器只将获准测试操作指向该目录，不可用于正式工作空间。真实设置授权探针仅存在于测试构建，实际验证采用无探针二进制。证据位于 /Volumes/data/AI-Development/artifacts/TODO/ai-use-closure/：
- domain.log 38/38；rust.log 16/16；browser.log 26/26；build.log、native.log 构建通过。
- native-report.json：六组真实WebView业务，11个合成任务、36 saved、5 cancelled。
- model-session-report.json：Codex真实模型会话退出0，创建和context成功；并发review被单请求队列拒绝。Claude登录正常，但真实会话100秒超时，没有CLI调用回执。不能将登录或协议测试当模型成功。
- actual-ai-report.json：ChatGPT RDC以原UUID恢复review，实际执行query、批量预览/提交、plan-preview及context；最终12个任务、44 saved、5 cancelled、无pending、SQLite integrity ok。验证Codex创建仅一项，优先级实际变更为3。后续操作是本次ChatGPT通过RDC执行，不是Codex/Claude自主完成。
- 共享Skill增加串行请求与原UUID重试约定，两处安装一致。全局CLI保持v3，30项契约、QA doctor及Codex真实回执读取均通过。
## 实际使用和限制
同一工作空间的查询与写入均经过单请求队列。先doctor、再schema；每次等待saved/cancelled，received只查询原UUID，队列忙则保留同UUID和相同内容，在前一请求完成后重试。不并行发起context/review。复杂变更先展示真实预览，获用户确认后提交。不得把QA包装器当正式入口。原生候选未经正式安装，用户需另行确认后才可安装并绑定实际工作空间，启用高级权限。
既有Codex登录及Claude OAuth均未改变；未新增付费资源或调用额外API key，既有模型额度可能消耗，无法证明账单为零。Claude超时原因未确定，不自动重试或绕过权限。Codex存在既有MCP连接诊断，未更改全局配置。未读取正式任务数据、未执行正式同步、未发布安装包。正式分支合并、安装和数据操作继续单独确认。
