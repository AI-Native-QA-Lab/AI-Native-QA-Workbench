# v0.3 Quality Engineering Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` (or `superpowers:subagent-driven-development` when an approved subagent workflow is available) to implement this plan task-by-task. Each step uses checkbox syntax and must preserve the RED → GREEN evidence required by the repository.

**Goal:** 在不破坏 v0.1/v0.2 Project File Contract 的前提下，交付 v0.3 Domain Events、Workflow Runtime、QualityAssessment、QualityGate、HumanDecision 和事件驱动的 Three Loops。

**Architecture:** `.ai-qa/quality-engineering.yaml` 是 Assessment/Gate/HumanDecision 的项目质量 Source of Truth；SQLite migration 2 只保存事件、Workflow 和步骤运行时状态。纯 Domain 定义不可变事件与质量实体，Application 负责规则评估、幂等 Workflow 和人类决策边界，CLI/API/UI 只调用 Application boundary。

**Tech Stack:** TypeScript、Node.js 22.22.2+、pnpm/Turborepo、Vitest、Fastify、React/Vite、Playwright、YAML、SQLite/better-sqlite3、现有 MockProvider。

**Spec:** `docs/superpowers/specs/2026-09-27-v0-3-quality-engineering-loop-design.md`

## Global Constraints

- 保持 `.ai-qa/project.yaml` 和 `.ai-qa/quality.yaml` 的 schema version `"0.1"` 不变。
- 保持 `.ai-qa/evidence.yaml` 的 schema version `"0.2"` 不变。
- 新增 `.ai-qa/quality-engineering.yaml`，schema version 必须是 `"0.3"`；缺失文件视为空快照。
- `packages/domain` 必须保持纯 TypeScript，不依赖 Node、filesystem、SQLite、Fastify、React、Provider、MCP 或测试框架。
- `.ai-qa/` 是 Requirement、Evidence、QualityAssessment、QualityGate、HumanDecision 等项目质量数据的 Source of Truth；SQLite 只能保存可重建 runtime state。
- AI/Agent/Provider 只能生成 Assessment 或 Proposal，不能创建 HumanDecision，也不能直接写 `.ai-qa/`。
- 所有新增文件写入使用 revision 检查、同目录临时文件和 atomic rename；stale revision 必须 fail closed。
- Core CI 不调用真实 LLM、远程服务或外部基础设施；默认 Assessment Provider 必须是确定性规则实现。
- 所有公共用户文案同时维护 English canonical 和 `zh-CN` counterpart；`uiLocale` 与 `outputLocale` 独立。
- 每个产品行为都先写一个能真实失败的测试并记录 RED，再写最小实现；不得用测试文本 grep 代替行为验证。
- 不创建 tag、GitHub Release、远端 Milestone、PR、部署或 registry publication；这些不属于本次本地实现授权。

## Review Focus

- 缺少 Evidence、空结果、unknown/incomplete/skipped 不能被误判为通过；由 Task 4 的规则优先级测试覆盖。
- 未验证 provenance 与 checksum integrity 必须保持独立；由 Task 2/4/5 的跨文件和评估测试覆盖。
- 重复事件和进程中断重试不能重复写 Assessment/Gate；由 Task 3/5 的幂等与 pending-retry 测试覆盖。
- 过期 revision、未知 YAML key 和跨文件坏引用必须 fail closed；由 Task 2/6 的 Contract/Integration 测试覆盖。
- AI、Workflow 或缺失 reviewer 不能产生 HumanDecision；由 Task 6/7/8 的 boundary、API、CLI 和 E2E 测试覆盖。

---

### Task 1: Domain Event 与 Quality Engineering Domain Contract

