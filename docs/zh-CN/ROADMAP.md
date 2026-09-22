# Roadmap

## 当前状态（2026-09-22）

-   `v0.1.0` 是 Bootstrap Release：包含仓库结构、Project File
    Contract、初始 Domain Contract、CLI 基础、CI 和许可证。
-   剩余 v0.1 MVP 已在本地 `main` 工作区实现完成，并通过离线质量门禁和确定性的浏览器 Golden Path。本状态是实现收口，不代表已经创建新的 GitHub Release。
-   MockProvider 和本地 Fixture 只证明确定性流程。真实模型、外部集成、生产部署和业务质量证据不属于本次 Gate。
-   v0.2 Evidence Foundation 已在当前 checkout 实现，包括 Contract、Adapter、Artifact Integrity、Import/Verify Service 和 CLI 命令；这不代表已经创建 GitHub Tag 或 Release。

## M0 --- Repository Bootstrap

仓库结构、CI、TDD Foundation、Architecture
Checks、双语文档结构、AGENTS.md、i18n Foundation。

## v0.1 --- MVP / Local-first Foundation（实现完成）

File-first Project Store、核心 Quality Domain、CLI、SQLite
Runtime、Agent Execution Loop、QA Task Loop、ChangeProposal、Human
Review、Requirement
Analysis、Traceability、MockProvider、OpenAICompatibleProvider、EN/zh-CN、deterministic
Golden Path。

## v0.2 --- Evidence Foundation（已在本地实现；外部交付尚未评估）

TestRun、Evidence、Provenance、Artifact
Reference/Checksum、JUnit/Playwright/Pytest Adapter、Evidence
Integrity，以及 CLI Import/Verify 命令。Quality Score、Trusted Evidence
赋值、远端发布、生产部署和业务验收仍不在本范围内。

## v0.3 --- Quality Engineering Loop

Domain Events、Workflow
Runtime、QualityAssessment、QualityGate、HumanDecision、完整
event-driven Three Loops。

## v0.4 --- QA Skills

Skill Registry、SKILL.md、Capability/Tool
Requirements、Completion/Evaluation Contract、local/git
source、awesome-qa-skills 集成。

## v0.5 --- Multi-model Runtime

Anthropic、Gemini、Ollama、Capability Negotiation、Provider
Health、Retry/Rate Limit、Usage/Cost。

## v0.6 --- Engineering Integrations

MCP、GitHub、Jira、CI、通用 Test Result Adapter、Cypress/REST
Assured/k6/JMeter。

## v0.7 --- Quality Intelligence

Requirement/Risk/Obligation Coverage、Evidence Completeness、Quality
Gap、Change Impact、QCov 集成。

## v0.8 --- Evaluation

Skill Dataset、Evaluator、Regression、Cross-model / Version Comparison。

## v0.9 --- Specialized QA Agents

Requirement/Test Design/Automation/Performance/Quality Review Agents，与
ai-native-qa-agents 建立集成。

## v1.0 --- Stable Local-first Workbench

稳定公共 Contract、Schema Migration、CLI、Upgrade
Path、双语文档、Provider/Tool/Skill Contract、Evidence Provenance、Human
Decision Boundary、Golden Paths 与 Release Process。

## 1.x --- Advanced Local Workbench

Quality Knowledge Graph、Advanced Change Impact、Persistent QA
Memory、Policy Engine、Advanced Evaluation、Model Routing、Plugin
System、更多 QA Domain。

## 2.x Candidate --- Optional Shared Workbench

只有真实协作需求验证后再进入：Shared Server、PostgreSQL、Shared
Artifact、Organization/Workspace、RBAC、Team Collaboration、Central
Audit、Remote Runtime。Local Mode 始终是一等能力。
