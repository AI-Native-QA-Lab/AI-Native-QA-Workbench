# ADR-006 — AI Assessment vs Human Decision

**Status:** Accepted

**Date:** 2026-09-27

## Context

The Workbench needs a quality conclusion that can be produced deterministically
from project data and execution Evidence, while keeping accountability for a
quality Gate with a human reviewer. Treating a model response, an automated
Workflow result, or a missing reviewer as an approval would make the evidence
boundary and the audit trail unreliable.

## Decision

1. `QualityAssessment` is an analysis artifact. It records the target, verdict,
   summary, reason codes, Evidence references, source, and the input revision.
2. The v0.3 default provider is `RuleBasedQualityAssessmentProvider`. It is
   deterministic, offline, and fail-closed for invalid, missing, incomplete, or
   unverified Evidence. A future AI provider may produce an Assessment draft
   through the same interface, but its output remains an Assessment.
3. `QualityGate` is derived from a validated Assessment. Every Gate has
   `requiredHumanDecision: true`; a Gate outcome cannot be rewritten by a model
   or by an Assessment provider.
4. `HumanDecision` is created only by `FileHumanDecisionService`. The service
   requires an existing Gate, the current quality-engineering file revision, a
   non-empty reviewer, and a non-empty rationale before an atomic Project Store
   write.
5. `approve`, `reject`, and `waive` are explicit human decisions. Approval
   accepts the current Gate result; it does not transform a warning or
   insufficient-evidence Assessment into a pass.
6. `.ai-qa/quality-engineering.yaml` is the Source of Truth for Assessment,
   Gate, and Decision records. SQLite stores only rebuildable event and
   Workflow runtime state.

## Consequences

Positive consequences:

- AI output can remain useful without impersonating an accountable reviewer.
- Missing or unverified Evidence is visible as a fail-closed Assessment rather
  than a false pass.
- The decision record is portable with the project and includes its rationale.
- CLI, HTTP, and UI share one application boundary and cannot bypass revision
  or Gate validation.

Costs and limits:

- Human review is required even when the deterministic Assessment is `pass`.
- The v0.3 provider does not calculate a numeric score or coverage percentage.
- A successful project-file write followed by an event-publication failure is
  observable but is not rolled back; runtime retry handles the event boundary.

## Rejected alternatives

### Automatic approval for a passing Assessment

Rejected because a passing execution observation is not the same as an
accountable release decision, and the same rule would make it easy to hide a
reviewer identity.

### AI-created HumanDecision

Rejected because model output is not a human identity, rationale, or approval
authority. AI may request or summarize a review, but it cannot create the
Decision record.

### SQLite as the quality decision source of truth

Rejected because project-quality decisions must remain portable, diffable, and
recoverable when rebuildable runtime data is deleted.
