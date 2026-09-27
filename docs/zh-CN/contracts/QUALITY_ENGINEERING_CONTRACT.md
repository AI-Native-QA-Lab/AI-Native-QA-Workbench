# Quality Engineering Contract

**状态：** 已接受，用于 v0.3 Quality Engineering Loop。

**Canonical 实现：** `packages/domain/src/quality-engineering-domain.ts`、
`packages/project-store/src/quality-engineering-file.ts`、
`packages/project-store/src/quality-engineering-store.ts` 和
`packages/application/src/quality-engineering-workflow.ts`。

本 Contract 把 Quality Assessment、Quality Gate 和有责任归属的人类决策保存在
项目目录，同时保持运行时执行数据可重建。v0.3 不增加数值 Quality Score，也不把
AI 输出或导入的执行数据变成人类决策。

## Source of Truth 与文件形状

`.ai-qa/quality-engineering.yaml` 是 v0.3 三类项目质量实体集合的 Source of
Truth。文件缺失表示合法的空快照；文件存在但 malformed 或无效时必须 fail closed。

```yaml
schemaVersion: "0.3"
qualityEngineering:
  assessments: []
  gates: []
  humanDecisions: []
```

顶层和嵌套 key 都是严格的。未知 key、坏 YAML、不支持的 schema、错误集合类型、
无效值和断裂的跨文件引用都返回机器可读诊断。序列化保持 canonical 字段顺序、
集合顺序并以一个换行结尾。Store 写入使用同目录临时文件、revision 检查和
atomic rename。

已有文件保持兼容且不被改写：

```text
.ai-qa/project.yaml       schemaVersion: "0.1"
.ai-qa/quality.yaml       schemaVersion: "0.1"
.ai-qa/evidence.yaml      schemaVersion: "0.2"
```

## Domain 类型

纯 Domain package 导出以下 locale-neutral value：

```ts
export type QualityTarget =
  | { type: "project" }
  | { type: "requirement"; id: string }
  | { type: "test-run"; id: string };

export type AssessmentVerdict = "pass" | "warn" | "fail" | "insufficient-evidence";
export type AssessmentSource = "deterministic" | "ai";
export type QualityGateKind = "requirement-readiness" | "release-readiness";
export type QualityGateOutcome = "pass" | "warn" | "block" | "insufficient-evidence";
export type HumanDecisionType = "approve" | "reject" | "waive";
export type ResolvedGateStatus = "pending" | "approved" | "rejected" | "waived";
```

`QualityAssessment` 包含 ID、target、verdict、summary、reason codes、Evidence
IDs、source、使用的 quality-file revision 和 `createdAt`。`QualityGate` 包含 ID、
kind、相同的 target、Assessment 引用、推导出的 outcome、
`requiredHumanDecision: true` 和 `evaluatedAt`。`HumanDecision` 包含 ID、Gate
引用、decision type、非空 reviewer、非空 rationale 和 `decidedAt`。

## Invariant 与跨文件校验

纯 Domain validator 校验：

- 所有 ID 使用小写 kebab-case，并在各自集合内唯一；
- schema version 必须严格等于 `"0.3"`；
- target 形状正确且 ID 合法；
- summary、reviewer 和 rationale 是非空字符串；
- reason-code 与 Evidence-ID 数组包含非空且不重复的字符串；
- 时间是带明确时区的 RFC 3339；
- `basedOnRevision` 只能是 null 或小写 64 位 SHA-256；
- 每个 Gate 引用一个 target 相同的 Assessment；
- Gate outcome 必须匹配 Assessment verdict：`pass → pass`、`warn → warn`、
  `fail → block`、`insufficient-evidence → insufficient-evidence`；
- 每个 Gate 都要求人类决策；
- 每个 HumanDecision 都引用当前 Gate；
- 相同时间和 ID 的重复决策被拒绝。

Project Store 增加跨文件校验：Assessment 的 Evidence IDs 必须存在于
`evidence.yaml`，Requirement target 必须存在于 `quality.yaml`，TestRun target
必须存在于 `evidence.yaml`。Artifact 字节完整性仍由 v0.2 Evidence verify service
负责；Quality Engineering 校验不会静默修复 artifact。

