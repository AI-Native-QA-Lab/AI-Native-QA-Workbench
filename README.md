# AI Native QA Workbench

> AI-native, local-first Quality Engineering Workbench for turning
> requirements, risks, tests, executions, and evidence into traceable
> quality decisions.

**English \| [简体中文](README.zh-CN.md)**

## Core Flow

`Requirement → Acceptance Criteria → Quality Risk → Test Obligation → Test → Execution → Evidence → Quality Assessment → Quality Gate → Human Decision`

AI assists throughout the lifecycle. Evidence and traceability keep
quality work reviewable; accountable decisions remain human-controlled.

## Why

Most AI testing tools focus on test generation, browser automation, or
generic agents. AI Native QA Workbench focuses on the
quality-engineering lifecycle itself: quality domain objects,
traceability, evidence, task completion, controlled AI changes, and
quality decisions.

## Core Principles

-   Local-first and file-first
-   Quality Domain First
-   Evidence before conclusion
-   Traceability by design
-   AI Assessment != Human Decision
-   Model agnostic
-   Human controlled
-   Three Loops architecture
-   Contract-first + TDD
-   English-first official documentation, with Chinese support

## MVP

The MVP proves one deterministic end-to-end workflow:

`Requirement → AI Analysis → AC/Risk/Obligation/Test Proposal → Human Review → .ai-qa Files → Traceability → Validation`

The same workflow must pass in CI with `MockProvider`, without a live
LLM.

## Storage

-   Project quality source of truth: `.ai-qa/` using Markdown/YAML/JSON
-   Runtime state: local SQLite
-   Large evidence artifacts: local filesystem references
-   PostgreSQL: optional future Shared Workbench capability, not a v0.x
    dependency

## Documentation

-   English canonical docs: `docs/en/`
-   Chinese official docs: `docs/zh-CN/`
-   Chinese-first development docs: `docs/development/`
-   Architecture decisions: `docs/adr/`

See [Project Blueprint](docs/en/PROJECT_BLUEPRINT.md) and
[Roadmap](docs/en/ROADMAP.md).
