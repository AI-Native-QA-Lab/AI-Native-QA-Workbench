# v0.3 Quality Engineering Loop 设计

**状态：** Draft for review

**日期：** 2026-09-27

**目标版本：** v0.3 Quality Engineering Loop

## 1. 目标与交付边界

v0.1 已经提供 Local-first Quality Domain、Project Store、ChangeProposal、
Agent Execution Loop、QA Task Loop 和 deterministic Golden Path。v0.2 已经
提供 `TestRun`、`Evidence`、artifact integrity 和离线导入。

v0.3 补齐质量工程闭环：

```text
Domain Event → Workflow Runtime → QualityAssessment → QualityGate → HumanDecision
        ↑                                      ↓
  quality/evidence changes ← QA Task Loop ← Agent Execution Loop
```

本版本必须做到：

1. 质量事件可被记录、去重、恢复处理，并能触发确定性的本地 Workflow。
2. `QualityAssessment` 是可追溯的质量判断输入，不是 execution Evidence。
3. `QualityGate` 只能从已校验的 Assessment 产生，不能把缺失或损坏证据判为通过。
4. `HumanDecision` 必须有明确的非空 reviewer；AI、模型输出和 Workflow 不能冒充人类决策。
5. 现有 v0.1 `project.yaml`、v0.1 `quality.yaml` 和 v0.2 `evidence.yaml` 的 schema
   version 与字段形状保持兼容。
6. 三个 Loop 通过事件和 Workflow 连接，不把 QA 业务完成逻辑塞进模型循环。
7. Core CI 和 Golden Path 不依赖真实 LLM、远端 CI、PostgreSQL、Redis、Kafka 或网络服务。

本版本不包含：

- Quality score、coverage percentage、自动 TestCase 匹配或自动 TraceLink；
- 真实模型质量承诺、外部 CI/GitHub/Jira/MCP 连接；
- 多用户/RBAC、远程 Workflow worker、分布式 exactly-once 语义；
- SQLite 作为 `QualityAssessment`、`QualityGate` 或 `HumanDecision` 的 Source of Truth；
- 自动创建、批准或豁免 `HumanDecision`；
- 迁移或重写已有 v0.1/v0.2 Project File Contract。

## 2. 现有约束与选择

### 2.1 Source of Truth

新增项目质量文件 `.ai-qa/quality-engineering.yaml`，schema version 固定为
`"0.3"`。它保存 Assessment、Gate 和 HumanDecision 的完整元数据，是这三类
项目质量知识的唯一 Source of Truth。

现有文件保持不变：

```text
.ai-qa/project.yaml       schemaVersion: "0.1"
.ai-qa/quality.yaml       schemaVersion: "0.1"
.ai-qa/evidence.yaml      schemaVersion: "0.2"
```

`quality-engineering.yaml` 缺失时视为合法空快照，不要求 v0.1/v0.2 项目迁移。
文件存在但 YAML、key、schema 或 Domain 内容错误时必须 fail closed。写入使用
same-directory temporary file、revision 检查和 atomic rename；不能覆盖并发修改。

### 2.2 Runtime boundary

SQLite 仍是可删除、可重建的运行时存储。v0.3 在现有 Runtime Store migration 1
上增加 migration 2，保存：

- `domain_events`：已接收的事件、payload、处理状态和错误信息；
- `workflow_runs` 的 trigger event、唯一幂等 key 和完成状态；
- `workflow_steps`：每个 Workflow 的可重放步骤和结果。

Runtime Store 不复制完整的质量实体，也不承担 Assessment、Gate 或 Decision 的
唯一持久化。删除 SQLite 不得删除或改变 `.ai-qa/` 中的项目质量文件。

### 2.3 事件处理模型

v0.3 使用 local in-process dispatcher + SQLite durable event log：

1. application 在项目质量文件成功 atomic write 后追加 Domain Event；
2. dispatcher 根据事件类型创建唯一 Workflow Run；
3. Workflow 每个步骤写入 Runtime Store，成功后标记事件已处理；
4. 进程中断后，未完成事件仍可被 `processPending()` 重新处理；
5. `(triggerEventId, workflowKind)` 唯一约束保证重试不会重复写 Assessment/Gate。

这不是通用消息队列，也不声称跨进程 exactly-once；文件写入和 Runtime 记录的
边界必须通过可观察的失败状态表达。