resolved status 由 `resolveQualityGateStatus(gate, decisions)` 推导，不再保存第二个
可能漂移的可变字段。没有决策时状态是 `pending`。按 `decidedAt`、再按 ID 取最新
决策，得到 `approved`、`rejected` 或 `waived`。批准 warn 或 insufficient-evidence
Gate 只表示人类接受当前 Gate，不会把 Assessment 或 outcome 改写成 `pass`。

## 确定性 Assessment policy

默认的 `RuleBasedQualityAssessmentProvider` 离线运行，不调用 LLM。它按以下优先级：

1. Quality/Evidence 无效或 artifact integrity 失败，得到 `insufficient-evidence`，
   reason 为 `QUALITY_DATA_INVALID` 和/或 `EVIDENCE_INTEGRITY_FAILED`；
2. 没有 Evidence/TestRun，得到 `insufficient-evidence`，reason 为
   `EVIDENCE_MISSING`；
3. 出现 error result，得到 `fail`，reason 为 `TEST_RUN_ERROR`；
4. 出现 failed result，得到 `fail`，reason 为 `TEST_RUN_FAILED`；
5. 空、unknown、incomplete 或 skipped execution，得到 `insufficient-evidence`，
   reason 为 `TEST_RUN_INCOMPLETE`；
6. 所有结果 passed 但 provenance 是 `unverified`，得到 `warn`，reason 为
   `EVIDENCE_UNVERIFIED`；
7. 结果通过且 provenance 是 trusted 或 human-recorded，得到 `pass`，reason 为
   `EVIDENCE_VERIFIED`。

Provider 只返回 Assessment draft，不改变 Evidence trust、不创建 HumanDecision、
也不写入 `.ai-qa/`。

## Workflow 与人类边界

Quality Engineering Workflow 消费 `quality.assessment.requested`、
`quality.proposal.applied` 和 `evidence.imported`。确定性顺序是：

```text
校验 project/quality/evidence
  → 校验 Evidence integrity
  → 创建 QualityAssessment
  → atomic append Assessment 与 QualityGate
  → 写入审计事件
  → 将 trigger event 与 Workflow Run 标记为完成
```

Runtime migration 2 把 Domain Event、Workflow Run 和 Workflow Step 保存在 SQLite，
不把 Assessment、Gate 或 Decision 作为项目质量 Source of Truth。步骤失败时保留
带诊断的 failed/pending runtime 记录，可通过 `quality process` 重试。

`FileHumanDecisionService` 是唯一能够追加 HumanDecision 的 Application boundary。
它重新校验 project、quality、evidence、当前 revision 和 Gate 引用，并要求调用方
提供 `reviewer` 与 `rationale`。AI、Agent Tool、Model Provider 和自动 Workflow
都不能批准、拒绝或豁免 Gate。

## CLI、HTTP 与 UI 边界

CLI 提供：

```text
qaw quality validate [directory]
qaw quality evaluate [directory] [--requirement-id <id>]
qaw quality process [directory]
qaw quality decide <gate-id> --decision approve|reject|waive \
  --reviewer <id> --rationale <text> [directory]
```

本地 HTTP API 提供 `GET /api/quality-engineering`、
`POST /api/quality/evaluate`、`POST /api/quality/process` 和
`POST /api/quality/gates/:id/decision`。Boundary 校验会拒绝 malformed target、
未知 decision、缺少 reviewer、缺少 rationale 和过期 revision。

Workbench 的 Quality Engineering panel 展示 Assessment 的 Evidence 引用、Gate
outcome、推导状态和双语 reviewer/rationale 表单。它可以提交显式 HumanDecision，
但没有自动批准控件。UI locale 与 AI output locale 保持独立。

## 兼容性

v0.3 文件是新增且可选的，不迁移或重写 v0.1/v0.2 文件。修改 YAML 形状、诊断、
Domain enum、revision 语义或决策边界时，必须同步英文/中文文档、Contract tests
和明确的兼容性决策。
