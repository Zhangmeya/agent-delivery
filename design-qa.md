# Agent Delivery 正式前端设计 QA

final result: blocked

## 当前状态（2026-07-26，故障修复与复验后）

- 本地预览已恢复：复用项目内现有 PostgreSQL 集群，通过外部连接模式启动服务；未重装依赖、未清理 node_modules、未创建路径映射，访问 http://127.0.0.1:3100/CMP/dashboard 返回 HTTP 200。
- 应用内浏览器控制已恢复，并在 1366 x 768 CSS 视口重新捕获公司概览、项目列表、任务列表和任务详情。
- 已修复可见示例内容不一致：入门项目、首个招聘任务、复盘教练、总结助手及详情只读标题使用中文显示，原始可编辑数据、路由和 API 值保持不变。
- 新证据统一存放于 design-qa-artifacts/，四个核心页面均生成当前实现截图和 2732 x 768 左右同图对比。
- 浏览器复查未发现新增 error 或 warn 日志；四个核心页面无页面级横向溢出，导航、列表、提醒区和详情三栏结构可用。
- 工程验证：新增与相关测试 16 项通过；UI TypeScript 通过；设计令牌门禁三类违规均为 0；UI 生产构建通过；git diff --check 通过；D:\.pnpm-store 不存在。
- 当前剩余 P2：任务详情顶部全局面包屑仍显示原始英文任务标题；修复补丁因本机安全审核中断未应用。详情正文和历史系统通知中的英文属于真实运行数据，不在前端静态翻译范围内。
- 其他已改造页面的现有截图早于本批主导航调整，仍需按当前版本补捕后才能恢复全范围 passed；因此 final result 暂时保持 blocked。

## 一、验收范围

本次设计 QA 覆盖 `Agent Delivery｜灵构交付` 已登录后的正式前端第一阶段改造：

- 公司概览
- 项目列表
- 任务列表与唯一待处理事项
- 任务详情
- 消息中心
- Skill 库
- 智能体列表
- 公司组织架构
- 设置中心
- 全局搜索

登录页代码、品牌资产、文案、类型检查、单元测试和生产构建已验证。为避免破坏当前可信会话，已增加只读视觉预览入口 `/auth?preview=1`：保留现有登录状态、禁用表单提交，并完成 1366 x 768 运行时截图验收。证据：`design-qa-artifacts/2026-07-26-login-preview-1366x768.png`。真实未登录认证流程仍需在独立未登录会话中补验。

## 二、视觉依据与实现证据

所有页面均按 1366 x 768 CSS 视口、桌面浅色主题和当前真实运行数据验收。源图与实现图均为 1366 x 768 PNG、1 倍 CSS 尺寸；对比图为左右并排的 2732 x 768 PNG，无密度缩放。

| 页面 | 视觉依据 | 实现截图 | 对比图 |
|---|---|---|---|
| 公司概览 | `../prototype/dashboard-v2-1366x768-browser.png` | `design-qa-artifacts/2026-07-26-dashboard-final-1366x768.png` | `design-qa-artifacts/2026-07-26-dashboard-comparison.png` |
| 项目列表 | `../prototype/project-list-1366x768-browser.png` | `design-qa-artifacts/2026-07-26-projects-final-1366x768.png` | `design-qa-artifacts/2026-07-26-projects-comparison.png` |
| 任务列表 | `../prototype/task-list-reminder-1366x768-browser.png` | `design-qa-artifacts/2026-07-26-issues-final-1366x768.png` | `design-qa-artifacts/2026-07-26-issues-comparison.png` |
| 任务详情 | `../prototype/task-detail-1366x768-browser.png` | `design-qa-artifacts/2026-07-26-issue-detail-final-1366x768.png` | `design-qa-artifacts/2026-07-26-issue-detail-comparison.png` |
| 消息中心 | `../prototype/message-center-1366x768-browser.png` | `design-qa-inbox-1366x768.png` | `design-qa-inbox-comparison.png` |
| Skill 库 | `../prototype/skill-library-1366x768-browser.png` | `design-qa-skills-1366x768.png` | `design-qa-skills-comparison.png` |
| 智能体列表 | `../prototype/agent-list-1366x768-browser.png` | `design-qa-agents-1366x768.png` | `design-qa-agents-comparison.png` |
| 公司组织架构 | `../prototype/organization-chart-1366x768-browser.png` | `design-qa-org-1366x768.png` | `design-qa-org-comparison.png` |
| 设置中心 | `../prototype/settings-page-1366x768-browser.png` | `design-qa-settings-1366x768.png` | `design-qa-settings-comparison.png` |
| 全局搜索 | 无独立原型源图；沿用已确认视觉系统 | `design-qa-search-1366x768.png` | 不适用 |