## 3. v0.3 Domain Contract

### 3.1 公共常量与目标

`packages/domain` 新增 `quality-engineering-domain.ts` 和
`domain-events.ts`，保持纯 TypeScript，不依赖 Node、SQLite、Fastify、React、
Provider、MCP、文件系统或测试框架。

```ts
export const QUALITY_ENGINEERING_SCHEMA_VERSION = "0.3" as const;
export const DOMAIN_EVENT_SCHEMA_VERSION = "0.3" as const;

export type QualityTarget =
  | { type: "project" }
  | { type: "requirement"; id: string }
  | { type: "test-run"; id: string };

export type AssessmentVerdict =
  | "pass"
  | "warn"
  | "fail"
  | "insufficient-evidence";

export type AssessmentSource = "deterministic" | "ai";

export interface QualityAssessment {
  id: string;
  target: QualityTarget;
  verdict: AssessmentVerdict;
  summary: string;
  reasonCodes: string[];
  evidenceIds: string[];
  source: AssessmentSource;
  basedOnRevision: string | null;
  createdAt: string;
}

export type QualityGateKind = "requirement-readiness" | "release-readiness";
export type QualityGateOutcome =
  | "pass"
  | "warn"
  | "block"
  | "insufficient-evidence";

export interface QualityGate {
  id: string;
  kind: QualityGateKind;
  target: QualityTarget;
  assessmentId: string;
  outcome: QualityGateOutcome;
  requiredHumanDecision: true;
  evaluatedAt: string;
}

export type HumanDecisionType = "approve" | "reject" | "waive";

export interface HumanDecision {
  id: string;
  gateId: string;
  decision: HumanDecisionType;
  reviewer: string;
  rationale: string;
  decidedAt: string;
}

export interface QualityEngineeringSnapshot {
  schemaVersion: typeof QUALITY_ENGINEERING_SCHEMA_VERSION;
  assessments: QualityAssessment[];
  gates: QualityGate[];
  humanDecisions: HumanDecision[];
}
```

`QualityTarget` 是显式的 locale-neutral machine value。v0.3 首个完整路径支持
`requirement` 和 `project`；`test-run` 保留给 evidence 触发的细粒度 Workflow。

### 3.2 Domain invariants

纯 Domain validator 必须检查以下规则，并返回既有 `Diagnostic` 形状的机器可读
diagnostics：

- 所有持久化 ID 使用现有 lower-case kebab-case 规则，不能在校验时 slugify 或 trim；
- `schemaVersion` 必须严格等于 `"0.3"`；
- `summary`、`rationale`、`reviewer` 为非空字符串；
- `reasonCodes`、`evidenceIds` 为数组，内容非空字符串，且各自无重复；
- Assessment/Gate/Decision 的 ID 各自在快照内唯一；
- `createdAt`、`evaluatedAt`、`decidedAt` 使用带时区 RFC 3339；
- `basedOnRevision` 只能是 `null` 或小写 64 字符 SHA-256；
- requirement/test-run target 存在合法 ID，project target 不携带多余 ID；
- Gate 的 `assessmentId` 必须引用当前快照中的 Assessment；
- Gate 的 `target` 必须与所引用 Assessment 的 target 相同；
- Gate 的 `outcome` 必须由 Assessment verdict 映射得到：
  `pass → pass`、`warn → warn`、`fail → block`、
  `insufficient-evidence → insufficient-evidence`；
- Gate 必须要求人类决策；不能存在 `requiredHumanDecision: false`；
- HumanDecision 的 `gateId` 必须引用当前 Gate；
- 同一个 Gate 的当前决策按 `decidedAt`、再按 ID 稳定排序取最后一条；相同时间和 ID
  的重复决策必须诊断；
- `approve`、`reject`、`waive` 都必须有 reviewer 和 rationale；
- Domain 层只检查快照内引用，不访问 `quality.yaml`、`evidence.yaml` 或文件系统。

决策状态通过纯函数计算，不重复持久化一个可能漂移的 status 字段：

```ts
export type ResolvedGateStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "waived";

export function resolveQualityGateStatus(
  gate: QualityGate,
  decisions: readonly HumanDecision[],
): ResolvedGateStatus;
```

