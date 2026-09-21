# v0.1 MVP 剩余能力完成实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 在一个连续的 v0.1 MVP 交付中完成 Project Store、Runtime、Tool、Provider、Agent、QA Task、ChangeProposal、CLI、Server、UI、i18n 和 Golden Path。

**架构：** 保持 Domain、Project Store、Application、Runtime Store、Agent、Provider、Tool、Server 和 UI 的单向依赖。`.ai-qa/quality.yaml` 保存项目质量数据；SQLite 只保存可重建运行时数据；所有 AI 写入经过 ChangeProposal 和显式 Human Review。

**技术栈：** TypeScript、Node.js 20+、pnpm、Turborepo、YAML/Zod、better-sqlite3、Fastify、React、Vite、React Router、i18next、Vitest、Testing Library、Playwright。

**规格：** `docs/superpowers/specs/2026-09-21-v0-1-mvp-completion-design.md`

## 全局约束

- `.ai-qa/` 是 Requirement、Risk、TestObligation、TestCase、TraceLink 和已 Apply ChangeProposal 的 Source of Truth。
- SQLite 只保存 session、run、step、tool run、workflow run、approval 和可重建索引。
- Domain 不依赖文件系统、SQLite、Fastify、React、Provider SDK、MCP、GitHub/Jira 或测试框架。
- AI/Tool 不得直接修改 `.ai-qa/`；所有写操作走 ChangeProposal → Human Review → Atomic Write。
- Core CI 只使用 MockProvider，不需要网络或真实 LLM。
- `uiLocale` 与 `outputLocale` 独立；machine value 不本地化。
- 不实现 TestStrategy、TestRun、Evidence、QualityAssessment、QualityGate、Domain Event、MCP/Jira/GitHub 集成和 PostgreSQL。
- 每个任务遵循 Contract → RED → Minimal Implementation → GREEN → Architecture/Regression → Docs，并单独提交。

## Review Focus

- 错误 YAML、未知 key、数组类型错误、重复 ID 和断裂引用必须返回可定位 diagnostics，不得静默修复；Task 2 contract tests 固定。
- Proposal 在 base revision 过期、部分批准、重复操作或未经过 reviewer 时必须拒绝 apply；Task 3 application tests 固定。
- 删除 runtime SQLite 后 `.ai-qa/quality.yaml` 仍可完整恢复，且 Runtime Store 不出现质量实体表；Task 4 integration/architecture tests 固定。
- restricted/write Tool、pause/resume/cancel、timeout 和 approval 的状态转换必须可确定重放；Task 5 state-machine tests 固定。
- UI 的 `uiLocale` 和 Provider 的 `outputLocale` 不能互相覆盖；Task 7 component/E2E tests 固定。

### Task 1：冻结完成规格、依赖和测试骨架

**文件：**