除全局搜索外，其余页面均已将原型源图和正式实现放入同一张 2732 x 768 对比图后判断。全视图原始尺寸下能够辨认导航、标题、主要控件、三栏结构和关键状态；本轮重点是页面级信息结构和区域比例，因此不再额外裁剪局部对比图。全局搜索没有独立原型源图，只核对其与已确认视觉系统的一致性，不把它表述为逐页同图对比。

## 三、状态与数据口径

- 原型使用设计阶段模拟数据，正式实现使用当前实例的真实项目、任务、智能体、活动、预算和审批数据。
- 正式数据模型没有项目进度字段，因此项目列表没有伪造百分比进度。
- 已知内置示例项目、任务与智能体名称采用只读显示映射；任务描述和历史系统运行通知仍保留运行数据原文，前端不改写业务数据。
- 当前交付总控 Agent 启动失败、Summarizer 和 Reflection Coach 暂停，以及 `/built-in-agents` 偶发 404，属于隔离运行环境或运行数据问题，不是本轮前端改造引入的问题。

## 四、五项视觉检查

- 字体与排版：沿用现有 Inter 与中文系统回退字体，页面标题、列表文本、机器值和状态文本层级清晰；任务详情三栏后长标题能够正常换行。
- 间距与布局：全局导航、页面内容、列表密度和磨砂表面保持统一；任务详情已形成任务信息、Agent 对话、属性栏三栏结构，窄屏自动回落为单栏。
- 颜色与令牌：品牌蓝、青、紫、琥珀、玫红和绿色均通过 `ui/src/index.css` 的语义令牌使用；令牌门禁无新增违规。
- 图像与资产：登录页使用独立位图资产 `ui/public/agent-delivery-login-hero.png`；业务页面没有用占位图、手绘 SVG 或模拟数据替代真实内容。
- 文案与内容：产品名、导航和核心操作已统一为 Agent Delivery 与中文任务语义；运行数据中的英文原文保持原样，避免前端篡改业务数据。

## 五、比较历史

### 第 1 轮

- [P1] 任务详情主区仍把任务信息和 Agent 对话上下排列，与已确认的三栏结构不符。
- 修复：在 `ui/src/pages/IssueDetail.tsx` 中只调整布局容器，将任务信息与对话拆为两列，保留右侧原生属性栏、接口、状态和交互逻辑；在 `ui/src/index.css` 增加响应式网格令牌与规则。
- 复验：`design-qa-artifacts/2026-07-26-issue-detail-final-1366x768.png` 和 `design-qa-artifacts/2026-07-26-issue-detail-comparison.png` 显示三块主区域同时处于首屏，页面无横向溢出。

### 第 2 轮

- [P2] 公司设置页的浏览器标题重复显示公司名。
- 修复：标题生成逻辑在面包屑已经包含当前公司时不再重复追加公司名，并补充回归测试。
- 复验：浏览器标题由“设置 • 灵构交付体验团队 • 灵构交付体验团队 • Agent Delivery”修正为“设置 • 灵构交付体验团队 • Agent Delivery”；1366 x 768 页面尺寸保持无页面级溢出。