**Files:**
- Create: `packages/domain/src/domain-events.ts`
- Create: `packages/domain/src/quality-engineering-domain.ts`
- Modify: `packages/domain/src/project.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `tests/unit/domain/domain-events.test.ts`
- Test: `tests/unit/domain/quality-engineering-domain.test.ts`
- Modify: `tests/architecture/domain-boundary.test.ts`

**Interfaces:**
- Produces `DOMAIN_EVENT_SCHEMA_VERSION`, `DomainEvent`, `DomainEventType`, `validateDomainEvent`。
- Produces `QUALITY_ENGINEERING_SCHEMA_VERSION`, `QualityTarget`, `QualityAssessment`, `QualityGate`, `HumanDecision`, `QualityEngineeringSnapshot`。
- Produces `validateQualityEngineeringSnapshot`, `mapAssessmentVerdictToGateOutcome` 和 `resolveQualityGateStatus`。
- Extends `DiagnosticCode` with stable `QUALITY_ENGINEERING_*` and `DOMAIN_EVENT_*` codes。
- Consumes only existing `isValidKebabCaseId`, `Diagnostic` and `ValidationResult`。

- [ ] **Step 1: Write the failing domain event tests**

  Add tests that prove a valid `quality.assessment.requested` event is accepted, unsupported event type/schema/aggregate/source/time/id is rejected, and a non-JSON-safe payload is rejected without filesystem access.

- [ ] **Step 2: Run the event tests to verify RED**

  Run: `pnpm exec vitest run tests/unit/domain/domain-events.test.ts`

  Expected: FAIL because `domain-events.ts` exports and validators do not exist yet; failures must be missing behavior, not a test import typo.

- [ ] **Step 3: Implement the minimal event contract**

  Implement the exact event envelope from the Spec, including `quality.assessment.requested`, `quality.proposal.applied`, `evidence.imported`, `quality.assessment.created`, `quality.gate.evaluated`, and `quality.human-decision.recorded`. Validate IDs, RFC 3339 timestamps, schema, enum values and JSON-safe payloads without importing Node APIs.

- [ ] **Step 4: Run event tests to verify GREEN**

  Run: `pnpm exec vitest run tests/unit/domain/domain-events.test.ts`

  Expected: PASS with all event cases green.

- [ ] **Step 5: Write the failing Assessment/Gate/Decision tests**

  Add literal fixtures covering verdict-to-outcome mapping, target mismatch, missing assessment/gate references, duplicate IDs, invalid reason/evidence arrays, invalid timestamps, reviewer/rationale requirements, pending status, latest decision ordering, and `approve`/`reject`/`waive` resolution.

- [ ] **Step 6: Run the domain tests to verify RED**

  Run: `pnpm exec vitest run tests/unit/domain/quality-engineering-domain.test.ts`

  Expected: FAIL because the v0.3 domain types and validator functions do not exist yet.

- [ ] **Step 7: Implement the minimal v0.3 domain**

  Keep the snapshot validator pure and fail closed. Do not add a persisted gate status; derive `pending|approved|rejected|waived` from the ordered HumanDecision records. Preserve input strings and do not normalize IDs.

- [ ] **Step 8: Run domain tests and architecture boundary tests**

  Run: `pnpm exec vitest run tests/unit/domain/domain-events.test.ts tests/unit/domain/quality-engineering-domain.test.ts tests/architecture/domain-boundary.test.ts`

  Expected: PASS with no forbidden infrastructure imports.

- [ ] **Step 9: Commit Task 1**

  ```bash
  git add packages/domain/src/domain-events.ts packages/domain/src/quality-engineering-domain.ts packages/domain/src/project.ts packages/domain/src/index.ts tests/unit/domain/domain-events.test.ts tests/unit/domain/quality-engineering-domain.test.ts tests/architecture/domain-boundary.test.ts
  git commit -m "feat: add v0.3 quality engineering domain contracts"
  ```

### Task 2: Quality Engineering YAML File Contract 与 Project Store

**Files:**
- Create: `packages/project-store/src/quality-engineering-file.ts`
- Create: `packages/project-store/src/quality-engineering-store.ts`
- Modify: `packages/project-store/src/types.ts`
- Modify: `packages/project-store/src/index.ts`
- Test: `tests/contract/quality-engineering-file.contract.test.ts`
- Test: `tests/integration/quality-engineering-store.test.ts`

**Interfaces:**
- Produces `QUALITY_ENGINEERING_FILE_RELATIVE_PATH = ".ai-qa/quality-engineering.yaml"`。
- Produces `parseQualityEngineeringFile(contents: string)` and `serializeQualityEngineeringSnapshot(snapshot)`。
- Produces `QualityEngineeringStore`, `QualityEngineeringReadResult`, `QualityEngineeringValidationResult`, `QualityEngineeringWriteResult`。
- Produces `FileQualityEngineeringStore` with missing-file empty snapshot, strict YAML key validation, SHA-256 revision and atomic writes。
- `QualityEngineeringReadResult`/`QualityEngineeringValidationResult` expose `{ valid, qualityEngineering?, revision, diagnostics }`; `QualityEngineeringWriteResult` exposes `{ written, qualityEngineeringPath, revision?, diagnostics }`。
- Consumes `validateQualityEngineeringSnapshot`, `FileProjectStore.readQuality`, `EvidenceStore.validateEvidence` and `EvidenceArtifactStore.verifyEvidence` only at the cross-file validation layer。

- [ ] **Step 1: Write the failing file-contract tests**

  Add tests for the exact empty YAML shape, stable serialization order/trailing newline, unknown top-level and nested keys, malformed YAML, unsupported schema, invalid domain values, and round-trip preservation of literal Assessment/Gate/Decision arrays.

- [ ] **Step 2: Run the contract tests to verify RED**

  Run: `pnpm exec vitest run tests/contract/quality-engineering-file.contract.test.ts`

  Expected: FAIL because the v0.3 parser/serializer do not exist.

- [ ] **Step 3: Implement strict parse/serialize**

  Follow the existing `quality-file.ts`/`evidence-file.ts` style. Reject unknown keys at every object level, map Domain diagnostics to `StoreDiagnostic`, preserve collection order, and never insert runtime payloads into the project-quality file.

- [ ] **Step 4: Run contract tests to verify GREEN**

  Run: `pnpm exec vitest run tests/contract/quality-engineering-file.contract.test.ts`

  Expected: PASS with deterministic YAML output.

- [ ] **Step 5: Write the failing Store integration tests**

  Add temporary-project tests for missing file as empty, revision calculation, creation/update stale-revision rejection, atomic write failure preservation, Assessment evidence references, Gate assessment references, HumanDecision gate references, Requirement/TestRun target checks, and v0.1/v0.2 files remaining unchanged.

- [ ] **Step 6: Run Store tests to verify RED**

  Run: `pnpm exec vitest run tests/integration/quality-engineering-store.test.ts`

  Expected: FAIL because the Store interface/class and cross-file validation do not exist.

- [ ] **Step 7: Implement `FileQualityEngineeringStore`**

  Use resolved root paths, same-directory temporary files, SHA-256 manifest revisions and the existing error/diagnostic conventions. `validateQualityEngineering` must load quality/evidence snapshots and check references, while full artifact bytes verification remains delegated to `verifyEvidence`.

- [ ] **Step 8: Run Store and existing file-contract regression tests**

  Run: `pnpm exec vitest run tests/contract/quality-engineering-file.contract.test.ts tests/contract/quality-file.contract.test.ts tests/contract/evidence-file.contract.test.ts tests/integration/quality-engineering-store.test.ts`

  Expected: PASS; existing v0.1/v0.2 file contracts remain green.

- [ ] **Step 9: Commit Task 2**

  ```bash
  git add packages/project-store/src/quality-engineering-file.ts packages/project-store/src/quality-engineering-store.ts packages/project-store/src/types.ts packages/project-store/src/index.ts tests/contract/quality-engineering-file.contract.test.ts tests/integration/quality-engineering-store.test.ts
  git commit -m "feat: add quality engineering project store"
  ```

### Task 3: Runtime Store Migration 2、Domain Event Log 与 Workflow Steps

**Files:**
- Modify: `packages/runtime-store/src/schema.ts`
- Modify: `packages/runtime-store/src/sqlite-runtime-store.ts`
- Modify: `packages/runtime-store/src/index.ts`
- Test: `tests/integration/runtime-store.test.ts`
- Modify: `tests/architecture/runtime-store-boundary.test.ts`

**Interfaces:**
- Extends `RuntimeStore` with `appendDomainEvent`, `getDomainEvent`, `listPendingDomainEvents`, `markDomainEventProcessed`, `markDomainEventFailed`, `findWorkflowRun`, `appendWorkflowStep`, `updateWorkflowRun` and list methods。
- Produces `RuntimeDomainEventRecord`, `RuntimeWorkflowStep`, `RuntimeWorkflowStatus` and typed event status values。
- Keeps existing session/run/step/tool/approval/workflow APIs source-compatible; existing `appendWorkflowRun({runId, kind, status})` remains valid。
- Migration 2 adds `domain_events`, `workflow_steps` and idempotency columns/constraints without any quality entity table.

The new methods use these exact boundaries:

```ts
appendDomainEvent(event: DomainEvent, projectRoot: string): string;
listPendingDomainEvents(projectRoot: string): RuntimeDomainEventRecord[];
markDomainEventProcessed(eventId: string, processedAt: string): void;
markDomainEventFailed(eventId: string, error: string, failedAt: string): void;
findWorkflowRun(input: { triggerEventId: string; kind: string }): RuntimeWorkflowRun | undefined;
appendWorkflowStep(input: { workflowRunId: string; key: string; status: string; payload: unknown }): string;
updateWorkflowRun(id: string, input: { status: string; error?: string; completedAt?: string }): void;
```

- [ ] **Step 1: Write failing migration/event/step tests**

  Extend the runtime integration test with migration version 2, close/reopen persistence, event payload round-trip, pending/processed/failed transitions, duplicate event ID behavior, unique `(triggerEventId, workflowKind)`, workflow step ordering, and deletion of the runtime database leaving all project-quality files unchanged.

- [ ] **Step 2: Run runtime tests to verify RED**

  Run: `pnpm exec vitest run tests/integration/runtime-store.test.ts`

  Expected: FAIL because migration 2 and the new RuntimeStore methods do not exist.

- [ ] **Step 3: Implement migration 2 and typed runtime operations**

  Add explicit migration handling from version 1 to 2. Store only event envelope/payload JSON, status, retry/error timestamps and Workflow metadata. Enforce idempotency in SQLite and return existing records rather than creating duplicates.

- [ ] **Step 4: Run runtime tests to verify GREEN**

  Run: `pnpm exec vitest run tests/integration/runtime-store.test.ts`

  Expected: PASS with migration version 2 and all existing runtime audit behavior intact.

- [ ] **Step 5: Run runtime architecture checks**

  Run: `pnpm exec vitest run tests/architecture/runtime-store-boundary.test.ts`

  Expected: PASS and no `requirements`, `quality`, `evidence`, `assessment`, `gate` or `human_decision` project-quality tables are introduced.

- [ ] **Step 6: Commit Task 3**

  ```bash
  git add packages/runtime-store/src/schema.ts packages/runtime-store/src/sqlite-runtime-store.ts packages/runtime-store/src/index.ts tests/integration/runtime-store.test.ts tests/architecture/runtime-store-boundary.test.ts
  git commit -m "feat: persist v0.3 workflow runtime events"
  ```

### Task 4: Deterministic QualityAssessment Provider 与 Gate Evaluation

**Files:**
- Create: `packages/application/src/quality-assessment.ts`
- Create: `packages/application/src/quality-gate.ts`
- Modify: `packages/application/src/index.ts`
- Test: `tests/unit/application/quality-assessment.test.ts`
- Test: `tests/unit/application/quality-gate.test.ts`

**Interfaces:**
- Produces `QualityAssessmentInput`, `QualityAssessmentDraft`, `QualityAssessmentProvider` and `RuleBasedQualityAssessmentProvider`。
- Produces `createQualityAssessment`, `createQualityGate` and `assessmentToGateOutcome`。
- Consumes Domain types and v0.2 `EvidenceSnapshot` plus readonly validation/integrity diagnostics；不读文件、不写 Store、不调用 ModelProvider。

The constructors/functions use these exact signatures:

```ts
createQualityAssessment(input: {
  id: string;
  target: QualityTarget;
  draft: QualityAssessmentDraft;
  basedOnRevision: string | null;
  createdAt: string;
}): QualityAssessment;

