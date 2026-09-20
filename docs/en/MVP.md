# MVP --- v0.1

## Goal

Prove that AI can assist a real quality-engineering workflow while
project data remains local, traceable, reviewable, deterministic in CI,
and human-controlled.

## Golden Path

1.  Initialize a project with `qaw init`.
2.  Create/load a Requirement.
3.  Start a Requirement Analysis QualityTask.
4.  Agent Execution Loop reads project context.
5.  AI proposes Acceptance Criteria, Risks, Test Obligations and Test
    Cases.
6.  Workbench creates a ChangeProposal.
7.  Human reviews all or selected changes.
8.  Approved operations are validated and atomically written into
    `.ai-qa/`.
9.  Traceability is rebuilt.
10. Completion Contract validates the QA Task.
11. `qaw validate` passes.
12. `git diff .ai-qa/` clearly shows the quality changes.

## MVP Scope

-   Repository foundation
-   `.ai-qa/` project contract
-   Project / Requirement / AcceptanceCriterion / QualityRisk /
    TestObligation / TestCase / TraceLink
-   Project scanner/parser/serializer/validator
-   `qaw init`, `qaw validate`, `qaw doctor`, `qaw open`
-   local SQLite runtime store
-   Tool Runtime
-   MockProvider
-   OpenAICompatibleProvider
-   Agent Execution Loop
-   QA Task Loop + Completion Contract
-   ChangeProposal + human approval
-   Requirement Analysis workflow
-   Traceability UI
-   English / zh-CN UI
-   deterministic Golden Path E2E

## Explicit Non-goals

Evidence execution adapters, Quality Gate, full Quality Engineering
Loop, Skills, multiple native providers, MCP/GitHub/Jira, PostgreSQL,
multi-user/RBAC, vector database, Kubernetes.

## Exit Criteria

The Golden Path passes without Internet using MockProvider, and the same
domain/application code can run with DeepSeek and at least one
additional OpenAI-compatible model.
