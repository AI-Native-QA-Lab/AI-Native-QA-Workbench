# Quality Engineering Contract

**Status:** Accepted for v0.3 Quality Engineering Loop.

**Canonical implementation:** `packages/domain/src/quality-engineering-domain.ts`,
`packages/project-store/src/quality-engineering-file.ts`,
`packages/project-store/src/quality-engineering-store.ts`, and
`packages/application/src/quality-engineering-workflow.ts`.

This contract stores quality assessments, gates, and accountable human
decisions in the project directory while keeping runtime execution data
rebuildable. It adds no numeric Quality Score and does not turn AI output or
imported execution data into a human decision.

## Source of truth and file shape

`.ai-qa/quality-engineering.yaml` is the Source of Truth for the three v0.3
project-quality entity collections. A missing file is a valid empty snapshot;
an existing malformed or invalid file fails closed.

```yaml
schemaVersion: "0.3"
qualityEngineering:
  assessments: []
  gates: []
  humanDecisions: []
```

The top-level keys and nested keys are strict. Unknown keys, malformed YAML,
unsupported schema versions, wrong collection types, invalid values, and broken
cross-file references produce machine-readable diagnostics. Serialization keeps
the canonical field order, preserves collection order, and ends with one
newline. Store writes use a same-directory temporary file, revision checks, and
atomic rename.

Existing files remain compatible and unchanged:

```text
.ai-qa/project.yaml       schemaVersion: "0.1"
.ai-qa/quality.yaml       schemaVersion: "0.1"
.ai-qa/evidence.yaml      schemaVersion: "0.2"
```

## Domain types

The pure Domain package exports these locale-neutral values:

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

`QualityAssessment` contains an ID, target, verdict, summary, reason codes,
Evidence IDs, source, the quality-file revision it used, and `createdAt`.
`QualityGate` contains an ID, kind, matching target, Assessment reference,
derived outcome, `requiredHumanDecision: true`, and `evaluatedAt`.
`HumanDecision` contains an ID, Gate reference, decision type, non-empty
reviewer, non-empty rationale, and `decidedAt`.

## Invariants and cross-file validation

The pure Domain validator checks:

- all IDs use lower-case kebab-case and are unique within their collection;
- schema version is exactly `"0.3"`;
- targets have the correct shape and valid IDs;
- summaries, reviewers, and rationales are non-empty strings;
- reason-code and Evidence-ID arrays contain unique non-empty strings;
- timestamps are RFC 3339 with an explicit timezone;
- `basedOnRevision` is null or a lower-case 64-character SHA-256;
- each Gate references an Assessment with the same target;
- Gate outcome matches the Assessment verdict:
  `pass → pass`, `warn → warn`, `fail → block`, and
  `insufficient-evidence → insufficient-evidence`;
- every Gate requires a human decision;
- every HumanDecision references a current Gate;
- duplicate decisions at the same time and ID are rejected.

The Project Store adds cross-file checks: Assessment Evidence IDs must exist in
`evidence.yaml`, Requirement targets must exist in `quality.yaml`, and TestRun
targets must exist in `evidence.yaml`. Artifact byte integrity remains the
responsibility of the v0.2 Evidence verification service; Quality Engineering
validation does not silently repair artifacts.

Resolved status is derived by `resolveQualityGateStatus(gate, decisions)` and
is not stored as a second mutable field. With no decision the status is
`pending`. The latest decision by `decidedAt`, then by ID, determines
`approved`, `rejected`, or `waived`. Approving a warning or insufficient-evidence
Gate acknowledges the current Gate; it does not rewrite the Assessment verdict
or outcome into `pass`.

## Deterministic assessment policy

The default `RuleBasedQualityAssessmentProvider` is offline and does not call an
LLM. It applies this priority order:

1. Invalid quality/evidence data or failed artifact integrity produces
   `insufficient-evidence` with `QUALITY_DATA_INVALID` and/or
   `EVIDENCE_INTEGRITY_FAILED`.
2. No Evidence/TestRun produces `insufficient-evidence` with
   `EVIDENCE_MISSING`.
3. An error result produces `fail` with `TEST_RUN_ERROR`.
4. A failed result produces `fail` with `TEST_RUN_FAILED`.
5. Empty, unknown, incomplete, or skipped execution produces
   `insufficient-evidence` with `TEST_RUN_INCOMPLETE`.
6. All results passed but provenance is `unverified` produces `warn` with
   `EVIDENCE_UNVERIFIED`.
7. Passed results with trusted or human-recorded provenance produce `pass` with
   `EVIDENCE_VERIFIED`.

The provider returns an Assessment draft only. It never mutates Evidence trust,
creates a HumanDecision, or writes `.ai-qa/`.

## Workflow and human boundary

The Quality Engineering Workflow consumes `quality.assessment.requested`,
`quality.proposal.applied`, and `evidence.imported`. Its deterministic sequence
is:

```text
validate project/quality/evidence
  → verify evidence integrity
  → create QualityAssessment
  → atomically append Assessment and QualityGate
  → append audit events
  → mark the trigger event and Workflow Run complete
```

Runtime migration 2 stores Domain Events, Workflow Runs, and Workflow Steps in
SQLite. It does not store Assessment, Gate, or Decision as the project-quality
source of truth. A failed step leaves a failed/pending runtime record with
diagnostics and is retryable through `quality process`.

`FileHumanDecisionService` is the only Application boundary that appends a
HumanDecision. It revalidates project, quality, evidence, the current revision,
and Gate reference, then requires the caller to provide `reviewer` and
`rationale`. AI, Agent Tools, Model Providers, and automatic Workflow code
cannot approve, reject, or waive a Gate.

## CLI, HTTP, and UI boundaries

The CLI exposes:

```text
qaw quality validate [directory]
qaw quality evaluate [directory] [--requirement-id <id>]
qaw quality process [directory]
qaw quality decide <gate-id> --decision approve|reject|waive \
  --reviewer <id> --rationale <text> [directory]
```

The local HTTP API exposes `GET /api/quality-engineering`,
`POST /api/quality/evaluate`, `POST /api/quality/process`, and
`POST /api/quality/gates/:id/decision`. Boundary validation rejects malformed
targets, unknown decisions, missing reviewers, missing rationales, and stale
revisions.

The Workbench Quality Engineering panel shows Assessment evidence references,
Gate outcome, derived status, and a bilingual reviewer/rationale form. It can
submit an explicit HumanDecision but has no automatic approval control. UI
locale and AI output locale remain independent.

## Compatibility

The v0.3 file is additive and optional. No migration rewrites v0.1 or v0.2
files. Any change to the YAML shape, diagnostics, domain enums, revision
semantics, or decision boundary requires synchronized English/Chinese docs,
contract tests, and an explicit compatibility decision.
