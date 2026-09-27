# ADR-016 — Event-Driven Quality Engineering Loop

**Status:** Accepted

**Date:** 2026-09-27

## Context

The v0.1/v0.2 Workbench has separate Agent Execution, QA Task, and Evidence
boundaries. v0.3 needs quality assessment to react to explicit quality changes
and imported execution Evidence without putting business-completion rules into
the model loop or introducing a remote message platform into the local-first
core.

## Decision

Use a local in-process dispatcher backed by a durable SQLite event log:

1. Application services publish a validated Domain Event after a successful
   project-quality atomic write.
2. `quality.assessment.requested`, `quality.proposal.applied`, and
   `evidence.imported` are the only trigger events for the Quality Engineering
   Workflow.
3. The Workflow validates project, quality, Evidence, and quality-engineering
   state; verifies Evidence integrity; creates an Assessment; derives and writes
   a Gate; appends audit events; and marks the trigger processed.
4. Runtime migration 2 stores Domain Events, Workflow Runs, Workflow Steps,
   processing status, failure details, and an idempotency constraint on
   `(triggerEventId, workflowKind)`.
5. `processPending()` replays pending events. Failed steps remain observable and
   retryable; a duplicate event does not create duplicate Assessment/Gate
   records.
6. `quality.assessment.created`, `quality.gate.evaluated`, and
   `quality.human-decision.recorded` are audit events and do not recursively
   trigger the same Workflow.

The project files remain the quality Source of Truth. SQLite is runtime state
only and may be deleted and rebuilt without deleting project-quality knowledge.

## Consequences

Positive consequences:

- Evidence import and reviewed quality changes can trigger the same deterministic
  Assessment/Gate path.
- Event status, Workflow steps, and failures are inspectable and recoverable.
- Core CI remains offline and does not require PostgreSQL, Redis, Kafka, a cloud
  queue, or a live LLM.
- Runtime idempotency prevents the common retry path from appending duplicate
  quality entities.

Costs and limits:

- The dispatcher is local and in-process; this is not distributed exactly-once
  processing.
- A project-file write and its runtime event append are separate observable
  operations. Publication failure is surfaced for retry rather than pretending
  the write did not happen.
- Cross-process coordination and shared Workbench deployment remain future
  decisions and require a new ADR.

## Rejected alternatives

### Put quality entities in SQLite

Rejected because it would split the portable project-quality Source of Truth and
make runtime database deletion destructive to Assessment, Gate, or Decision
history.

### Put the workflow inside the model loop

Rejected because model execution, QA task completion, and quality engineering
reaction have different invariants, retry semantics, and human boundaries.

### Introduce a remote queue in v0.3

Rejected because PostgreSQL, Redis, Kafka, Kubernetes, and remote workers are
outside the local-first v0.x core and would add an unaccepted deployment and
delivery dependency.
