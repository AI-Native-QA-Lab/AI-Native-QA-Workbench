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

The v0.1 MVP runs locally and keeps project-quality data in `.ai-qa/`:

```bash
pnpm install
pnpm qaw init ./example-project
pnpm qaw validate ./example-project
pnpm qaw doctor ./example-project
pnpm qaw open ./example-project
```

`qaw init` creates an empty `quality.yaml`; it does not create a Requirement.
Add a valid Requirement with id `checkout` to `.ai-qa/quality.yaml` before
running the example analysis:

```bash
pnpm qaw analyze checkout ./example-project
```

To start the local API and UI:

```bash
QAW_ROOT_DIRECTORY="$PWD/example-project" pnpm --filter @ai-native-qa-workbench/server dev
pnpm --filter @ai-native-qa-workbench/web dev
```

The `v0.1.0` tag is the earlier Bootstrap release. The completed v0.1 MVP
implementation is the unreleased local closeout; its closeout commits are not
yet pushed or published as a new tag/Release, and the Bootstrap tag is not
retroactively rewritten.

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

## Current v0.1 MVP Scope

The MVP implements:

- `.ai-qa/project.yaml` and `.ai-qa/quality.yaml` contracts
- pure Domain validation, TraceLink, and deterministic Completion Contract
- atomic Project Store writes with ChangeProposal and explicit Human Review
- SQLite runtime state isolated from project-quality data
- Tool permissions/audit, MockProvider, OpenAI-compatible provider boundary,
  and Agent Execution Loop
- `qaw init`, `validate`, `doctor`, `open`, and `analyze`
- local Fastify API, React/Vite Workbench, English/zh-CN UI, and independent
  `uiLocale`/`outputLocale`
- offline unit, contract, integration, architecture, documentation, and
  Playwright Golden Path gates

Evidence execution, Quality Assessment/Gate, HumanDecision persistence, Domain
Events, external integrations, and Shared Workbench remain later roadmap scope.

## Storage

- Project quality source of truth: `.ai-qa/` using Markdown/YAML/JSON
- Runtime state: local SQLite (`agent_sessions`, runs, steps, tool runs,
  approvals, workflows)
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

## License

PolyForm Noncommercial License 1.0.0. See [LICENSE](LICENSE).
