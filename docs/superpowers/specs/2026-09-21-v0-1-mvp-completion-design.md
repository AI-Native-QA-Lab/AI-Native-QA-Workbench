# v0.1 MVP 剩余能力完成设计

**状态：** 已完成（2026-09-21）。本设计对应的 v0.1 MVP 剩余能力已在本地 `main` 工作区实现、验证并收口；`v0.1.0` Bootstrap tag 保持不变。

## 1. 目标

在已发布的 v0.1.0 Bootstrap 基线上，完成一个可离线运行、可人工 Review、可追溯、可通过浏览器验证的 Local-first MVP。最终 Golden Path 必须能够完成：

```text
init → load project quality → analyze requirement → propose quality changes
→ validate proposal → human approve/reject → atomic apply → rebuild traceability
→ validate → UI shows result
```

本次是一个完整的 v0.1 MVP 交付，不把剩余能力拆成多个对外版本。内部任务只用于 TDD、隔离边界和回归定位。

## 2. 当前基线与完成边界

当前已存在：

- `.ai-qa/project.yaml` Project File Contract；
- Project、Requirement、AcceptanceCriterion、QualityRisk、TestObligation、TestCase Domain 校验；
- `qaw init` 与 `qaw validate`；
- File Store 的 Project 文件读写、原子初始化和离线质量门禁；
- v0.1.0 GitHub Release、英文 canonical 文档和中文镜像。

本设计补齐：

- `.ai-qa/quality.yaml` 项目质量 Source of Truth；
- 完整 Domain 集合校验、TraceLink 和 ChangeProposal；
- Project Store 的质量数据扫描、解析、序列化、原子写入和关系检查；
- SQLite Runtime Store；
- Tool Contract、权限和审计；
- ModelProvider、MockProvider、OpenAI-compatible Provider；
- Agent Execution Loop、QA Task Loop 和确定性的 Completion Contract；
- Human Review 后的 ChangeProposal apply；
- Requirement Analysis；
- `qaw doctor`、`qaw open`、`qaw analyze`；
- Fastify 本地 API、React/Vite Workbench UI、EN/zh-CN；
- MockProvider 驱动的 Golden Path E2E 和 CI 门禁。

本次仍不实现：

- TestStrategy、TestRun、Evidence、QualityAssessment、QualityGate、Domain Event；这些保持后续 v0.2/v0.3 合同边界；
- MCP、GitHub、Jira、真实 CI 结果导入、远程运行；
- PostgreSQL、Redis、Kafka、云数据库、Vector DB、Kubernetes；
- 真实 LLM 作为核心 CI 依赖；
- 多用户、RBAC、Shared Workbench。

## 3. 不可破坏的架构规则

1. `.ai-qa/` 是 Requirement、Risk、TestObligation、TestCase、TraceLink 和 ChangeProposal apply 后数据的唯一 Source of Truth。
2. SQLite 只保存 session、run、step、tool run、workflow run、approval 和可重建索引；删除 SQLite 不得丢失项目质量数据。
3. AI 或 Tool 不得直接写 `.ai-qa/`；写入路径固定为 `AI → Domain Operation → ChangeProposal → Validation → Human Review → Apply → Atomic Write`。
4. `packages/domain` 只依赖纯 TypeScript；不得依赖文件系统、SQLite、Fastify、React、Provider SDK、MCP、GitHub/Jira 或测试框架。
5. AI 可以生成 `QualityAssessment` 或 Proposal，但本次 MVP 不落地 QualityAssessment；任何 approve/apply 必须接收显式人类 reviewer 和 decision。
6. Agent Loop、QA Task Loop、Quality Engineering Loop 分离；本次先实现前两个，Quality Engineering Loop 留在 v0.3。
7. UI 的 `uiLocale` 与 AI 请求的 `outputLocale` 独立；持久化 machine value 不随语言变化。
8. Core CI 使用 MockProvider 和本地 fixture，不需要 API Key、联网或真实模型。

## 4. v0.1 MVP Contract

### 4.1 QualitySnapshot

`packages/domain` 新增：

```ts
export const QUALITY_SCHEMA_VERSION = "0.1" as const;

export interface TraceLink {
  id: string;
  fromType:
    "requirement" | "acceptance-criterion" | "quality-risk" | "test-obligation" | "test-case";
  fromId: string;
  toType: "requirement" | "acceptance-criterion" | "quality-risk" | "test-obligation" | "test-case";
  toId: string;
  relation: "satisfies" | "mitigates" | "verifies";
}

export interface QualitySnapshot {
  schemaVersion: typeof QUALITY_SCHEMA_VERSION;
  requirements: Requirement[];
  acceptanceCriteria: AcceptanceCriterion[];
  qualityRisks: QualityRisk[];
  testObligations: TestObligation[];
  testCases: TestCase[];
  traceLinks: TraceLink[];
}

export function validateQualitySnapshot(snapshot: QualitySnapshot): ValidationResult;
```

集合校验必须检测：schema version、重复 ID、实体引用不存在、非法 TraceLink 类型组合、TraceLink 自引用和重复 TraceLink。单实体 validator 继续只检查本实体字段和直接 ID 语法。

### 4.2 Project Quality File

`.ai-qa/quality.yaml` 使用以下稳定外形：

```yaml
schemaVersion: "0.1"
quality:
  requirements: []
  acceptanceCriteria: []
  qualityRisks: []
  testObligations: []
  testCases: []
  traceLinks: []
```