没有 HumanDecision 时永远是 `pending`。`approve` 只表示人类接受当前 Gate
结果，不把 `warn` 或 `insufficient-evidence` 改写成 `pass`；`waive` 只表示人类
明确承担对当前 Gate 结果的豁免责任。

### 3.3 Quality Engineering file contract

文件顶层和嵌套 key 必须严格限制为：

```yaml
schemaVersion: "0.3"
qualityEngineering:
  assessments: []
  gates: []
  humanDecisions: []
```

未知 key、错误 schema version、错误数组类型、坏的嵌套字段、重复引用和不支持的
枚举值必须返回 `QUALITY_ENGINEERING_*` diagnostics。序列化保持固定字段顺序、
数组顺序和结尾换行，不把 runtime event payload 混入此文件。

最小 Store boundary：

```ts
export interface QualityEngineeringStore {
  readQualityEngineering(rootDirectory: string): Promise<QualityEngineeringReadResult>;
  validateQualityEngineering(rootDirectory: string): Promise<QualityEngineeringValidationResult>;
  writeQualityEngineering(
    rootDirectory: string,
    snapshot: QualityEngineeringSnapshot,
    expectedRevision: string | null,
  ): Promise<QualityEngineeringWriteResult>;
}
```

`validateQualityEngineering` 还必须加载当前 `quality.yaml` 与 `evidence.yaml`，
确认 Assessment 引用的 Evidence 存在、Gate 引用的 Assessment 存在，并确认
target 的 Requirement/TestRun 存在；完整 artifact bytes integrity 仍由 v0.2
`verifyEvidence` 负责。

## 4. Domain Event Contract

### 4.1 Event envelope

```ts
export type DomainEventType =
  | "quality.assessment.requested"
  | "quality.proposal.applied"
  | "evidence.imported"
  | "quality.assessment.created"
  | "quality.gate.evaluated"
  | "quality.human-decision.recorded";

export type DomainEventSource = "application" | "workflow" | "human";
export type DomainAggregateType =
  | "project"
  | "quality"
  | "evidence"
  | "assessment"
  | "gate";

export interface DomainEvent<TPayload = unknown> {
  id: string;
  schemaVersion: typeof DOMAIN_EVENT_SCHEMA_VERSION;
  type: DomainEventType;
  aggregateType: DomainAggregateType;
  aggregateId: string;
  occurredAt: string;
  source: DomainEventSource;
  payload: TPayload;
}
```

Event ID、aggregate ID 和时间字段都必须校验。`payload` 必须是 JSON-safe value；
事件 validator 不访问文件系统，不推断未知 payload 的业务语义。

事件最小 payload：

```ts
type QualityAssessmentRequestedPayload = {
  projectRoot: string;
  target: QualityTarget;
  gateKind: QualityGateKind;
};

type QualityProposalAppliedPayload = {
  projectRoot: string;
  qualityRevision: string;
  requirementIds: string[];
};

type EvidenceImportedPayload = {
  projectRoot: string;
  evidenceRevision: string;
  testRunId: string;
  evidenceId: string;
};

type AssessmentCreatedPayload = {
  projectRoot: string;
  assessmentId: string;
  target: QualityTarget;
  verdict: AssessmentVerdict;
};

type GateEvaluatedPayload = {
  projectRoot: string;
  gateId: string;
  assessmentId: string;
  outcome: QualityGateOutcome;
};

type HumanDecisionRecordedPayload = {
  gateId: string;
  decisionId: string;
  decision: HumanDecisionType;
  reviewer: string;
};
```

### 4.2 Event routing

只有以下事件启动 Quality Engineering Workflow：

- `quality.assessment.requested`：为显式指定的 Requirement 或 Project 评估并创建 Gate；
- `quality.proposal.applied`：重新评估受影响 Requirement；
- `evidence.imported`：评估对应 TestRun，并更新对应 Requirement/Project gate。

`quality.assessment.created`、`quality.gate.evaluated` 和
`quality.human-decision.recorded` 只用于审计、UI 刷新和下游观察，不递归启动同一个
评估 Workflow。事件处理器必须按 `event.id + workflow.kind` 去重。

## 5. Workflow Runtime Contract

### 5.1 Application interfaces

`packages/application` 提供：

