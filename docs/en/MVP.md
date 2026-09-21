# MVP --- v0.1

## Current status

The v0.1.0 tag is the Bootstrap release. The remaining v0.1 MVP implementation
is now complete in the unreleased closeout working tree; the Bootstrap tag is
not rewritten.

## Quick Start

```bash
pnpm install
pnpm qaw init ./example-project
pnpm qaw validate ./example-project
pnpm qaw doctor ./example-project
pnpm qaw open ./example-project
pnpm qaw analyze checkout ./example-project
```

## Implemented v0.1 MVP

- `.ai-qa/project.yaml` and `.ai-qa/quality.yaml` contracts
- QualitySnapshot, TraceLink, collection validation, and atomic quality writes
- ChangeProposal, Human Review, revision conflict detection, and deterministic
  QA Task Completion
- SQLite runtime store, ToolRegistry, Mock/OpenAI-compatible providers, and
  AgentRunner
- `qaw init`, `validate`, `doctor`, `open`, and `analyze`
- Fastify local API, React/Vite Workbench, bilingual UI, and Playwright Golden
  Path
- The Workbench requires a non-empty reviewer identifier before a decision can
  be submitted; UI locale and AI output locale remain independent.

## Golden Path

1. Initialize a project with `qaw init`.
2. Create/load a Requirement.
3. Start a Requirement Analysis QualityTask.
4. Agent Execution Loop reads project context.
5. AI proposes Acceptance Criteria, Risks, Test Obligations and Test
   Cases.
6. Workbench creates a ChangeProposal.
7. Human reviews all or selected changes.
8. Approved operations are validated and atomically written into `.ai-qa/`.
9. Traceability is rebuilt.
10. Completion Contract validates the QA Task.
11. `qaw validate` passes.
12. `git diff .ai-qa/` clearly shows the quality changes.

The path is implemented with MockProvider and local fixture data. It does not
prove live LLM quality, external integrations, production deployment, or
execution Evidence.

## Deferred scope

TestRun, Evidence, QualityAssessment, QualityGate, Domain Events, MCP,
GitHub/Jira, remote execution, multi-user/RBAC, PostgreSQL, and Shared
Workbench remain deferred to v0.2/v0.3/1.x/2.x roadmap milestones.

## Evidence boundary

Static checks, unit/contract/integration tests, MockProvider replay, and local
browser E2E are separate evidence classes. None is a live model replay,
external CI result, production deployment, or Google/remote acceptance signal.

## MVP exit criteria

`pnpm check` and `pnpm test:e2e` pass without a live LLM or network-dependent
model call; Domain, Store, Runtime, Tool, Provider, Agent, QA Task, API, UI,
i18n, architecture, and docs boundaries are covered.
