# AI Native QA Workbench

> AI-native, local-first Quality Engineering Workbench for turning
> requirements, risks, tests, executions, and evidence into traceable
> quality decisions.

**English \| [简体中文](README.zh-CN.md)**

## Core Flow

`Requirement → Acceptance Criteria → Quality Risk → Test Obligation → Test → Execution → Evidence → Quality Assessment → Quality Gate → Human Decision`

AI assists throughout the lifecycle. Evidence and traceability keep
quality work reviewable; accountable decisions remain human-controlled.

## Quick Start

The current bootstrap slice creates and validates the local project contract:

```bash
pnpm install
pnpm qaw init ./example-project
pnpm qaw validate ./example-project
```

This release does not claim the later `doctor`, `open`, or AI analysis
workflows; those remain in the roadmap.

## Why

Most AI testing tools focus on test generation, browser automation, or
generic agents. AI Native QA Workbench focuses on the
quality-engineering lifecycle itself: quality domain objects,
traceability, evidence, task completion, controlled AI changes, and
quality decisions.

## Core Principles

- Local-first and file-first
- Quality Domain First
- Evidence before conclusion
- Traceability by design
- AI Assessment != Human Decision
- Model agnostic
- Human controlled
- Three Loops architecture
- Contract-first + TDD
- English-first official documentation, with Chinese support

## Current Bootstrap Scope

The current v0.1 bootstrap implements:

- The `.ai-qa/project.yaml` Project File Contract
- Deterministic domain validation and a local file store
- `qaw init` and `qaw validate`
- Offline unit, contract, integration, architecture, and documentation
  quality gates

Agent Runtime, SQLite runtime state, UI, providers, Evidence, and the
Golden Path AI workflow are planned work; they are not available commands
in this bootstrap.

## Storage

- Project quality source of truth: `.ai-qa/` using Markdown/YAML/JSON
- Runtime state: local SQLite, planned for a later implementation slice
- Large evidence artifacts: local filesystem references
- PostgreSQL: optional future Shared Workbench capability, not a current
  dependency

## Documentation

- English canonical docs: `docs/en/`
- Chinese official docs: `docs/zh-CN/`
- Chinese-first development docs: `docs/development/`
- Architecture decisions: `docs/adr/`

See [Project Blueprint](docs/en/PROJECT_BLUEPRINT.md) and
[Roadmap](docs/en/ROADMAP.md).