createQualityGate(input: {
  id: string;
  kind: QualityGateKind;
  target: QualityTarget;
  assessment: QualityAssessment;
  evaluatedAt: string;
}): QualityGate;
```

- [ ] **Step 1: Write failing rule tests**

  Add one literal test per priority rule: invalid project/evidence/integrity, no evidence, empty/unknown/incomplete/skipped results, failed result, error result, clean unverified evidence, clean trusted/human-recorded evidence, and stable reason-code ordering. Add gate mapping tests for all four verdicts.

- [ ] **Step 2: Run rule tests to verify RED**

  Run: `pnpm exec vitest run tests/unit/application/quality-assessment.test.ts tests/unit/application/quality-gate.test.ts`

  Expected: FAIL because the provider and gate functions do not exist.

- [ ] **Step 3: Implement minimal deterministic assessment and gate logic**

  Apply the Spec priority order exactly. Never calculate a numeric score, never mutate trust, never infer TestCase links, and never create HumanDecision. Use injected clock/ID factories only at the application boundary so unit expectations remain literal and deterministic.

- [ ] **Step 4: Run rule tests to verify GREEN**

  Run: `pnpm exec vitest run tests/unit/application/quality-assessment.test.ts tests/unit/application/quality-gate.test.ts`

  Expected: PASS with every rule and mapping covered.

- [ ] **Step 5: Commit Task 4**

  ```bash
  git add packages/application/src/quality-assessment.ts packages/application/src/quality-gate.ts packages/application/src/index.ts tests/unit/application/quality-assessment.test.ts tests/unit/application/quality-gate.test.ts
  git commit -m "feat: add deterministic quality assessment and gates"
  ```

### Task 5: Event Publisher、Quality Engineering Workflow 与 Three Loops Integration

**Files:**
- Create: `packages/application/src/domain-event-publisher.ts`
- Create: `packages/application/src/quality-engineering-workflow.ts`
- Modify: `packages/application/src/evidence-import.ts`
- Modify: `packages/application/src/qa-task-loop.ts`
- Modify: `packages/application/src/index.ts`
- Modify: `packages/application/package.json`
- Test: `tests/integration/quality-engineering-workflow.test.ts`
- Test: `tests/unit/application/domain-event-publisher.test.ts`

**Interfaces:**
- Produces `DomainEventPublisher` with `publish(event: DomainEvent): Promise<void>`。
- Produces `SqliteQualityEngineeringWorkflow` implementing `QualityEngineeringWorkflow` from the Spec。
- Workflow constructor consumes `ProjectStore`, `EvidenceStore`, `EvidenceArtifactStore`, `QualityEngineeringStore`, `RuntimeStore`, `QualityAssessmentProvider`, clock and ID factory。
- `EvidenceImportService` and `QualityTaskLoop` accept an optional publisher; when the manifest/proposal apply has succeeded, they publish `evidence.imported` or `quality.proposal.applied` after the atomic write。
- Workflow handles `quality.assessment.requested`, `quality.proposal.applied`, and `evidence.imported`; generated assessment/gate events do not recursively trigger the same workflow。

The Workflow constructor uses:

```ts
interface QualityEngineeringWorkflowDependencies {
  projectStore: ProjectStore;
  evidenceStore: EvidenceStore & EvidenceArtifactStore;
  qualityEngineeringStore: QualityEngineeringStore;
  runtimeStore: RuntimeStore;
  assessmentProvider: QualityAssessmentProvider;
  clock?: () => string;
  idFactory?: () => string;
}

