# MVP --- v0.1

## Current bootstrap status

The current v0.1 slice establishes a deterministic local foundation rather
than the complete AI workflow.

## Quick Start

```bash
pnpm install
pnpm qaw init ./example-project
pnpm qaw validate ./example-project
```

## Implemented

- `.ai-qa/project.yaml` Project File Contract
- Project domain validation and stable project ID derivation
- Local file store with atomic initialization and overwrite protection
- `qaw init` and `qaw validate`
- Offline unit, contract, integration, architecture, and documentation
  quality gates

## Planned Golden Path

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

The planned path is not implemented by the current bootstrap.

## Planned MVP Scope

Agent Runtime, SQLite runtime state, Tool Runtime, MockProvider,
OpenAICompatibleProvider, Agent Execution Loop, QA Task Loop, Completion
Contract, ChangeProposal approval, Requirement Analysis, Traceability UI,
English / zh-CN UI, and deterministic Golden Path E2E remain planned.

## Bootstrap exclusions

Evidence execution adapters, Quality Gate, full Quality Engineering Loop,
Skills, multiple native providers, MCP/GitHub/Jira, PostgreSQL,
multi-user/RBAC, vector database, and Kubernetes are not part of the
bootstrap slice.

## Bootstrap exit criteria

The Project File Contract and both CLI commands pass the offline quality
gates. The planned Golden Path has a separate exit criterion: it must pass
without Internet using MockProvider.