Parser 必须拒绝未知顶层/`quality` key、错误 YAML、错误数组类型和违反 Domain Contract 的集合。Serializer 必须稳定字段顺序并以换行结尾。写入必须使用同目录临时文件加 rename，并在失败时清理临时文件。

### 4.3 ChangeProposal

```ts
export type QualityEntityType =
  | "requirement"
  | "acceptanceCriterion"
  | "qualityRisk"
  | "testObligation"
  | "testCase"
  | "traceLink";

export type QualityOperation =
  | { kind: "create"; entityType: QualityEntityType; entity: unknown }
  | { kind: "update"; entityType: QualityEntityType; id: string; entity: unknown }
  | { kind: "delete"; entityType: QualityEntityType; id: string };

export interface ChangeProposal {
  id: string;
  baseRevision: string;
  operations: QualityOperation[];
  status: "proposed" | "approved" | "rejected" | "partially-approved" | "applied";
}

export function validateChangeProposal(proposal: ChangeProposal): ValidationResult;
```

Proposal 校验必须拒绝空操作、非法实体类型、缺失 operation id、同一 Proposal 内重复 create、未知 update/delete 目标，以及将 `status` 伪造为已批准/已应用但没有 Human Review 的输入。Apply 时必须重新加载当前 snapshot、比对 `baseRevision`、逐项验证结果并原子写入。

### 4.4 Runtime Store

`packages/runtime-store` 提供：

```ts
export interface RuntimeStore {
  createSession(input: { projectRoot: string; uiLocale: ProjectLocale }): string;
  appendRun(input: { sessionId: string; kind: string }): string;
  appendStep(input: { runId: string; kind: string; status: string; payload: unknown }): string;
  appendToolRun(input: {
    runId: string;
    toolName: string;
    permission: string;
    status: string;
  }): string;
  appendApproval(input: {
    runId: string;
    action: string;
    status: "pending" | "approved" | "rejected";
  }): string;
  close(): void;
}
```

SQLite schema 只包含 runtime 表：`agent_sessions`、`agent_runs`、`agent_steps`、`tool_runs`、`approval_requests` 和 `workflow_runs`。数据库初始化使用显式 migration version；质量 YAML 不复制到 SQLite。

### 4.5 Provider、Tool 和 Agent

Provider：

```ts
export interface ModelProvider {
  generate(request: ModelRequest): Promise<ModelResponse>;
}

export class MockProvider implements ModelProvider {}
export class OpenAICompatibleProvider implements ModelProvider {}
```

Tool：

```ts
export type ToolPermission = "read" | "write" | "restricted";

export interface ToolDefinition<Input = unknown, Output = unknown> {
  name: string;
  permission: ToolPermission;
  execute(input: Input): Promise<Output>;
}

export interface ToolRegistry {
  register(tool: ToolDefinition): void;
  execute(name: string, input: unknown, context: ToolExecutionContext): Promise<unknown>;
}
```

`write` 和 `restricted` 工具必须通过 approval callback；不提供 `.ai-qa/` 原始写工具。每次执行写入 Runtime Store 审计。

Agent 状态必须覆盖 `idle`、`running`、`waiting_for_approval`、`paused`、`completed`、`failed`、`cancelled`，并支持 `maxSteps`、timeout、cancel、pause/resume 和 approval。

### 4.6 QA Task 和 Requirement Analysis

QA Task Loop 必须显式经过 `context → analyze → propose → validate → review → apply → re-evaluate → complete`。`complete` 只能由确定性 Completion Contract 返回，不能由模型文本中的 `done` 触发。

Requirement Analysis 在 MockProvider 下生成可验证的 ChangeProposal，默认只提议 AcceptanceCriterion、QualityRisk、TestObligation 和 TestCase；Proposal 未经显式 approve 不得写入 `.ai-qa/`。

## 5. Golden Path 验收

在临时项目目录执行：

1. `qaw init` 创建 `project.yaml` 和空 `quality.yaml`；
2. 通过本地 API 或应用服务加载 Requirement；
3. MockProvider 生成 Proposal；
4. UI 显示待 Review Proposal；
5. 人工点击 approve；
6. ChangeProposal 经过 base revision、Domain 和关系校验后原子写入 `quality.yaml`；
7. Traceability rebuild 成功；
8. `qaw validate`、`qaw doctor` 通过；
9. UI 显示 Requirement、Risk、TestObligation、TestCase 和关系计数；
10. Playwright 在无网络条件下通过。

## 6. 完成标准

- `pnpm check` 通过；
- Domain、Project Store、Runtime Store、Tool、Provider、Agent、QA Task、Server、UI 和 E2E 的受影响测试全部通过；
- architecture fitness test 验证 Domain 无基础设施依赖、SQLite 不承载质量 Source of Truth；
- 英文 canonical Contract 与中文镜像同步；
- `README`、MVP、Roadmap、Release Plan 和实施记录反映真实实现状态；
- 未把静态测试、MockProvider 或本地 E2E 描述成真实 LLM、生产部署或外部系统证据。

## 7. 实现收口记录

-   `cc4991b` 完成 v0.1 MVP 的应用、Runtime、Provider、Agent、API、UI、i18n、CI、Contract 和 Golden Path 交付。
-   最终验证记录见 [`../records/2026-09-21-v0-1-mvp-verification.md`](../records/2026-09-21-v0-1-mvp-verification.md)。
-   下一实施目标是 v0.2 Evidence Foundation；TestRun、Evidence、QualityAssessment、QualityGate、Domain Event、外部集成、Shared Workbench 和 PostgreSQL 不回写到本次 v0.1 范围。