class SqliteQualityEngineeringWorkflow implements QualityEngineeringWorkflow {
  constructor(dependencies: QualityEngineeringWorkflowDependencies);
}
```

- [ ] **Step 1: Write failing publisher and workflow tests**

  Add integration fixtures that initialize a real temporary project, create/import a valid Evidence artifact, dispatch `quality.assessment.requested`, and assert the YAML snapshot contains one Assessment and one Gate while SQLite contains one event, one Workflow Run and ordered steps. Add duplicate dispatch, pending retry after a forced Store failure, proposal-applied routing, and evidence-import routing tests.

- [ ] **Step 2: Run workflow tests to verify RED**

  Run: `pnpm exec vitest run tests/unit/application/domain-event-publisher.test.ts tests/integration/quality-engineering-workflow.test.ts`

  Expected: FAIL because the publisher, Workflow and optional service hooks do not exist.

- [ ] **Step 3: Implement event persistence and routing**

  Persist the incoming event before routing, derive a stable Workflow idempotency key, create a runtime run, append each step, atomically write the v0.3 snapshot, append generated audit events, and mark the source event processed only after both Assessment and Gate are valid. Preserve failed runs and retryable event state.

- [ ] **Step 4: Add event hooks after existing application writes**

  In Evidence import, publish only after artifact and manifest commits/reload validation succeed. In QA Task Loop, publish only after ChangeProposal apply and re-evaluation complete. Existing constructors without a publisher remain valid and existing v0.1/v0.2 behavior remains unchanged.

- [ ] **Step 5: Run workflow tests to verify GREEN**

  Run: `pnpm exec vitest run tests/unit/application/domain-event-publisher.test.ts tests/integration/quality-engineering-workflow.test.ts tests/integration/evidence-import.test.ts tests/unit/application/qa-task-loop.test.ts`

  Expected: PASS, including event-to-workflow routing and existing evidence/proposal behavior.

- [ ] **Step 6: Run the affected architecture and application regression tests**

  Run: `pnpm exec vitest run tests/architecture tests/unit/application tests/integration/evidence-import.test.ts tests/integration/quality-store.test.ts`

  Expected: PASS; no loop completion logic moves into AgentRunner.

- [ ] **Step 7: Commit Task 5**

  ```bash
  git add packages/application/src/domain-event-publisher.ts packages/application/src/quality-engineering-workflow.ts packages/application/src/evidence-import.ts packages/application/src/qa-task-loop.ts packages/application/src/index.ts packages/application/package.json tests/unit/application/domain-event-publisher.test.ts tests/integration/quality-engineering-workflow.test.ts
  git commit -m "feat: connect quality engineering workflows to domain events"
  ```

### Task 6: HumanDecision Application Service 与安全边界

**Files:**
- Create: `packages/application/src/human-decision.ts`
- Modify: `packages/application/src/index.ts`
- Test: `tests/unit/application/human-decision.test.ts`
- Test: `tests/integration/human-decision.test.ts`

**Interfaces:**
- Produces `HumanDecisionService` and `FileHumanDecisionService`/factory with `record(input)` from the Spec。
- Consumes `QualityEngineeringStore`, `ProjectStore`, `EvidenceStore`, `DomainEventPublisher`, `RuntimeStore` only for audit correlation。
- Returns `HumanDecisionResult` containing persisted decision, revised snapshot, resolved gate status and diagnostics。

`record` accepts the exact input from the Spec and returns:

```ts
interface HumanDecisionResult {
  written: boolean;
  decision?: HumanDecision;
  qualityEngineering?: QualityEngineeringSnapshot;
  resolvedGateStatus?: ResolvedGateStatus;
  revision?: string;
  diagnostics: readonly StoreDiagnostic[];
}
```

- [ ] **Step 1: Write failing service tests**

  Add tests for missing reviewer, whitespace-only rationale, unknown gate, stale revision, invalid current snapshot, successful approve/reject/waive, deterministic resolved status, atomic write, and emitted event with `source: "human"`. Add a test proving a provider/workflow dependency has no method that can create a HumanDecision.

- [ ] **Step 2: Run service tests to verify RED**

  Run: `pnpm exec vitest run tests/unit/application/human-decision.test.ts tests/integration/human-decision.test.ts`

  Expected: FAIL because the service and result types do not exist.

- [ ] **Step 3: Implement the explicit human boundary**

  Re-read all current files before writing, require non-empty reviewer/rationale and expected revision, append only a validated decision, write atomically, publish the human-sourced event after success, and return `resolveQualityGateStatus`. Do not add a trusted shortcut or AI flag.

- [ ] **Step 4: Run service tests to verify GREEN**

  Run: `pnpm exec vitest run tests/unit/application/human-decision.test.ts tests/integration/human-decision.test.ts`

  Expected: PASS with all rejection and success paths covered.

- [ ] **Step 5: Commit Task 6**

  ```bash
  git add packages/application/src/human-decision.ts packages/application/src/index.ts tests/unit/application/human-decision.test.ts tests/integration/human-decision.test.ts
  git commit -m "feat: enforce human quality gate decisions"
  ```

### Task 7: CLI Quality Commands 与 Validation/Doctor Integration

**Files:**
- Modify: `apps/cli/src/cli.ts`
- Modify: `apps/cli/src/main.ts`
- Modify: `apps/cli/package.json`
- Test: `tests/integration/cli-quality-engineering.test.ts`
- Modify: `tests/integration/cli.test.ts`

**Interfaces:**
- Extends CLI parser with `quality validate`, `quality evaluate`, `quality process`, and `quality decide` exactly as specified。
- Adds injectable `qualityEngineeringStore`, `runtimeStore`, `workflow`, `humanDecisionService`, stdout/stderr and clock dependencies for deterministic tests。
- Existing commands and exit codes remain unchanged；new syntax errors use the existing command parser convention and decision validation failures return data error code 1。
- `quality evaluate` creates `quality.assessment.requested` with a project or requirement target and processes it synchronously；`quality process` only drains already-persisted pending events。

- [ ] **Step 1: Write failing CLI boundary tests**

  Add tests for all new commands, directory parsing, target/requirement parsing, reviewer/rationale requirements, unsupported decision values, no `--ai-approve`, no `--trusted` shortcut, validation diagnostics, evaluate → process output, and decide output showing resolved gate status.

- [ ] **Step 2: Run CLI tests to verify RED**

  Run: `pnpm exec vitest run tests/integration/cli-quality-engineering.test.ts tests/integration/cli.test.ts`

  Expected: FAIL because the parser/handlers do not know the `quality` command.

- [ ] **Step 3: Implement CLI parsing and command handlers**

  Instantiate the local runtime DB under the project runtime boundary, use the application Workflow/HumanDecision services, close the runtime store in a `finally` path, print machine-readable diagnostics through existing output helpers, and never write a decision without the explicit flags.

- [ ] **Step 4: Include v0.3 validation in existing validate/doctor flows**

  Existing `qaw validate` and `qaw doctor` must report v0.3 file diagnostics when the file exists, while a missing v0.3 file remains valid for v0.1/v0.2 projects.

- [ ] **Step 5: Run CLI tests to verify GREEN**

  Run: `pnpm exec vitest run tests/integration/cli-quality-engineering.test.ts tests/integration/cli.test.ts tests/integration/cli-evidence.test.ts`

  Expected: PASS with existing Evidence command compatibility intact.

- [ ] **Step 6: Commit Task 7**

  ```bash
  git add apps/cli/src/cli.ts apps/cli/src/main.ts apps/cli/package.json tests/integration/cli-quality-engineering.test.ts tests/integration/cli.test.ts
  git commit -m "feat: add v0.3 quality CLI commands"
  ```

### Task 8: Server API、Workbench UI 与双语 Golden Path

**Files:**
- Modify: `apps/server/src/server.ts`
- Modify: `apps/server/package.json`
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/components/WorkbenchPage.tsx`
- Modify: `apps/web/src/components/WorkbenchShell.tsx`
- Create: `apps/web/src/components/QualityEngineeringPanel.tsx`
- Modify: `apps/web/src/i18n.ts`
- Modify: `apps/web/src/styles.css`
- Test: `tests/integration/server.test.ts`
- Test: `tests/unit/web/quality-engineering-panel.test.tsx`
- Modify: `tests/e2e/golden-path.spec.ts`

