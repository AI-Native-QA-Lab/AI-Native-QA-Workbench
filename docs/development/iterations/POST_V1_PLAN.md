# 1.x / 2.x 后续版本计划

## 1.x --- Advanced Local Workbench

保持 Local-first 主线，逐步增强：

-   Quality Knowledge Graph
-   Advanced Change Impact
-   Persistent QA Memory
-   Policy Engine
-   Advanced Skill/Agent Evaluation
-   Model Routing
-   Plugin System
-   richer QA domains
-   deeper QCov integration
-   ai-test-auditor credibility checks
-   ai-native-qa-agents composition
-   local semantic search only when evidence supports the need

## 2.x Candidate --- Shared Workbench

不是 1.0 的必然下一步。只有真实团队协作需求验证后才立项。

候选能力： - shared server deployment - PostgreSQL optional adapter -
shared artifact storage - organization/workspace - RBAC - team
collaboration - central audit - remote runtime - conflict/concurrency
model - local/shared synchronization strategy

在进入开发前必须通过新的 ADR 重新回答 Source of Truth、Git
integration、offline/local mode、conflict resolution、audit、evidence
storage 和 migration 问题。

Local Mode 必须长期保持一等公民。
