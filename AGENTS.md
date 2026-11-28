# TODO 当前开发规范

唯一活跃任务池：[docs/ACTIVE.md](docs/ACTIVE.md)。历史路线、报告和旧阶段命令不是当前任务。旧 AGENTS 全文原样保存于 [开发历史 3d47350](docs/archive/development-history-3d47350.md)，阶段证据仍见 [交接报告](docs/v15-development-handoff.md)。

## 产品与工程边界
- 简洁实用的个人任务管理工具：记录、组织、安排、执行、完成、回顾。优先改善现有流程；无明确需求或实际缺陷，不增加业务层级、配置、依赖、协议、服务或页面。
- 保留现有功能和数据，低频能力渐进呈现，不擅自删除或破坏可发现性；复杂目标、自动化编排、独立知识库、Agent 平台、通用优化引擎暂停扩张。
- 默认一个正式实现。Web 现有稳定存储、原生 SQLite 原子快照、Supabase CAS/RLS 与既有冲突保护不变；R1–R6、Web 分片试验冻结，禁止真实迁移。CLI First、MCP Optional、Cloud Optional；不恢复 AI/CLI 远程 OAuth 扩张；产品账号 OAuth 专项按当前任务池实施。
- 云端隐私复用 Supabase Auth、RLS、HTTPS 和平台静态加密；不是 E2EE。暂不开发自研密码学、密钥服务器、额外认证/同步服务、通用后端适配器或自托管平台。保留现有环境变量配置、SQL 迁移及可恢复备份。
- 遵循 DESIGN.md 与 docs/FEATURES.md；按需读 docs/OPEN-SOURCE.md 和 .agents/skills/todo-development、todo-domain-rules、todo-ui-integration。全局复用入口 /Volumes/data/AI-Development/reuse/README.md。优先原有 Radix、dnd-kit、FullCalendar 与领域代码；不机械拆分或另造框架。
- 计划日期、截止、提醒、重复实例、积分、专注、历史及锁定语义独立；编辑复用共享事务与撤销。保留作用域、旧字段、原值检查、冲突备份、明确恢复与失败不覆盖。不得以性能为由减少完整校验。
- 不读取或修改正式个人数据，不自动登录/绑定 CLI，不使用正式凭据做试验，不将 secret/service_role、密码、令牌写入仓库，不扩大云权限或费用。

## 本地操作与验收
- 当前 CI 效率专项使用 feat/ci-efficiency 独立工作树（基于 PR #39 的 694117d）；登录候选 feat/social-auth-web 保持原样，产品已发布基线见 origin/main。保持正式 main、AI 候选、研究分支及未提交内容；保留 4197 正常预览和 4318 独立 QA，不停止其他任务或覆盖共享构建目录。
- 使用合成数据与隔离浏览器 origin；默认 4178 空闲时定向冒烟，不读取既有用户浏览器 profile。Node 20+；按风险使用 node --test、npm run build、定向 Playwright；涉及数据、同步、权限、恢复时执行对应必要专项。完整 RC/跨平台验收仅在发布授权或实际故障需要时进行，未运行不声称通过。
- 分级 CI 见 [CI 效率治理](docs/ci-efficiency.md)：日常先以 node scripts/ci-scope.mjs --level daily --working 查看实际范围，按需 --run；集成使用累计差异或可信的完整基线，未知/高风险变更全量。失败定向复验保留原始记录，不能代替发布门禁；正式发布固定 SHA 完整验收，单 Runner 默认，双分片仅受控实验。不得减弱数据、签名、真实认证与升级门禁。
- 本机资源监测，不人为扩大并行负载。保护原始实验 DB、日志和失败证据。无证据不反复重跑已通过测试，不为了继续开发而制造任务。
- 中文本地 Git commit；本次不推送、不合并、不发布、不安装、不变更正式数据。历史 PR 与已安装候选不动。更新 ACTIVE 与必要交接记录，不在 AGENTS 追加流水账。

### Design Vocabulary 首批 UI 精修（本地预览）