```ts
export interface QualityAssessmentProvider {
  assess(input: QualityAssessmentInput): Promise<QualityAssessmentDraft>;
}

export interface QualityAssessmentInput {
  target: QualityTarget;
  quality: QualitySnapshot;
  evidence: EvidenceSnapshot;
  evidenceDiagnostics: readonly StoreDiagnostic[];
  evidenceIntegrity: readonly EvidenceIntegrityDiagnostic[];
}

export interface QualityAssessmentDraft {
  verdict: AssessmentVerdict;
  summary: string;
  reasonCodes: string[];
  evidenceIds: string[];
  source: AssessmentSource;
}

export interface QualityEngineeringWorkflow {
  dispatch(event: DomainEvent): Promise<WorkflowDispatchResult>;
  processPending(input: { projectRoot: string }): Promise<readonly WorkflowDispatchResult[]>;
}
```

默认实现为 `RuleBasedQualityAssessmentProvider`，不调用 LLM。未来 AI provider
可以实现同一 boundary；其输出仍必须通过 Domain validator，并且不能写
HumanDecision。v0.3 不把真实 Provider 作为 Core CI 前置条件。

### 5.2 Deterministic assessment policy

默认规则按以下优先级计算，不产生数值 score：

1. Project/Quality/Evidence 校验失败，或 Evidence integrity 出现 missing、size
   mismatch、checksum mismatch：`insufficient-evidence`，reason 包含
   `QUALITY_DATA_INVALID` 或 `EVIDENCE_INTEGRITY_FAILED`；
2. 没有任何 Evidence/TestRun，或结果为空、unknown、incomplete、全部 skipped：
   `insufficient-evidence`，reason 为 `EVIDENCE_MISSING` 或 `TEST_RUN_INCOMPLETE`；
3. 任意 TestRun 为 `error` 或 `failed`：`fail`，reason 为
   `TEST_RUN_ERROR` 或 `TEST_RUN_FAILED`；
4. 所有结果 passed、integrity clean，但存在 `unverified` provenance：`warn`，reason
   为 `EVIDENCE_UNVERIFIED`；
5. 所有结果 passed、integrity clean 且 provenance 为 `trusted` 或 `human-recorded`：
   `pass`，reason 为 `EVIDENCE_VERIFIED`。

规则只描述当前 Evidence 观察，不把 `warn`、`fail` 或 `insufficient-evidence`
偷偷升级成质量批准。

### 5.3 Workflow steps

每次触发的 Workflow 按固定顺序执行：

```text
receive event
  → load and validate project/quality/evidence
  → verify referenced evidence integrity
  → create deterministic QualityAssessment
  → atomically append assessment
  → evaluate and atomically append QualityGate
  → append assessment/gate events
  → mark source event processed
```

任何文件写入失败时：

- 不写入部分快照；
- Workflow Run 进入 `failed`，保留错误和已完成 step；
- source event 保持 `pending` 或 `failed`，可以在修复后重试；
- 不自动删除或回滚用户已有 `.ai-qa/` 文件；
- `processPending()` 返回机器可读失败结果。

## 6. Human Decision Boundary

`recordHumanDecision()` 是唯一创建 `HumanDecision` 的 application boundary：

```ts
export interface HumanDecisionService {
  record(input: {
    rootDirectory: string;
    gateId: string;
    decision: HumanDecisionType;
    reviewer: string;
    rationale: string;
    expectedRevision: string | null;
  }): Promise<HumanDecisionResult>;
}
```

它必须：

1. 重新读取并校验当前 `quality-engineering.yaml`、QualitySnapshot 和 Evidence；
2. 验证 Gate 存在、revision 未过期、reviewer/rationale 非空；
3. 将 Decision 追加到 `.ai-qa/quality-engineering.yaml` 并 atomic write；
4. 写入来源为 `human` 的 `quality.human-decision.recorded` 事件；
5. 返回更新后的 resolved gate status。

AI、Agent Tool、ModelProvider、自动 Workflow 都不能绕过此服务创建 Decision。
CLI/API/UI 必须传递 reviewer 和 rationale，不能使用隐藏的默认身份。

## 7. 三个 Loop 的整合

### Agent Execution Loop

保持 `AgentRunner` 的状态、timeout、pause/resume、approval、maxSteps 和 provider
边界不变。它只产生 runtime execution records 和可选的观察事件，不判断 QA 业务完成，
不直接写 `.ai-qa/`。

### QA Task Loop

