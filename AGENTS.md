# AGENTS.md

This file defines mandatory engineering rules for AI coding agents
working in this repository.

## 1. Read Before Coding

Before changing code:

1.  Read the relevant contract under `docs/en/contracts/`.
2.  Read the corresponding architecture/ADR when applicable.
3.  Identify affected invariants.
4.  Add or update a failing test.
5.  Confirm RED before implementation.

## 2. Mandatory TDD Workflow

`Contract → Behavior → RED → Minimal Implementation → GREEN → REFACTOR → Architecture Check → Regression → Documentation`

Do not implement core behavior first and add tests afterward.

## 3. Architecture Boundaries

### Domain

`packages/domain` must remain pure TypeScript and must not depend on:

-   filesystem APIs
-   SQLite
-   Fastify
-   React
-   OpenAI/Anthropic/DeepSeek/Gemini SDKs
-   MCP
-   GitHub/Jira/DSH
-   Playwright or other test frameworks

### Project data

`.ai-qa/` is the Project Quality Source of Truth.

Do not use SQLite as the source of truth for Requirement, Risk,
TestObligation, TestCase, Evidence metadata, QualityAssessment,
QualityGate, or other project-quality knowledge.

### Runtime data

SQLite is for local runtime/operational state such as sessions, agent
runs, steps, tool runs, approvals, workflow runs, and rebuildable
indexes.

Deleting runtime SQLite must not destroy project-quality data.

## 4. AI Mutation Rules

An Agent or Tool must not directly mutate `.ai-qa/`.

Required path:

`AI → Domain Operation → ChangeProposal → Validation → Human Review → Apply → Atomic Write`

Do not allow raw LLM filesystem patches as the primary mutation
mechanism.

## 5. Human Decision Boundary

AI must never impersonate a human decision-maker.

AI may produce `QualityAssessment`. AI must not autonomously create
accountable `HumanDecision` records or approve restricted quality gates.

## 6. Evidence Rules

AI reasoning, prediction, or analysis is not deterministic execution
evidence.

Execution evidence must originate from a trusted execution source such
as a test runner, CI, permitted tool, imported result, or explicit human
execution record.

## 7. Three Loops

Keep these concerns separate:

-   Agent Execution Loop: model/tool execution.
-   QA Task Loop: deterministic definition of task completion.
-   Quality Engineering Loop: event-driven reaction to quality-state
    changes.

Do not put QA business-completion logic inside the model loop.

## 8. Tool Permissions

Tools use:

-   `read`
-   `write`
-   `restricted`

Write actions follow ChangeProposal policy where required. Restricted
accountable actions require human control.

## 9. Model Providers

Core domain/application behavior must not depend on a specific model
provider.

MVP providers:

-   MockProvider
-   OpenAICompatibleProvider

Do not introduce vendor-specific logic into the Domain.

## 10. Local-first

Do not introduce PostgreSQL, Redis, Kafka, Kubernetes, cloud databases,
vector databases, or remote infrastructure into the v0.x core without an
accepted ADR.

PostgreSQL is reserved for a future optional Shared Workbench profile.

## 11. Internationalization

-   Official docs are English canonical and maintain a Chinese
    counterpart.
-   Development-process documents may be Chinese-first.
-   UI defaults to English and supports `zh-CN`.
-   Do not hard-code user-facing strings in components.
-   `uiLocale` and AI `outputLocale` are independent.
-   Domain enums and persisted machine values must be locale-neutral.

## 12. Tests Required Before Completion

Run the affected subset and, before declaring work complete, ensure:

-   lint passes
-   typecheck passes
-   architecture checks pass
-   unit tests pass
-   relevant contract tests pass
-   relevant integration tests pass
-   Golden Path E2E passes when the change affects the MVP flow
-   docs/i18n checks pass when applicable

Core CI must not require a live LLM.

## 13. Documentation

When public behavior or a stable contract changes:

1.  Update English canonical documentation.
2.  Update the Chinese counterpart.
3.  Update ADRs when an architectural decision changes.
4.  Update development notes when implementation planning changes.

## 14. Definition of Done

A change is not done until behavior, tests, architecture constraints,
i18n impact, and documentation impact have all been addressed.