- 基线为 GitHub main 49aa0885，使用独立 feat/design-vocabulary-polish 工作树，不移动落后 69 个提交的正式本地 main，不改其他工作树。仅修改 business-design、selection-detail、detail-sections 三个既有 CSS 所有者和 DESIGN.md，保留业务及持久化语义。词汇参考本地 UI-Vault；不安装新组件库。
- 同 lockfile 的既有依赖目录 APFS 克隆后，304 单测及 Vite build 通过；离线 npm ci 因 npm 镜像缓存缺项未成功，非干净安装证据。实际 Edge 两项既有选中/控件 E2E 通过，新双视口 E2E 首次因展开后按钮改名的测试定位错误失败，修正定位后 2/2 通过。1440 浅色和 390 深色使用独立浏览器上下文、合成任务及本地网络限制获取修改前后截图，不改真实用户数据。未进行全部 E2E、跨浏览器及原生平台验收。
- 用户要求本地演示，保留未提交候选，未推送、合并或发布；预览仅绑定 127.0.0.1:5174。test-results 中截图属临时产物，后续 E2E 可能清理。

### Design Vocabulary 第二批（本地候选）

- 沿用 feat/design-vocabulary-polish，保留第一批未提交变更。按原CSS所有权及现有 Radix/dnd-kit 实现七项视觉精修；详情共享指示器采用 motion.js 的精确弹簧步进，桌面网格关闭同步，不改存储、领域模型和依赖。详见 DESIGN.md 对应章节。
- 304原单测 + 2弹簧测试、Vite build 通过。33项定向E2E首轮31通过，桌面重开测试改用实际中间帧触发，规划测试固定09:00测试时钟以避免真实工作时段已结束；两个失败用例及4项回顾复验通过。总计37项不同用例最终通过；原失败与复验日志均保留。
- 5174本地开发预览，5175本地生产预览，均仅绑定127.0.0.1。12张合成数据截图，保存在 test-results/vocabulary-round2 和独立验收产物目录；未执行全量跨浏览器/原生验收。未提交、未推送、未合并、未发布。


### Design Vocabulary 第三批（本地候选）

- 继续独立工作树并保留前两批未提交内容；第三批修改 FullCalendar 公开事件渲染、统计图表及详情披露，未改业务模型和依赖，详见 DESIGN.md。
- 306单测、23定向E2E、Vite build 通过；12张隔离合成数据截图在 test-results/vocabulary-round3 与独立产物目录。5174开发及5175生产预览继续本地运行。周/日事件、外部事件专项视觉和全量平台验收尚未完成，不推送、合并或发布。


### Design Vocabulary 第四批（本地候选）

- 保留前三批变更，独立备份 round3.patch 与未跟踪测试。第四批复用 FullCalendar 公开接口、Radix 生命周期、现有弹簧与 Tokens，优化周日事件、移动导航、页面标题并清理少量重复/失效规则。详见 DESIGN.md。
- 最终306单测、Vite build 通过；首轮18定向E2E中16通过、2项定位失败；最终变更后定向复验7/7。16张双视口截图和日志在独立验收目录。周视图极窄列及全部页面、跨浏览器、原生验收仍有边界。5174开发和5175生产预览，不提交、不推送、不合并、不发布。


### Design Vocabulary 第五批（本地验收候选）

- 备份第四批工作树差异及未跟踪测试，保留全部变更。日历窄屏滚动、原生更多入口、短事件、浮层起点和两组重复CSS修复，详见 DESIGN.md。独立 capture 样式保留。未新增依赖或改业务数据。
- 306单测通过，最终构建通过；累计27个定向用例首轮25通过，2定位失败，最终8项相关复验全部通过。30张页面截图与CSS审计JSON、原始日志保存在独立产物目录。WebKit2388缺失；尚非全平台发布候选。5174/5175本地运行，不提交、不推送、不合并、不发布。


### Design Vocabulary 最终本地候选（冻结）

- 基线49aa088，feat/design-vocabulary-polish；保护第五批及未跟踪测试，冻结差异与源码/构建哈希在 /Volumes/data/AI-Development/artifacts/todo-design-vocabulary-final。最终仅修复详情滚动rAF、周历固定刻度、短事件及43条已失效历史CSS；不增依赖、不改业务和存储。
- 306单测、构建、Chromium13/13、WebKit18/18通过；Firefox已安装但profile/sandbox启动失败，不调整系统安全策略，不计为通过。132组CSS候选分类，118保守保留、12独立入口、2随旧规则清理。实际截图4张，前五批证据保留。
- 停止新UI扩张。本地冻结，尚未正式发布准入；后续仅解决Firefox运行环境和实际缺陷，正式发布另行授权。未提交、未推送、未合并、未发布。

