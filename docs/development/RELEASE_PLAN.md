# Release Plan

## 当前发布状态

-   `v0.1.0`（2026-09-21）是 Bootstrap Release，已同步项目仓库与上游仓库。
-   v0.1 MVP 剩余能力已在本地完成实现收口，但 closeout 提交尚未推送，本轮不自动创建新的 tag 或 GitHub Release。
-   后续若发布 v0.1 MVP closeout，应沿用当前 Contract、CHANGELOG、验证记录和 CI 结果，并明确它与 Bootstrap Release 的区别。

## v0.1 MVP Implementation Gate（2026-09-21）

-   本地 Gate 已关闭：`pnpm check`、重复执行的 `pnpm test:e2e`、`git diff --check` 和质量文件 Contract 测试均通过。
-   Gate 覆盖源码、构建、测试、架构、文档和 MockProvider 浏览器流程；不覆盖真实 LLM、外部 CI/集成、生产部署或业务验收。
-   详细证据记录见 [`docs/superpowers/records/2026-09-21-v0-1-mvp-verification.md`](../superpowers/records/2026-09-21-v0-1-mvp-verification.md)。

## 本地 Gate 与 GitHub 交付边界

本地 Gate 通过只说明当前 checkout 的源码、测试、构建、架构、文档和 MockProvider
浏览器路径满足 v0.1 实施验收。它不等于远端 `main` 已包含 closeout，也不等于新的
GitHub Milestone、Tag、Release、CI 结果或生产部署已经完成。

当前 Milestone/Epic 文件只是本地规划注册表；由于 GitHub Issues 未启用，远端卡片
尚未建立。推送 closeout、创建新的 v0.1 Release 或补充远端治理对象必须作为独立的
外部发布动作执行并重新验证。

## Pre-1.0

后续进入对外发布流程的每个版本必须： - 明确 Scope / Non-goals - 对应 GitHub
Milestone - 通过 Contract / Architecture / Regression Tests - 更新 CHANGELOG -
更新 EN/ZH public docs - 保证已有 `.ai-qa/` schema migration 策略 - 不在
patch/minor release 静默破坏 Project File Contract。当前本地 closeout 尚未进入
该外部发布流程。

## v1.0 Release Gate

-   Core contracts versioned and stable
-   Project schema migration tested
-   CLI stable
-   Golden Paths stable
-   Evidence provenance stable
-   HumanDecision boundary enforced
-   provider/tool/skill compatibility tests stable
-   EN/ZH docs complete
-   upgrade guide complete
-   security review complete

## Post-1.0

1.x 优先增强 Local Workbench。Shared/PostgreSQL
只有真实用户需求触发后才进入正式版本计划。
