# File Index

-   `.github/ISSUE_TEMPLATE/feature.md`
-   `.github/PULL_REQUEST_TEMPLATE.md`
-   `.github/workflows/README.md`
-   `.github/workflows/ci.yml`
-   `AGENTS.md`
-   `CHANGELOG.md`
-   `CONTRIBUTING.md`
-   `README.md`
-   `README.zh-CN.md`
-   `SECURITY.md`
-   `LICENSE`
-   `docs/adr/README.md`
-   `docs/development/GITHUB_MILESTONES_AND_EPICS.md`
-   `docs/development/RELEASE_PLAN.md`
-   `docs/development/iterations/POST_V1_PLAN.md`
-   `docs/development/iterations/V1_0_IMPLEMENTATION_PLAN.md`
-   `docs/development/migration/DSH_QA_MIGRATION_MATRIX.md`
-   `docs/development/mvp/MVP_IMPLEMENTATION_PLAN.md`
-   `docs/development/tdd/TDD_PLAN.md`
-   `docs/en/MVP.md`
-   `docs/en/PROJECT_BLUEPRINT.md`
-   `docs/en/ROADMAP.md`
-   `docs/en/TECH_STACK.md`
-   `docs/en/contracts/CORE_CONTRACT_INDEX.md`
-   `docs/en/contracts/QUALITY_FILE_CONTRACT.md`
-   `docs/en/contracts/QUALITY_DOMAIN_CONTRACT.md`
-   `docs/en/contracts/TRACEABILITY_CONTRACT.md`
-   `docs/en/contracts/CHANGE_PROPOSAL_CONTRACT.md`
-   `docs/en/contracts/AGENT_RUNTIME_CONTRACT.md`
-   `docs/en/contracts/QA_TASK_CONTRACT.md`
-   `docs/en/contracts/MODEL_PROVIDER_CONTRACT.md`
-   `docs/en/contracts/TOOL_CONTRACT.md`
-   `docs/zh-CN/MVP.md`
-   `docs/zh-CN/PROJECT_BLUEPRINT.md`
-   `docs/zh-CN/ROADMAP.md`
-   `docs/zh-CN/TECH_STACK.md`
-   `docs/zh-CN/contracts/CORE_CONTRACT_INDEX.md`
-   `docs/zh-CN/contracts/QUALITY_FILE_CONTRACT.md`
-   `docs/zh-CN/contracts/QUALITY_DOMAIN_CONTRACT.md`
-   `docs/zh-CN/contracts/TRACEABILITY_CONTRACT.md`
-   `docs/zh-CN/contracts/CHANGE_PROPOSAL_CONTRACT.md`
-   `docs/zh-CN/contracts/AGENT_RUNTIME_CONTRACT.md`
-   `docs/zh-CN/contracts/QA_TASK_CONTRACT.md`
-   `docs/zh-CN/contracts/MODEL_PROVIDER_CONTRACT.md`
-   `docs/zh-CN/contracts/TOOL_CONTRACT.md`

## v0.1 runtime and application

-   `apps/server/package.json`
-   `apps/server/src/main.ts`
-   `apps/server/src/server.ts`
-   `apps/web/package.json`
-   `apps/web/index.html`
-   `apps/web/vite.config.ts`
-   `apps/web/src/App.tsx`
-   `apps/web/src/api.ts`
-   `apps/web/src/i18n.ts`
-   `apps/web/src/main.tsx`
-   `apps/web/src/styles.css`
-   `apps/web/src/components/WorkbenchPage.tsx`
-   `apps/web/src/components/ProposalReview.tsx`
-   `apps/web/src/components/LocaleSwitcher.tsx`
-   `packages/application/src/proposals.ts`
-   `packages/application/src/requirement-analysis.ts`
-   `packages/application/src/mock-analysis-provider.ts`
-   `packages/application/src/qa-task-loop.ts`
-   `packages/runtime-store/src/schema.ts`
-   `packages/runtime-store/src/sqlite-runtime-store.ts`
-   `packages/tool-runtime/src/tool-registry.ts`
-   `packages/model-providers/src/contracts.ts`
-   `packages/model-providers/src/mock-provider.ts`
-   `packages/model-providers/src/openai-compatible-provider.ts`
-   `packages/agent-runtime/src/state.ts`
-   `packages/agent-runtime/src/agent-runner.ts`
-   `tests/setup-web.ts`
-   `playwright.config.ts`

## v0.1 tests and fixtures

-   `tests/architecture/mvp-boundaries.test.ts`
-   `tests/architecture/runtime-store-boundary.test.ts`
-   `tests/contract/quality-file.contract.test.ts`
-   `tests/contract/model-provider.contract.test.ts`
-   `tests/integration/quality-store.test.ts`
-   `tests/integration/runtime-store.test.ts`
-   `tests/integration/server.test.ts`
-   `tests/unit/application/proposals.test.ts`
-   `tests/unit/application/requirement-analysis.test.ts`
-   `tests/unit/application/qa-task-loop.test.ts`
-   `tests/unit/tool-runtime/tool-registry.test.ts`
-   `tests/unit/agent-runtime/agent-runner.test.ts`
-   `tests/unit/web/workbench-page.test.tsx`
-   `tests/unit/web/proposal-review.test.tsx`
-   `tests/e2e/golden-path.spec.ts`
-   `tests/fixtures/golden-path/project/.ai-qa/project.yaml`
-   `tests/fixtures/golden-path/project/.ai-qa/quality.yaml`

## Bootstrap implementation

-   `apps/cli/src/cli.ts`
-   `apps/cli/src/main.ts`
-   `packages/domain/src/index.ts`
-   `packages/domain/src/project.ts`
-   `packages/project-store/src/file-project-store.ts`
-   `packages/project-store/src/index.ts`
-   `packages/project-store/src/project-file.ts`
-   `packages/project-store/src/quality-file.ts`
-   `packages/project-store/src/types.ts`
-   `scripts/check-docs.ts`
-   `tests/architecture/domain-boundary.test.ts`
-   `tests/contract/project-file.contract.test.ts`
-   `tests/integration/cli.test.ts`
-   `tests/unit/domain/identifiers.test.ts`
-   `tests/unit/domain/project.test.ts`
-   `tests/unit/domain/quality-domain.test.ts`

## Quality Domain implementation

-   `packages/domain/src/identifiers.ts`
-   `packages/domain/src/quality-domain.ts`

## Quality Snapshot implementation

-   `tests/contract/quality-file.contract.test.ts`
-   `tests/unit/domain/quality-snapshot.test.ts`

## Process documents

-   `docs/superpowers/plans/2026-09-20-repository-bootstrap-and-project-contract.md`
-   `docs/superpowers/specs/2026-09-20-repository-bootstrap-and-project-contract-design.md`
-   `docs/superpowers/plans/2026-09-20-quality-domain-requirement-contract.md`
-   `docs/superpowers/specs/2026-09-20-quality-domain-requirement-contract-design.md`
-   `docs/superpowers/plans/2026-09-20-quality-risk-test-obligation-domain-contract.md`
-   `docs/superpowers/specs/2026-09-20-quality-risk-test-obligation-domain-contract-design.md`
-   `docs/superpowers/plans/2026-09-21-test-case-domain-contract.md`
-   `docs/superpowers/specs/2026-09-21-test-case-domain-contract-design.md`
-   `docs/superpowers/plans/2026-09-21-v0-1-mvp-completion.md`
-   `docs/superpowers/specs/2026-09-21-v0-1-mvp-completion-design.md`
-   `tests/e2e/start-server.mjs`
