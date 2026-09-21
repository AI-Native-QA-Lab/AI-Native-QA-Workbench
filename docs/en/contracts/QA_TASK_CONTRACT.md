# QA Task Contract

**Status:** Implemented v0.1 MVP slice.

`QualityTaskLoop` is separate from the Agent Execution Loop. Its required phase
order is:

`context → analyze → propose → validate → review → apply → re-evaluate → complete`

Proposal creation ends in `review`, never `complete`. Only an explicit human
approve or partial approval can enter apply. A rejection remains outside the
completion state.

`completionFor(snapshot, requirementId)` is deterministic. It requires a valid
snapshot and at least one AcceptanceCriterion, QualityRisk, TestObligation, and
TestCase for the requirement. Model text such as `done` is not completion evidence.

The v0.1 result is a local read model with collection counts. Execution Evidence,
QualityAssessment, QualityGate, and Domain Events are deferred to v0.2/v0.3.
