# Domain Event Contract

**Status:** Accepted for v0.3 Quality Engineering Loop.

**Canonical implementation:** `packages/domain/src/domain-events.ts` and
`packages/application/src/domain-event-publisher.ts`.

Domain Events connect the Agent Execution Loop, QA Task Loop, and Quality
Engineering Loop without making the model loop responsible for QA business
completion. Events are durable runtime observations and routing inputs; they
are not project-quality source-of-truth records.

## Envelope

The Domain package exports the following locale-neutral contract:

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

`id` and `aggregateId` use the existing lower-case kebab-case identifier rule.
`occurredAt` is RFC 3339 with an explicit timezone. `payload` is recursively
JSON-safe: finite numbers, strings, booleans, null, arrays, and plain objects;
functions, symbols, bigint, class instances, non-finite numbers, and cycles are
rejected. Validation is pure TypeScript and performs no filesystem, SQLite,
provider, or UI access.

## Event types and payloads

| Event | Source | Aggregate | Required payload fields | Workflow role |
| --- | --- | --- | --- | --- |
| `quality.assessment.requested` | `application` | `project` | `projectRoot`, `target`, `gateKind` | Starts an explicit project, Requirement, or TestRun assessment. |
| `quality.proposal.applied` | `application` | `quality` | `projectRoot`, `qualityRevision`, `requirementIds` | Re-evaluates the affected quality target. |
| `evidence.imported` | `application` | `evidence` | `projectRoot`, `evidenceRevision`, `testRunId`, `evidenceId` | Evaluates the imported TestRun. |
| `quality.assessment.created` | `workflow` | `assessment` | `assessmentId`, `target`, `verdict` | Audit event emitted after an Assessment is persisted. |
| `quality.gate.evaluated` | `workflow` | `gate` | `gateId`, `assessmentId`, `outcome` | Audit event emitted after a Gate is persisted. |
| `quality.human-decision.recorded` | `human` | `gate` | `projectRoot`, `gateId`, `decisionId`, `decision`, `reviewer` | Audit event emitted after a human decision is persisted. |

The event validator checks the envelope and JSON safety, not the business
meaning of an unknown payload. Trigger-specific payload validation belongs to
the Quality Engineering Workflow boundary.

## Routing and runtime persistence

Only these events start the Quality Engineering Workflow:

- `quality.assessment.requested`
- `quality.proposal.applied`
- `evidence.imported`

Assessment, Gate, and HumanDecision events are audit/observation events and do
not recursively start the same assessment workflow. The local publisher writes
the event to the SQLite runtime log, while the workflow writes
`QualityAssessment`, `QualityGate`, and `HumanDecision` to project files.

The Runtime Store records the envelope JSON, project root, status, timestamps,
failure details, Workflow Run metadata, and ordered Workflow Steps. It does not
store a second copy of project-quality entities. A duplicate event ID is
idempotent, and a trigger event is unique per `(triggerEventId, workflowKind)`.
Pending events can be replayed with `processPending`; failed events retain their
diagnostics for retry. This is local durable processing, not a distributed
exactly-once message queue.

## Publication boundary

Application services publish after their project-file atomic write succeeds:

1. validate the current project-quality state;
2. perform the Domain operation and atomic Project Store write;
3. publish the corresponding event through the Application publisher;
4. let the Quality Engineering Workflow persist runtime status and audit events.

If event publication fails after a successful project-file write, the write is
not rolled back. The result exposes the failure so a pending/retry path can be
observed; existing project-quality data is never silently deleted or reverted.

## Compatibility

Changing the schema version, event type, envelope fields, identifier rule, or
payload required by a trigger is a contract change. It requires synchronized
English and Chinese documentation, tests, and a migration or compatibility
decision. Domain Events do not change the v0.1 `project.yaml` or `quality.yaml`
schema, or the v0.2 `evidence.yaml` schema.