### 用户反馈 · 控件细节修复（本地）
- 在冻结候选上针对实际截图修改 selection-detail.css、business-design.css、views.jsx，新增 ui-control-refinement.spec.js。保留原冻结备份，不更新其历史哈希。未改业务数据、依赖、推送或发布。
- Chromium 独立录入/统计测试4/4通过；首次测试立即读取按钮过渡样式及移动创建后详情遮挡后续导航，已改为等待实际样式、独立场景验证；不视为已验收创建后连续关闭详情并导航的流程。

### 用户反馈 · Soft Control 材质精修
- 原工作树与冻结备份保留；依据用户参考图实际修改 tokens.css、controls.css、selection-detail.css、business-design.css。仅共享材质和布局，未改业务/存储/依赖。没有全站强制替换按钮语义。
- 生产构建、Chromium11/11、WebKit11/11定向通过；8张实际前后截图及日志、差异在 /Volumes/data/AI-Development/artifacts/todo-soft-controls。5174开发和5175生产预览。未提交、推送、合并、发布。

### 用户反馈 · 极简控件与尺寸修正

- 依据明确反馈撤销 Soft Control 材质，保留其他累计代码。实际修改 tokens.css、controls.css、selection-detail.css、business-design.css，补充尺寸与无渐变/阴影断言。默认桌面36px、移动48px且提交44px；移动测量浮点误差使用0.05px容差。无业务、依赖变更。截图和日志独立保存在 todo-minimal-controls 产物目录。未提交、推送、合并、发布。

### 用户反馈 · 日历视觉统一
- 保留极简按钮方案及累计候选，新增 calendar-design.css 和公开 FullCalendar 样式钩子；统一控件、事件、浮层、任务面板圆角和视觉层级，不改业务几何、拖拽、日历订阅逻辑。新增 ui-calendar-minimal.spec.js。
- Vite build、Chromium9/9通过；WebKit8/9，外部订阅模拟请求失败，详见独立复验日志。12张真实前后截图及差异保存于 /Volumes/data/AI-Development/artifacts/todo-calendar-minimal。Firefox未复验。未提交、推送、合并、发布。

### 用户反馈 · Native 整体视觉适配
- 依据用户提供的Native alpha设计参考，调整 tokens.css、appearance.jsx、native-appearance.css、main.jsx、views.jsx。保留日历与极简控件几何、业务、数据、依赖、既有外观选择。新增默认暖琥珀及定向测试。
- 306单测，Chromium19项经复验通过，WebKit17/17，构建通过（chunk大小警告），30张最终实际截图。备份、测试日志与差异在 /Volumes/data/AI-Development/artifacts/todo-native-design。未复验Firefox及WebKit订阅阻塞，未全量发布验收。未提交、推送、合并、发布。

### 用户反馈 · Classic / Native 双设计主题
- 恢复原经典基础色板，将 Native 视觉限定于独立主题。AppearanceSettings 提供实时切换，持久化 designTheme，保留经典强调色及密度、字号、焦点偏好。旧 amber 迁移为 Native，其他旧颜色保留 Classic；缺失默认 Classic。
- 生产构建、Chromium16项和WebKit10项经复验通过；系统模式用例首次缺少根属性初始化等待，已修正测试。产物在 /Volumes/data/AI-Development/artifacts/todo-theme-switch。未重新验收 Firefox、外部订阅及原生平台。未提交、推送、合并、发布。

### 用户反馈 · 设置界面密度治理
- 修改 WorkspaceSettings、AppearanceSettings 及 settings-layout.css；整合明暗与主题、双列实时预览、统一表单和分组密度，保留旧功能、业务数据及双主题。
- 生产构建通过；Chromium15项初版通过，最终移动布局3项定向复验；WebKit最终11项通过。56张合成数据前后截图和日志保存在 /Volumes/data/AI-Development/artifacts/todo-settings-density。未重新验收Firefox、原生平台及全部发布门禁；未提交、推送、合并、发布。

### 用户反馈 · 设置独立分类
- 修改 SettingsLayout.jsx、settings-layout.css 和 ui-settings-layout.spec.js。分类选中状态直接驱动可见页面，切换复位内容滚动，保留挂载状态和现有设置存储。
- 构建、Chromium18/18、WebKit10/10定向通过；备份、截图和日志位于 /Volumes/data/AI-Development/artifacts/todo-settings-pages。未提交、推送、合并、发布。