保留现有 `context → analyze → propose → validate → review → apply → re-evaluate →
complete` 阶段。Proposal apply 成功后发布 `quality.proposal.applied`，Completion
仍由确定性 validator 判断，不由 Agent 输出的 `done` 判断。

### Quality Engineering Loop

由 `evidence.imported`、`quality.proposal.applied` 等 Domain Event 触发 Workflow。
Workflow 创建并记录一个 runtime Quality Task，调用 QA Task/Application service，
最终产生 Assessment、Gate 和审计事件。它不是永久循环；每个事件有明确的 pending、
running、completed、failed 状态。

## 8. API、CLI 与 UI

### 8.1 CLI

新增命令：

```text
qaw quality validate [directory]
qaw quality evaluate [directory] [--requirement-id <id>]
qaw quality process [directory]
qaw quality decide <gate-id> --decision approve|reject|waive \
  --reviewer <id> --rationale <text> [directory]
```

- `quality validate` 检查 v0.3 file contract 和跨文件引用；
- `quality evaluate` 为指定目标发布/处理一次本地评估事件；
- `quality process` 处理 Runtime Store 中仍 pending 或 failed 的事件；
- `quality decide` 只能通过 HumanDecisionService 写入人类决策；
- CLI 永远不提供 `--ai-approve`、`--trusted` 或隐藏 reviewer 参数。

现有 `validate`、`doctor` 和 Evidence 命令保留兼容行为，并纳入 v0.3 文件校验。

### 8.2 HTTP API

新增：

```text
GET  /api/quality-engineering
POST /api/quality/evaluate
POST /api/quality/gates/:id/decision
POST /api/quality/process
```

HTTP boundary 必须验证 target、decision、reviewer、rationale、locale 和数组类型，
错误返回现有机器可读 HTTP error 形状；服务端不把 proposal map 或 HTTP session
当作质量 Source of Truth。

### 8.3 Workbench UI

Workbench 新增 Quality Engineering panel，展示：

- 最新 Assessment 的 verdict、summary、reason codes 和 Evidence refs；
- Gate outcome 和 resolved status；
- pending Gate 的 reviewer、rationale 和 approve/reject/waive 操作；
- Runtime Workflow 的 pending/running/completed/failed 状态。

所有新增用户文案同时提供 `en` 和 `zh-CN`，UI locale 与 AI output locale 继续独立。
UI 只能提交 HumanDecision 表单，不能模拟系统自动批准。

## 9. 验证与 Definition of Done

实现前必须按 TDD 完成以下 RED/GREEN 证据：

1. Domain Event、Assessment、Gate、HumanDecision 的纯 Domain contract tests；
2. v0.3 YAML parser/serializer、unknown key、revision conflict 和 cross-file reference tests；
3. Runtime migration 2、event deduplication、pending retry 和 workflow step tests；
4. RuleBasedAssessmentProvider 的每条优先级规则测试；
5. HumanDecision reviewer/rationale、gate reference、stale revision 和 AI boundary tests；
6. `quality.proposal.applied` 与 `evidence.imported` 的 event-to-workflow integration tests；
7. CLI/API boundary tests，确认没有隐藏 approval/trust 参数；
8. Architecture tests 确认 Domain 不依赖文件系统/SQLite/UI/Provider，SQLite 不成为质量 Source of Truth；
9. UI unit tests 和一次包含 evaluate → pending gate → human decision → resolved gate 的 Golden Path E2E；
10. `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test`、
    `pnpm check:architecture`、`pnpm check:docs` 和相关 `pnpm test:e2e` 均通过。

文档交付：

- `docs/en/contracts/DOMAIN_EVENT_CONTRACT.md` 与中文镜像；
- `docs/en/contracts/QUALITY_ENGINEERING_CONTRACT.md` 与中文镜像；
- ADR-006（AI Assessment 与 HumanDecision）和 ADR-016（Event-driven Quality Engineering Loop）；
- 更新 `CORE_CONTRACT_INDEX`、Roadmap、Release Plan、README/MVP、CHANGELOG；
- 新增 v0.3 verification record，明确 local/CI/release/production/business acceptance 的证据边界。

v0.3 的本地实现完成不等于创建 GitHub tag、Release、远端 Milestone、生产部署或业务验收；
这些动作必须另行授权并独立验证。