**Interfaces:**
- Adds `GET /api/quality-engineering`, `POST /api/quality/evaluate`, `POST /api/quality/gates/:id/decision`, and `POST /api/quality/process`。
- Extends `ServerOptions` with injectable v0.3 Store/Runtime/Workflow/HumanDecision services while retaining default local construction。
- Adds `WorkbenchApi.getQualityEngineering`, `evaluateQuality`, `decideQualityGate`, and `processQualityEvents`。
- Adds a localized panel that renders Assessment, Gate outcome/status, reason codes, Evidence IDs and pending human decision form。

- [ ] **Step 1: Write failing API and UI tests**

  Add server tests for empty v0.3 state, evaluate target validation, process response, missing/invalid reviewer/rationale/decision, and successful decision. Add UI tests that render pending gate, show all four statuses, submit rationale, refresh after decision, and switch between `en` and `zh-CN` text.

- [ ] **Step 2: Run API/UI tests to verify RED**

  Run: `pnpm exec vitest run tests/integration/server.test.ts tests/unit/web/quality-engineering-panel.test.tsx`

  Expected: FAIL because the new routes, API methods and panel do not exist.

- [ ] **Step 3: Implement server routes and dependency wiring**

  Validate unknown request bodies at the HTTP boundary, use application services for all mutations, return current revisions and diagnostics, and keep the existing proposal map only as a proposal interaction cache—not as v0.3 Source of Truth.