### 用户反馈 · Module Card 全站统一
- 共享令牌及module-card.css；设置与组件展厅、详情、业务模块共享底纹，保留Classic/Native配色、尺寸、选中与拖拽反馈。Native玻璃留给浮动导航；业务面板采用不透明底纹。新增ui-module-card.spec.js。未改业务或存储，未增依赖。
- 306单测、最终构建、Chromium32/32、WebKit18/18，补充业务复验各2/2；初次移动补充测试定位失败，后发现Native今日执行覆盖，均保留日志并修复。58张最终截图及独立备份在 /Volumes/data/AI-Development/artifacts/todo-module-card。按用户许可提交累计设计候选并推送独立分支，不合并、不发布。Firefox、原生、既有订阅阻塞未复验，非正式发布验收。

### 用户反馈 · 连续开合动效集成
- 基于4311306，读取UI-Vault ceb019b的原始实测文档，新增Disclosure.jsx及disclosure.css，接入今日执行、侧栏文件夹及本机归档；DetailSection复用springStep实现速度继承。无新依赖，无业务与存储变更。
- 构建通过（原有chunk大小警告）；306单测，Chromium原回归25/25、新专项3/3，WebKit10/10。真实开合截图与逐帧记录保存在 /Volumes/data/AI-Development/artifacts/todo-continuous-disclosure。Firefox、原生平台、异步高度重定向及全站性能未专项验收；未推送、未合并、未发布。

### 用户反馈 · 分组开合与标题跳动修复
- 延续4311306上的未提交动效工作，任务分组接入Disclosure，80项以内动画、较大列表即时；隐藏行立即排除交互及拖放、退出后卸载。FLIP与折叠隔离，稳定后恢复外置手柄。详情标题固定几何，今日执行按钮固定宽度。
- 最终构建通过，306单测；第一轮Chromium17/17、WebKit14/14；额外完整开合双引擎各1/1；桌面列表15项经复验通过；最终稳定性专项双引擎各5/5。初次拖拽失败已修复，页面入场位移测量隔离后1px阈值不变。证据在 /Volumes/data/AI-Development/artifacts/todo-disclosure-stability。未提交、推送、合并、发布。

### 用户反馈 · 任务分组统一浅底纹
- 保留4311306之后的连续开合未提交成果，SectionGroup复用module-card，统一几何并保留外置手柄/拖放反馈。新增ui-task-group-surface.spec.js，五个视口主题组合及开合/对比度检查。
- 构建通过（既有chunk警告），Chromium24项既有回归+5项底纹专项经复验通过，WebKit10/10。空未分组为原有行为，初次测试计数修正；截图、日志、差异见 /Volumes/data/AI-Development/artifacts/todo-task-group-surface。未提交、推送、合并、发布。

### 用户反馈 · 收集箱归位及清单分组淡色
- 保留累计未提交成果，WorkspaceSidebar 将收集箱归入我的清单首位；taskBuckets 传递清单元数据，SectionGroup 通过校验颜色和共享令牌生成淡色。修正淡色组内极端颜色的名称/符号对比，未修改任务数据或设置存储。
- 构建、306单测、Chromium24项经复验、WebKit9项及最终双引擎各4项通过；初次窄屏旧测试测到悬停背景，移开指针复验。证据在 /Volumes/data/AI-Development/artifacts/todo-list-tints。未提交、推送、合并、发布。

### 用户反馈 · 侧栏连续开合与长按排序
- 保留累计未提交设计成果，新增 SidebarSortable、sidebar-sort.css、sidebar-order.js；WorkspaceSidebar 统一栏目和同级排序，view-preferences 保存本机顺序与折叠状态。复用 dnd-kit 和 Disclosure，不改业务数据及云端偏好语义。
- 构建、308单测、Chromium33项初始回归及最终5项专项通过，触摸模拟首次落位偏差后缩小自动滚动范围并隔离滑动惯性。WebKit结果见日志，CDP触摸仅Chromium执行。证据位于 /Volumes/data/AI-Development/artifacts/todo-sidebar-sort。未提交、推送、合并、发布。

### Alpha.3 设计阶段收口
- 用户明确授权提交、推送、合并、发布；版本统一为1.2.0-alpha.3/102003，保持签名、升级及完整UI门禁。308单测及构建通过；10项侧栏/开合验收通过，软件更新E2E因独立设置页须先进入对应栏目而修正，定向1/1通过。保留首次失败日志。正式发布需固定SHA验收，不将新活动采集研究混入此候选。