- Create: `docs/superpowers/specs/2026-09-21-v0-1-mvp-completion-design.md`
- Create: `docs/superpowers/plans/2026-09-21-v0-1-mvp-completion.md`
- Verify: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.json` already provide the workspace baseline; add only the paths required by later packages.
- Create: `tests/architecture/mvp-boundaries.test.ts`

**步骤：**

- [x] 阅读 Project Blueprint、MVP、TDD、Release 和相关 Contract，确认本计划边界与现有 v0.1.0 Bootstrap 一致。
- [x] 增加新 package 的 workspace/path 入口和 architecture test 的目标清单，但不写生产实现。
- [x] 运行 `pnpm check`，确认基线仍为绿色。
- [x] 提交 `docs: plan complete v0.1 mvp delivery`。

### Task 2：QualitySnapshot、TraceLink 和质量文件 Contract

**文件：**

- Modify: `packages/domain/src/project.ts`, `packages/domain/src/quality-domain.ts`, `packages/domain/src/index.ts`
- Modify: `packages/project-store/src/types.ts`, `packages/project-store/src/index.ts`
- Create: `packages/project-store/src/quality-file.ts`
- Test: `tests/unit/domain/quality-snapshot.test.ts`, `tests/contract/quality-file.contract.test.ts`

**接口：**

- `QualitySnapshot`、`TraceLink`、`validateQualitySnapshot`
- `QUALITY_FILE_RELATIVE_PATH = ".ai-qa/quality.yaml"`
- `parseQualityFile(contents: string): StoreValidationResult`
- `serializeQualitySnapshot(snapshot: QualitySnapshot): string`

**步骤：**

- [x] 先写重复 ID、断裂引用、非法关系、合法空快照和输入不变性的 RED 测试并确认失败。
- [x] 实现 Domain 集合校验和 `TraceLink` 关系约束。
- [x] 先写 YAML malformed/unknown-key/round-trip 的 RED contract tests 并确认失败。
- [x] 实现 quality YAML parser/serializer，不将质量实体复制到 SQLite。
- [x] 运行 targeted tests、`pnpm typecheck` 和 architecture test，提交 `feat: add quality snapshot and traceability contract`。

### Task 3：Project Store 原子读写、ChangeProposal 和 Human Review

**文件：**

- Modify: `packages/project-store/src/file-project-store.ts`, `packages/project-store/src/types.ts`
- Create: `packages/application/package.json`, `packages/application/src/index.ts`, `packages/application/src/proposals.ts`, `packages/application/src/requirement-analysis.ts`
- Test: `tests/integration/quality-store.test.ts`, `tests/unit/application/proposals.test.ts`, `tests/unit/application/requirement-analysis.test.ts`

**接口：**

- `ProjectStore.readQuality(rootDirectory)`、`writeQuality(rootDirectory, snapshot)`、`validateQuality(rootDirectory)`
- `createProposal(snapshot, operations)`、`reviewProposal(proposal, decision)`、`applyApprovedProposal(store, rootDirectory, proposal)`
- `runRequirementAnalysis(input, provider)`

**步骤：**

- [x] 先写质量文件缺失、原子写入、临时文件清理、Proposal 状态和 stale base revision 的 RED 测试。
- [x] 实现 FileProjectStore 的 quality read/write/validate 和 revision hash。
- [x] 先写 approve/reject/partial approval、重复操作和关系校验 RED 测试。
- [x] 实现纯 Proposal 操作、显式 reviewer decision 和原子 apply。
- [x] 先写确定性分析 Provider 生成 Proposal 且未 approve 不写文件的 RED 测试。
- [x] 实现 Requirement Analysis application service；确定性 Completion Contract 在 Task 6 实现。
- [x] 运行 targeted integration/unit tests、`pnpm typecheck`、`pnpm build`，提交 `feat: add quality store and proposal application`。

### Task 4：SQLite Runtime Store

**文件：**

- Create: `packages/runtime-store/package.json`, `packages/runtime-store/src/index.ts`, `packages/runtime-store/src/sqlite-runtime-store.ts`, `packages/runtime-store/src/schema.ts`
- Modify: `pnpm-lock.yaml`, root `package.json`, `turbo.json`
- Test: `tests/integration/runtime-store.test.ts`, `tests/architecture/runtime-store-boundary.test.ts`

**接口：**

- `RuntimeStore`、`SqliteRuntimeStore`
- migration version `1`
- tables `agent_sessions`, `agent_runs`, `agent_steps`, `tool_runs`, `approval_requests`, `workflow_runs`

**步骤：**

- [x] 先写 migration、insert/read、close/reopen 和删除 runtime DB 不影响 quality YAML 的 RED integration tests。
- [x] 增加 `better-sqlite3` 依赖和最小 migration schema。
- [x] 实现 typed RuntimeStore methods 和参数化 SQL。
- [x] 运行 runtime integration、architecture、typecheck、build；提交 `feat: add sqlite runtime store`。

### Task 5：Tool Contract、Provider Contract 和 Agent Execution Loop

**文件：**

- Create: `packages/tool-runtime/package.json`, `packages/tool-runtime/src/index.ts`, `packages/tool-runtime/src/tool-registry.ts`
- Create: `packages/model-providers/package.json`, `packages/model-providers/src/index.ts`, `packages/model-providers/src/contracts.ts`, `packages/model-providers/src/mock-provider.ts`, `packages/model-providers/src/openai-compatible-provider.ts`
- Create: `packages/agent-runtime/package.json`, `packages/agent-runtime/src/index.ts`, `packages/agent-runtime/src/agent-runner.ts`, `packages/agent-runtime/src/state.ts`
- Test: `tests/unit/tool-runtime/tool-registry.test.ts`, `tests/contract/model-provider.contract.test.ts`, `tests/unit/agent-runtime/agent-runner.test.ts`

**接口：**

- `ToolDefinition`, `ToolRegistry`, `ToolPermission`, `ToolExecutionContext`
- `ModelProvider`, `ModelRequest`, `ModelResponse`, `MockProvider`, `OpenAICompatibleProvider`
- `AgentRunner`, `AgentState`, `AgentEvent`

**步骤：**

- [x] 先写 permission、unknown tool、approval callback 和 audit callback RED tests。
- [x] 实现 ToolRegistry；所有 write/restricted action 必须审批并记录 Runtime Store。
- [x] 先写 MockProvider sequence、OpenAI-compatible HTTP mapping 和 error RED contract tests。
- [x] 实现 provider contracts；OpenAI-compatible path 只使用注入的 `fetch` 和环境配置。
- [x] 先写 Agent state transition、maxSteps、timeout、cancel、pause/resume/approval RED tests。
- [x] 实现最小 AgentRunner，保持 Agent Loop 与 QA Task Loop 分离。
- [x] 运行 targeted tests、完整 unit tests 和 architecture test；提交 `feat: add offline provider tool and agent runtime`。

### Task 6：QA Task Loop、CLI 完整命令和本地 API

**文件：**

- Modify: `apps/cli/src/cli.ts`, `apps/cli/src/main.ts`, `apps/cli/package.json`
- Create: `apps/server/package.json`, `apps/server/src/server.ts`, `apps/server/src/main.ts`
- Test: `tests/integration/cli.test.ts`, `tests/integration/server.test.ts`, `tests/unit/application/qa-task-loop.test.ts`

**接口：**

- CLI: `qaw doctor [directory]`, `qaw open [directory]`, `qaw analyze <requirement-id> [directory]`
- Server: `GET /api/project`, `GET /api/quality`, `POST /api/analysis`, `POST /api/proposals/:id/decision`, `GET /health`
- `QualityTaskLoop`、`CompletionContract`

**步骤：**

- [x] 先写 CLI command parser/output/exit-code 和 server route RED tests。
- [x] 实现 doctor/open/analyze，并保持所有输出 machine code 与 locale-neutral data 可测试。
- [x] 先写 QA Task completion 必须经过 validate/review/apply/re-evaluate 的 RED tests。
- [x] 实现 `QualityTaskLoop` 和 Fastify server composition；默认 MockProvider，显式环境变量才启用 OpenAI-compatible Provider。
- [x] 运行 CLI/server/application integration、typecheck、build；提交 `feat: add qa task loop and local api`。

### Task 7：React/Vite Workbench UI 与国际化

**文件：**

- Create: `apps/web/package.json`, `apps/web/index.html`, `apps/web/vite.config.ts`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Create: `apps/web/src/components/WorkbenchPage.tsx`, `apps/web/src/components/ProposalReview.tsx`, `apps/web/src/components/LocaleSwitcher.tsx`
- Test: `tests/unit/web/workbench-page.test.tsx`, `tests/unit/web/proposal-review.test.tsx`
- Modify: root `package.json`, `vitest.config.ts`, `turbo.json`

**接口：**

- UI uses `uiLocale` in localStorage and sends independent `outputLocale` to `/api/analysis`.
- UI renders project/quality counts, trace links, Proposal status and approve/reject actions.
- No component reads `.ai-qa/` directly; all data comes from API client.

**步骤：**

- [x] 先写 Testing Library RED component tests for English default, zh-CN switch, count rendering, proposal review and independent output locale。
- [x] 安装并配置 React/Vite/Testing Library/jsdom dependencies；路由保持由本地 API 入口提供。
- [x] 实现 API client、i18n resources、WorkbenchPage、ProposalReview 和 responsive styles。
- [x] 运行 component tests、web build、lint/typecheck；提交 `feat: add local workbench ui and i18n`。

### Task 8：Golden Path E2E、CI 和文档

**文件：**

- Create: `playwright.config.ts`, `tests/e2e/golden-path.spec.ts`, `tests/fixtures/golden-path/*`
- Modify: `.github/workflows/ci.yml`, `package.json`
- Modify: `docs/en/contracts/CORE_CONTRACT_INDEX.md`, `docs/zh-CN/contracts/CORE_CONTRACT_INDEX.md`
- Create: `docs/en/contracts/TRACEABILITY_CONTRACT.md`, `docs/zh-CN/contracts/TRACEABILITY_CONTRACT.md`, `docs/en/contracts/CHANGE_PROPOSAL_CONTRACT.md`, `docs/zh-CN/contracts/CHANGE_PROPOSAL_CONTRACT.md`, `docs/en/contracts/AGENT_RUNTIME_CONTRACT.md`, `docs/zh-CN/contracts/AGENT_RUNTIME_CONTRACT.md`, `docs/en/contracts/QA_TASK_CONTRACT.md`, `docs/zh-CN/contracts/QA_TASK_CONTRACT.md`, `docs/en/contracts/MODEL_PROVIDER_CONTRACT.md`, `docs/zh-CN/contracts/MODEL_PROVIDER_CONTRACT.md`, `docs/en/contracts/TOOL_CONTRACT.md`, `docs/zh-CN/contracts/TOOL_CONTRACT.md`
- Modify: `README.md`, `README.zh-CN.md`, `docs/en/MVP.md`, `docs/zh-CN/MVP.md`, `docs/en/ROADMAP.md`, `docs/zh-CN/ROADMAP.md`, `docs/development/mvp/MVP_IMPLEMENTATION_PLAN.md`, `docs/development/RELEASE_PLAN.md`, `CHANGELOG.md`, `FILE_INDEX.md`

**步骤：**

- [x] 先写 Playwright Golden Path test，并通过失败回归发现并修复 Fixture 状态污染。
- [x] 实现 fixture bootstrap、Vite preview、Fastify API 和 Playwright webServer 配置，运行无网络 E2E。
- [x] 更新 CI 安装 browser、运行 `pnpm check` 和 `pnpm test:e2e`，CI 不需要真实 LLM。
- [x] 同步双语 Contract、README、MVP、Roadmap、DoD 和 CHANGELOG，明确静态/Mock/E2E 证据边界。
- [x] 运行 `pnpm check`、`pnpm test:e2e`、`git diff --check`，提交 `feat: complete v0.1 local first mvp`。

### Task 9：最终 v0.1 MVP Gate

**文件：**

- Modify: `docs/superpowers/specs/2026-09-21-v0-1-mvp-completion-design.md`, `docs/superpowers/plans/2026-09-21-v0-1-mvp-completion.md`

**步骤：**

- [x] 运行 `pnpm check`、`pnpm test:e2e`、架构检查、文档/i18n 检查和质量文件 round-trip 检查。
- [x] 做两轮标准与 spec review，修复 Critical/Important；Minor 记录但不扩大范围。
- [x] 更新 v0.1 MVP 完成状态、CHANGELOG、Release Plan 和最终验证记录。
- [x] 核验工作区、提交历史、CI 结果和未实现边界；提交 `docs: close v0.1 mvp implementation`。

## 公开交付定义

本计划全部任务完成后，才允许把 v0.1 MVP 描述为完成。v0.1.0 Bootstrap Release 不回写为完整 MVP；是否创建后续 v0.1.x closeout Release，必须依据最终 Gate 和用户另行确认。
