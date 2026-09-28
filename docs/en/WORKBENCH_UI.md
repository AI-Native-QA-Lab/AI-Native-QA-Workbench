# Workbench UI

The local React/Vite Workbench uses a compact control-room layout inspired by
the information architecture of dsh-qa while keeping this repository's
local-first and human-review boundaries.

## Views

- **Dashboard** presents the current `quality.yaml` snapshot, a six-stage
  quality flow, a quality radar, and the requirement analysis entry point.
- **Pipeline** presents the available requirements, test design obligations,
  and test cases as a six-stage project flow. Execution, defect regression,
  and release remain explicitly `Not connected` until their contracts and API
  surfaces are implemented.
- **Assistant** keeps project context, requirement analysis, proposal review,
  and quality signals in one workspace.

The primary rail navigates these three views. Requirements, Test cases, and
Evidence are visible as planned work areas, but are disabled until dedicated
server/API read models exist. The Evidence contract is implemented for the
local CLI and project files in v0.2; the Workbench does not claim to display
execution evidence yet.

## Interaction and boundaries

- The UI defaults to English and switches to `zh-CN`; AI output locale is an
  independent analysis setting.
- Requirement analysis creates a ChangeProposal. A human reviewer must still
  approve or reject it before project quality files change.
- The project files under `.ai-qa/` remain the quality source of truth.
- The formal view state uses `?view=dashboard|pipeline|assistant`. Links using
  the earlier prototype `?variant=` parameter remain readable for local
  preview continuity.

## Preview locally

```bash
pnpm --filter @ai-native-qa-workbench/web dev
```

Open `http://127.0.0.1:4173/` for Dashboard. The Pipeline and Assistant views
are available from the left rail or with `?view=pipeline` and
`?view=assistant`.