### 第 3 轮

- [P2] 正式前端仍需要更突出项目交付主路径，并降低 Paperclip 原生工具对主导航的干扰。
- 修复：主导航统一为公司概览、项目列表、任务列表、消息中心；交付工具、智能体列表和组织设置下沉分组；顶部增加统一“新建”入口；公司概览收敛为必须处理事项、五项紧凑指标、项目交付总览、待处理事项和资源负载。
- 复验：`design-qa-artifacts/2026-07-26-dashboard-final-1366x768.png` 和 `design-qa-artifacts/2026-07-26-dashboard-comparison.png` 显示 1366 x 768 首屏无页面级横向或纵向溢出，信息层级与原型一致；“新建项目”和“新建任务”菜单项各唯一存在，菜单可正常打开和关闭，复查时浏览器控制台错误为 0。

### 第 4 轮

- [P1] 本地预览与应用内浏览器均不可用，最新视觉证据失效。
- 修复：复用项目内既有 PostgreSQL 集群并改为外部数据库连接启动，恢复 3100 服务；随后重新连接应用内浏览器，未重装依赖或迁移项目。
- [P2] 公司概览、侧栏和任务列表中的内置示例名称与首个任务仍显示英文；任务详情直接使用原值渲染标题。
- 修复：扩展示例显示映射，并让列表、概览、侧栏与详情只读预览共用该规则；InlineEditor 编辑态继续保留原始值。
- 复验：四个核心页面截图与同图对比已生成；相关测试 16 项、类型检查、令牌门禁和生产构建通过，浏览器 error/warn 为 0。
- 剩余：[P2] 任务详情顶部全局面包屑仍显示原始英文标题；其他页面需用当前主导航版本补捕截图。

### 上一轮最终复验（历史记录）

- 未发现仍需处理的 P0、P1 或 P2 视觉问题。
- 原型与正式实现的文字和数量差异来自模拟数据与真实数据，不属于视觉漂移。
- 登录页未登录态的浏览器截图作为后续环境验收项记录，不阻塞已登录产品闭环的本轮通过结论。

## 六、上一轮功能与浏览器验证（历史记录）

- 任务详情“对话 / 活动”标签可切换并正确恢复。
- 项目搜索、筛选、排序、清除筛选、详情、加入/离开和收藏能力保留。
- 任务列表筛选、分组、新建任务和任务详情入口保留。
- 消息中心、Skill、智能体、组织架构、设置、搜索和新建任务沿用原生能力并适配统一视觉。
- 公司概览、项目、任务、消息、Skill、智能体、组织、设置、搜索和任务详情在 1366 x 768 下页面级横向溢出均为 0。body 尺寸保持 1366 x 768，需要滚动的内容只在主工作区内部滚动。
- 浏览器日志保留了改造早期的 `groupedProjects is not defined` 和实时替换代码时的两条 React HMR 历史错误；重新加载搜索页后按时间复查，没有新增错误日志。当前项目页和搜索结果均可正常渲染。
- 全局搜索输入 `Onboarding` 后返回 1 个真实项目结果，分类数量和结果入口正常。

## 七、工程检查

- 设计令牌门禁：通过。
- UI TypeScript 类型检查：通过。
- Breadcrumb、Auth、Projects、IssueDetail 相关测试：51 项通过，3 项按既有条件跳过。
- 中英文 locale JSON 解析：通过。
- UI 生产构建：通过。
- `git diff --check`：通过，仅有仓库换行格式提示。
- 构建保留仓库原有的 CSS Highlight、Lexical 注释、字体运行时解析和大包体提示；未出现构建失败。

## 八、后续验收项

- 登录页视觉预览已完成；在独立未登录会话或正式认证模式中仅需补做真实认证流程验收。
- 明天结合实际使用反馈讨论运行环境中的 Agent 启动失败、暂停状态和内置智能体接口问题。

final result: blocked