- [ ] **Step 4: Implement the localized Workbench panel**

  Keep user-facing strings in i18n dictionaries, keep `uiLocale` separate from `outputLocale`, expose no auto-approve control, and preserve existing dashboard/pipeline/assistant views.

- [ ] **Step 5: Run API/UI tests to verify GREEN**

  Run: `pnpm exec vitest run tests/integration/server.test.ts tests/unit/web/quality-engineering-panel.test.tsx tests/unit/web/workbench-page.test.tsx tests/unit/web/proposal-review.test.tsx`

  Expected: PASS with existing proposal workflow still green.

- [ ] **Step 6: Extend Golden Path E2E**

  Add a deterministic path that loads the Workbench, evaluates a fixture with unverified Evidence, observes `warn`/pending Gate, submits reviewer+rationale, and observes resolved `approved`/`waived` status without any live model call.

- [ ] **Step 7: Run the E2E gate**

  Run: `pnpm test:e2e`

  Expected: PASS for the original proposal Golden Path and the new Quality Engineering path.

- [ ] **Step 8: Commit Task 8**

  ```bash
  git add apps/server/src/server.ts apps/server/package.json apps/web/src/api.ts apps/web/src/components/WorkbenchPage.tsx apps/web/src/components/WorkbenchShell.tsx apps/web/src/i18n.ts apps/web/src/styles.css tests/integration/server.test.ts tests/unit/web/quality-engineering-panel.test.tsx tests/e2e/golden-path.spec.ts
  git commit -m "feat: expose quality engineering decisions in the workbench"
  ```

