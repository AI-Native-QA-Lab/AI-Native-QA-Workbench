# Release Plan

## Pre-1.0

每个版本必须： - 明确 Scope / Non-goals - 对应 GitHub Milestone - 通过
Contract / Architecture / Regression Tests - 更新 CHANGELOG - 更新 EN/ZH
public docs - 保证已有 `.ai-qa/` schema migration 策略 - 不在
patch/minor release 静默破坏 Project File Contract

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
