# AI Native QA Workbench --- GitHub Project Blueprint

## Project Information

**Repository:** `ai-native-qa-workbench`

**Description:** AI-native, local-first Quality Engineering Workbench
for turning requirements, risks, tests and evidence into traceable
quality decisions.

**Suggested topics:** `quality-engineering`, `software-testing`, `qa`,
`ai-testing`, `ai-native`, `agentic-ai`, `testing-tools`,
`quality-assurance`, `llm`, `ai-agents`, `local-first`.

## Product Definition

AI Native QA Workbench is a model-agnostic, local-first Quality
Engineering workspace. It connects requirements, acceptance criteria,
quality risks, test obligations, test design, execution, evidence,
assessments, gates, and human decisions.

It is not a generic agent framework, another browser-testing framework,
an LLM gateway, a prompt repository, a CI system, or a Jira replacement.

## Core Product Chain

`Requirement → AcceptanceCriterion → QualityRisk → TestObligation → TestStrategy → TestCase → TestRun → Evidence → QualityAssessment → QualityGate → HumanDecision`

## Core Differentiator

`Quality Domain + Test Obligation + Traceability + Evidence Provenance + AI-native Workflow + Quality Assessment + Human-controlled Decision + Three Loops`

## Architecture

### Three Loops

1.  **Agent Execution Loop** --- Reason → Act → Observe → Finish.
2.  **QA Task Loop** --- Analyze → Gap → Act → Validate → Re-evaluate;
    completion is validated deterministically.
3.  **Quality Engineering Loop** --- event-driven lifecycle reacting to
    requirements, code, test, evidence and quality-state changes.

### Local-first Storage

-   `.ai-qa/`: file-first project quality Source of Truth.
-   SQLite: local runtime state and rebuildable indexes.
-   Filesystem: large evidence artifacts.
-   PostgreSQL: optional future Shared Workbench adapter only.

### Human Control

AI writes are represented as semantic Domain Operations and reviewed
through `ChangeProposal`. AI can assess and recommend; accountable human
decisions remain separate.

## Core Domain

`Project`, `Iteration`, `Requirement`, `AcceptanceCriterion`,
`QualityRisk`, `TestObligation`, `TestStrategy`, `TestCase`, `TestRun`,
`Defect`, `Evidence`, `QualityAssessment`, `QualityGate`,
`HumanDecision`, `QualityTask`, `KnowledgeItem`, `TraceLink`.

## Technology Stack

-   TypeScript / Node.js 20+
-   pnpm + Turborepo
-   React + Vite
-   Fastify
-   Zod + JSON Schema
-   Markdown/YAML/JSON project store
-   SQLite + better-sqlite3 runtime store
-   Vitest + Testing Library + Playwright
-   i18next
-   GitHub Actions

## Repository Layout

``` text
apps/
  web/
  server/
  cli/

packages/
  domain/
  application/
  project-store/
  runtime-store/
  agent-runtime/
  model-providers/
  tool-runtime/
  skill-runtime/
  evidence/
  traceability/
  integrations/
  shared/

tests/
  unit/
  contract/
  integration/
  e2e/
  fixtures/

docs/
  en/
  zh-CN/
  development/
  adr/
```

## Documentation Policy

English official documentation is canonical. Chinese official
documentation mirrors it. Development-process documents may be
Chinese-first.

## Engineering Model

Contract-first + TDD:

`Contract → RED → Minimal Implementation → GREEN → REFACTOR → Architecture Check → Regression → Docs`

Core CI is deterministic and uses `MockProvider`; real model
compatibility is tested separately.
