# Domain Event Contract

**状态：** 已接受，用于 v0.3 Quality Engineering Loop。

**Canonical 实现：** `packages/domain/src/domain-events.ts` 与
`packages/application/src/domain-event-publisher.ts`。

Domain Event 用于连接 Agent Execution Loop、QA Task Loop 和 Quality
Engineering Loop，同时保持模型循环不负责 QA 业务完成。事件是可持久化的
运行时观察与路由输入，不是项目质量 Source of Truth。

## Event Envelope

Domain package 导出以下 locale-neutral Contract：

```ts
export const DOMAIN_EVENT_SCHEMA_VERSION = "0.3" as const;

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

`id` 和 `aggregateId` 使用已有的小写 kebab-case ID 规则。`occurredAt` 必须是带
明确时区的 RFC 3339。`payload` 必须递归 JSON-safe：有限数字、字符串、布尔值、
null、数组和普通对象；函数、symbol、bigint、类实例、非有限数字和循环引用都被
拒绝。校验是纯 TypeScript，不访问 filesystem、SQLite、Provider 或 UI。

## 事件类型与 payload

| Event | Source | Aggregate | 必填 payload | Workflow 作用 |
| --- | --- | --- | --- | --- |
| `quality.assessment.requested` | `application` | `project` | `projectRoot`、`target`、`gateKind` | 启动显式的项目、Requirement 或 TestRun 评估。 |
| `quality.proposal.applied` | `application` | `quality` | `projectRoot`、`qualityRevision`、`requirementIds` | 重新评估受影响的质量目标。Application publisher 会为每个受影响的 Requirement 发布一个事件，因此该数组恰好包含一个 ID。 |
| `evidence.imported` | `application` | `evidence` | `projectRoot`、`evidenceRevision`、`testRunId`、`evidenceId` | 评估导入的 TestRun。 |
| `quality.assessment.created` | `workflow` | `assessment` | `projectRoot`、`assessmentId`、`target`、`verdict` | Assessment 成功持久化后的审计事件。 |
| `quality.gate.evaluated` | `workflow` | `gate` | `projectRoot`、`gateId`、`assessmentId`、`outcome` | Gate 成功持久化后的审计事件。 |
| `quality.human-decision.recorded` | `human` | `gate` | `projectRoot`、`gateId`、`decisionId`、`decision`、`reviewer` | 人类决策成功持久化后的审计事件。 |

事件 validator 只校验 Envelope 和 JSON-safe，不解释未知 payload 的业务含义；
触发事件的具体 payload 由 Quality Engineering Workflow boundary 校验。

## 路由与 Runtime 持久化

只有以下事件会启动 Quality Engineering Workflow：

- `quality.assessment.requested`
- `quality.proposal.applied`
- `evidence.imported`

Assessment、Gate 和 HumanDecision 事件只是审计/观察事件，不会递归启动同一个评估
Workflow。本地 Publisher 把事件写入 SQLite runtime log；Workflow 把
`QualityAssessment`、`QualityGate` 和 `HumanDecision` 写入项目文件。

Runtime Store 保存 Envelope JSON、项目根目录、状态、时间、失败信息、Workflow Run
metadata 和有序 Workflow Steps，不保存项目质量实体的第二份副本。重复 Event ID
具有幂等性；触发事件按 `(triggerEventId, workflowKind)` 唯一。`processPending` 可以
重放 pending 事件；失败事件保留诊断供修复后重试。这是本地可恢复处理，不是分布式
exactly-once 消息队列。

## 发布边界

Application service 在项目文件 atomic write 成功后发布事件：

1. 校验当前项目质量状态；
2. 执行 Domain Operation 并通过 Project Store atomic write；
3. 通过 Application Publisher 发布对应事件；
4. 由 Quality Engineering Workflow 写入 Runtime 状态和审计事件。

如果项目文件已经成功写入但事件发布失败，不回滚项目文件。结果会暴露失败，供
pending/retry 路径观察；既有项目质量数据不会被静默删除或回退。

## 兼容性

修改 schema version、事件类型、Envelope 字段、ID 规则或触发事件必填 payload，
都属于 Contract 变更，必须同步英文和中文文档、测试以及 migration/兼容性决策。
Domain Event 不改变 v0.1 `project.yaml`/`quality.yaml` schema，也不改变 v0.2
`evidence.yaml` schema。
