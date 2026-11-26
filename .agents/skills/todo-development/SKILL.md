---
name: todo-development
description: 当开发 TODO 的新业务功能、补齐页面或进行产品路线盘点时使用；先复用现有能力再实现。
---
# TODO 产品增量
1. 读 AGENTS.md 顶部当前阶段、docs/FEATURES.md、docs/functional-roadmap.md、docs/OPEN-SOURCE.md。先确认 HEAD 和实际页面入口。
2. 搜索 src/core、src/features、src/components 与 package-lock.json，标明已存在/部分/缺失；按项目功能闭环一次性开发。
3. 有通用能力需求先查全局 find-skills、frontend-ui-engineering 与 UI-Vault 交付索引；有匹配现成实现则复用，不自动安装依赖。
4. 涉及领域数据读 todo-domain-rules；涉及页面读 todo-ui-integration。遵循当前用户授权，普通开发不启动长测或 RC。
5. 按风险验证本批真实功能，更新 FEATURES 与路线，中文本地提交；保持4197、真实数据，不推送、不合并、不发布。
