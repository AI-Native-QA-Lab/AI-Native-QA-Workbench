# v1.0 实施与稳定化计划

## 1.0 的定义

1.0 不是"功能数量足够多"，而是：

> Core contracts are stable enough for external users, projects and
> integrations to depend on.

## 1.0 前必须完成的能力

### Domain

-   Requirement / AC / Risk / Obligation / Test / TestRun / Evidence /
    Assessment / Gate / HumanDecision
-   stable IDs and schema versions
-   migrations

### Runtime

-   Agent Execution Loop
-   QA Task Loop
-   event-driven Quality Engineering Loop
-   pause/resume/cancel
-   deterministic Completion Contract

### AI

-   stable ModelProvider Contract
-   MockProvider
-   OpenAI-compatible
-   Anthropic/Gemini/Ollama compatibility from roadmap
-   capability negotiation

### Tools / Skills

-   stable Tool Contract and permission model
-   stable Skill Contract
-   skill evaluation baseline

### Evidence / Traceability

-   provenance
-   checksums
-   trace validation
-   coverage/gap analysis
-   evidence completeness

### Local-first

-   stable Project File Contract
-   migrations
-   diagnostics
-   atomic writes/conflict handling
-   backup/portability documentation

### Integrations

-   MCP
-   GitHub
-   Jira
-   generic test result adapters

### UX

-   stable EN/zh-CN
-   project navigation
-   quality overview
-   proposal review
-   traceability/coverage views
-   model/skill/integration settings

## 1.0 Contract Freeze

Freeze and version: - Quality Domain Contract - Project File Contract -
Traceability Contract - Evidence Contract - Agent Runtime Contract - QA
Task Contract - Domain Event Contract - Model Provider Contract - Tool
Contract - Skill Contract - Integration Contract

## Release Gate

-   all architecture fitness tests pass
-   contract compatibility tests pass
-   migration tests pass
-   Golden Paths pass
-   no live LLM required for core CI
-   public EN/ZH docs complete
-   upgrade guide complete
-   security/secrets review complete
-   release checklist complete