### Task 9: English/Chinese Contracts、ADR、Roadmap 与 Release Documentation

**Files:**
- Create: `docs/en/contracts/DOMAIN_EVENT_CONTRACT.md`
- Create: `docs/zh-CN/contracts/DOMAIN_EVENT_CONTRACT.md`
- Create: `docs/en/contracts/QUALITY_ENGINEERING_CONTRACT.md`
- Create: `docs/zh-CN/contracts/QUALITY_ENGINEERING_CONTRACT.md`
- Create: `docs/adr/ADR-006-ai-assessment-vs-human-decision.md`
- Create: `docs/adr/ADR-016-event-driven-quality-engineering-loop.md`
- Create: `docs/superpowers/records/2026-09-27-v0-3-quality-engineering-loop-verification.md`
- Modify: `docs/en/contracts/CORE_CONTRACT_INDEX.md`
- Modify: `docs/zh-CN/contracts/CORE_CONTRACT_INDEX.md`
- Modify: `docs/en/ROADMAP.md`
- Modify: `docs/zh-CN/ROADMAP.md`
- Modify: `docs/development/RELEASE_PLAN.md`
- Modify: `docs/en/MVP.md`
- Modify: `docs/zh-CN/MVP.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `CHANGELOG.md`
- Modify: `scripts/check-docs.ts`

**Interfaces:**
- English contract docs are canonical and must match the implemented public names and file shapes。
- Chinese docs mirror the same scope, invariants, command/API names and evidence boundaries。
- ADR-006 records AI Assessment versus accountable HumanDecision；ADR-016 records local event-driven loops and SQLite runtime boundary。
- Verification record distinguishes local source/test/build, CI, release/tag, deployment and business acceptance。
- `scripts/check-docs.ts` must require the four v0.3 contract files, both ADRs, and the v0.3 verification record; it must not validate prose by brittle full-text snapshots。

- [ ] **Step 1: Extend the documentation gate with failing v0.3 path checks**

  Add exact required paths to `scripts/check-docs.ts` and run the existing gate before creating the files.

- [ ] **Step 2: Run docs checks to verify RED**

  Run: `pnpm check:docs`

  Expected: FAIL because the new required v0.3 documentation paths do not exist yet.

- [ ] **Step 3: Write canonical English docs and matching Chinese docs**

  Copy behavior and public names, not implementation-specific prose. Explicitly document missing-file compatibility, diagnostic boundaries, deterministic assessment rules, retry/idempotency, reviewer/rationale requirements, and non-claims.

- [ ] **Step 4: Write ADRs and update public/development docs**

  Mark v0.3 as locally implemented only after the code/tests are green; do not claim a GitHub Release or external acceptance. Keep README/MVP descriptions aligned with the real current scope.

- [ ] **Step 5: Create the verification record from actual command output**

  Record exact test counts/commands and any unavailable external gates as `NOT_RUN` or `BLOCKED`; never infer remote or business acceptance from local tests.

- [ ] **Step 6: Run documentation checks to verify GREEN**

  Run: `pnpm check:docs` and `git diff --check`

  Expected: PASS with EN/ZH consistency checks green.

- [ ] **Step 7: Commit Task 9**

  ```bash
  git add docs/en docs/zh-CN docs/adr docs/development/RELEASE_PLAN.md docs/superpowers/records/2026-09-27-v0-3-quality-engineering-loop-verification.md README.md README.zh-CN.md CHANGELOG.md scripts/check-docs.ts
  git commit -m "docs: document v0.3 quality engineering loop"
  ```

### Task 10: Full Regression、Architecture Review 与交付记录

**Files:**
- Modify: `docs/superpowers/records/2026-09-27-v0-3-quality-engineering-loop-verification.md`
- Create or modify only when a verification finding requires it; do not perform unrelated refactors.

**Interfaces:**
- Consumes every Task 1–9 public contract and test.
- Produces fresh evidence for the v0.3 Definition of Done and a clean/understood worktree.

- [ ] **Step 1: Run formatting, lint and typecheck**

  Run: `pnpm format:check`; `pnpm lint`; `pnpm typecheck`

  Expected: all commands exit 0; read full output and record counts/errors.

- [ ] **Step 2: Run build and complete unit/contract/integration suite**

  Run: `pnpm build`; `pnpm test`

  Expected: all workspace packages build and Vitest reports 0 failures.

- [ ] **Step 3: Run architecture and docs gates**

  Run: `pnpm check:architecture`; `pnpm check:docs`; `git diff --check`

  Expected: all exit 0; Domain, SQLite and i18n boundaries are explicitly covered.

- [ ] **Step 4: Run Golden Path E2E**

  Run: `pnpm test:e2e`

  Expected: original v0.1 flow and v0.3 evaluate → pending gate → human decision path pass without a live LLM.

- [ ] **Step 5: Perform the whole-branch review**

  Review `git diff $(git merge-base origin/main HEAD)..HEAD`, the Spec, this plan, all `Ruling:` entries and the Review Focus inputs. Re-grade findings by user-visible effect. Critical/Important findings require a new RED → GREEN test and one fix pass; Minor findings are recorded as deferred.

- [ ] **Step 6: Record final evidence and status**

  Update the verification record only with fresh command output. Run `git status --short --branch`, `git log --oneline --decorate -n 12`, and `git diff --stat origin/main...HEAD`; preserve unrelated user changes and do not push or release.

- [ ] **Step 7: Commit final verification record**

  ```bash
  git add docs/superpowers/records/2026-09-27-v0-3-quality-engineering-loop-verification.md
  git commit -m "docs: record v0.3 verification evidence"
  ```
