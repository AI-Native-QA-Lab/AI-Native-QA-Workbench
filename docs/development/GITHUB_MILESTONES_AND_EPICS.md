# GitHub Milestones 与 Epic 规划

> **当前状态（2026-09-21）：** 本文件是本地治理规划注册表，不等同于 GitHub
> 远端已创建的 Milestone 或 Issue。当前仓库的 GitHub Issues/Milestones 尚未
> provision；远端 Issues 功能未启用，因此本次 v0.1 本地 MVP closeout 不虚构
> 远端卡片状态。后续创建 Milestone、Issue、Tag 或 Release 需要单独的外部发布
> 决策和验证。

## Milestones

-   M0 --- Repository Bootstrap
-   M1 --- MVP / v0.1 Local-first Quality Workflow
-   M2 --- v0.2 Evidence Foundation
-   M3 --- v0.3 Quality Engineering Loop
-   M4 --- v0.4 QA Skills
-   M5 --- v0.5 Multi-model Runtime
-   M6 --- v0.6 Engineering Integrations
-   M7 --- v0.7 Quality Intelligence
-   M8 --- v0.8 Evaluation
-   M9 --- v0.9 Specialized Agents
-   M10 --- v1.0 Stable Workbench

## M2 / v0.2 Evidence Foundation（本地规划边界）

-   状态：已在当前 checkout 实现并完成本地验证；远端 Milestone、Issue、Tag 和
    Release 均保持 `NOT_CLAIMED`。
-   范围：Evidence Domain/Contract、YAML manifest、三种离线 Adapter、artifact
    integrity、Import/Verify Service、CLI evidence 命令和架构/回归 Gate。
-   非目标：Quality Score、trusted evidence 自动赋值、远端集成、registry publication、
    生产部署和业务验收。

## MVP Epics

-   EPIC-001 Repository Bootstrap
-   EPIC-002 Project File Contract
-   EPIC-003 Quality Domain
-   EPIC-004 Project Store
-   EPIC-005 CLI
-   EPIC-006 Runtime Store
-   EPIC-007 Traceability
-   EPIC-008 Tool Runtime
-   EPIC-009 Model Provider
-   EPIC-010 Agent Runtime
-   EPIC-011 QA Task Loop
-   EPIC-012 Change Proposal
-   EPIC-013 Requirement Analysis
-   EPIC-014 Workbench UI
-   EPIC-015 i18n
-   EPIC-016 Golden Path
-   EPIC-017 Documentation & Release

## v0.2 Evidence Epics

-   EPIC-018 Evidence Contract and Domain
-   EPIC-019 Evidence File Store and Artifact Integrity
-   EPIC-020 Offline Evidence Adapters
-   EPIC-021 Evidence Import/Verify Services and CLI
-   EPIC-022 Evidence Architecture and Verification Gate

每个 Epic 继续拆成可独立 RED/GREEN/REFACTOR 的 GitHub Issue，避免一个
Issue 同时实现多个 Domain 行为。
