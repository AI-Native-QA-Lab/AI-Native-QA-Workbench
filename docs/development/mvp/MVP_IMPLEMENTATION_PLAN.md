# MVP / v0.1 实施计划

> **状态：实现完成（2026-09-21）**。本计划中的能力已在本地 `main` 工作区完成并通过离线质量门禁与浏览器 Golden Path。`v0.1.0` 仍保留为 Bootstrap Release；是否创建新的 MVP closeout Release 需要单独的发布决策。

## 实际交付范围

本次一次性交付了 Project Store、QualitySnapshot/Traceability、SQLite Runtime Store、Tool Registry、MockProvider、OpenAI-compatible Provider、Agent Execution Loop、QA Task Loop、ChangeProposal/Human Review、Requirement Analysis、CLI、Fastify Local API、React/Vite Workbench、独立的 `uiLocale`/`outputLocale`、双语 Contract 和无网络 Golden Path E2E。

已明确留在后续版本的范围：TestStrategy、TestRun、Evidence、QualityAssessment、QualityGate、Domain Event、MCP/GitHub/Jira/CI 结果导入、远程运行、多用户、RBAC、PostgreSQL 和 Shared Workbench。

本次 Gate 的证据只覆盖源码静态检查、类型/构建、单元/Contract/集成测试、架构检查、文档检查和 MockProvider 驱动的本地浏览器流程；不把它们表述为真实 LLM、外部系统、生产部署或业务验收证据。

## 目标

以 TDD 方式完成第一条真实可用、可 Review、可追溯的 Local-first Quality
Workflow。

## Epic

### EPIC-001 Repository Bootstrap

-   pnpm workspace / Turborepo
-   TypeScript / lint / format
-   Vitest / Playwright
-   GitHub Actions
-   architecture check
-   docs/i18n check
-   AGENTS.md

### EPIC-002 Project File Contract

-   `.ai-qa/project.yaml`
-   schemaVersion
-   Markdown/YAML/JSON conventions
-   ID/reference conventions
-   diagnostics contract

### EPIC-003 Quality Domain

-   Project
-   Requirement
-   AcceptanceCriterion
-   QualityRisk
-   TestObligation
-   TestCase
-   TraceLink
-   domain invariants

### EPIC-004 Project Store

-   scanner
-   parser
-   schema validation
-   domain factory
-   serializer
-   atomic write
-   corrupted-file diagnostics
-   duplicate ID/broken reference detection

### EPIC-005 CLI

-   qaw init
-   qaw validate
-   qaw doctor
-   qaw open

### EPIC-006 Runtime Store

-   SQLite
-   agent_sessions
-   agent_runs
-   agent_steps
-   model_invocations
-   tool_runs
-   workflow_runs
-   approval_requests

### EPIC-007 Traceability

-   embedded links
-   explicit TraceLink
-   graph builder
-   validation
-   rebuildable index

### EPIC-008 Tool Runtime

-   Tool Contract
-   registry
-   read/write/restricted permission
-   validation
-   audit

### EPIC-009 Model Provider

-   Provider Contract
-   MockProvider
-   OpenAICompatibleProvider
-   contract test kit

### EPIC-010 Agent Runtime

-   state machine
-   streaming
-   tool loop
-   maxSteps
-   timeout
-   cancel
-   pause/resume
-   waiting_for_approval

### EPIC-011 QA Task Loop

-   QualityTask
-   QualityTaskRun
-   Completion Contract
-   Completion Validator
-   re-evaluate loop

### EPIC-012 Change Proposal

-   Domain Operation
-   semantic diff
-   approve/reject/partial approve
-   baseRevision/hash conflict
-   apply + atomic write
-   audit

### EPIC-013 Requirement Analysis

-   context builder
-   AC proposal
-   Risk proposal
-   Obligation proposal
-   Test Case proposal
-   completion validation

### EPIC-014 Workbench UI

-   project overview
-   requirements
-   risks
-   obligations
-   tests
-   assistant
-   proposal review
-   traceability

### EPIC-015 i18n

-   en default
-   zh-CN
-   locale persistence
-   outputLocale separation

### EPIC-016 Golden Path

-   deterministic MockProvider E2E
-   no Internet
-   no live LLM
-   git-friendly resulting files

### EPIC-017 Docs & Release

-   README EN/ZH
-   MVP docs
-   architecture/contracts
-   migration notes
-   release checklist

## TDD 实施顺序

1.  Repository/Test Infrastructure
2.  Project File Contract
3.  Domain RED tests
4.  Minimal Domain
5.  qaw init RED/GREEN
6.  Parser/validator RED/GREEN
7.  Serializer round-trip
8.  qaw validate
9.  Runtime Store tests
10. Traceability tests
11. Tool Contract tests
12. Provider Contract tests
13. MockProvider
14. Agent state-machine tests
15. Agent Loop
16. QA Task Completion tests
17. QA Task Loop
18. ChangeProposal tests
19. Pause/Resume tests
20. Requirement Analysis tests
21. OpenAICompatibleProvider
22. UI/i18n behavior tests
23. Golden Path E2E
24. Docs/Architecture/Release validation

## MVP Definition of Done

-   `.ai-qa/` is Source of Truth
-   runtime DB deletion does not destroy project-quality data
-   qaw init/validate/doctor/open work
-   core domain invariants are tested
-   Agent Loop and QA Task Loop work
-   Completion Contract prevents false completion
-   AI changes require ChangeProposal
-   approve/reject/partial approve work
-   Traceability rebuild works
-   MockProvider CI works without Internet
-   OpenAI-compatible path validated
-   EN/zh-CN works
-   Golden Path E2E passes
