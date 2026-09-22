# ADR-005 — Evidence as a First-Class Entity

**Status:** Accepted

**Date:** 2026-09-22

## Context

The v0.1 Workbench stores project quality knowledge in .ai-qa/quality.yaml and
operational state in SQLite. It does not yet have a durable contract for test
execution observations. A v0.2 Evidence Foundation needs to preserve original
report bytes, make metadata portable, and distinguish checksum integrity from a
source trust declaration.

The design must remain local-first and offline. It must not turn an imported test
report into a QualityAssessment, QualityGate, HumanDecision, coverage conclusion,
or business acceptance decision.

## Decision

Evidence is a first-class project-quality entity with these boundaries:

1. TestRun, nested TestResult, Evidence, ArtifactReference, and
   EvidenceProvenance are pure Domain types.
2. .ai-qa/evidence.yaml with schemaVersion "0.2" is the metadata Source of Truth.
   .ai-qa/evidence/ stores the original artifact bytes.
3. Existing project and quality files remain at schemaVersion "0.1". Missing
   evidence.yaml is a valid empty snapshot.
4. Adapters parse in-memory JUnit XML, Playwright JSON Reporter, and Pytest JSON
   Report input. They do not read files or write the Project Store.
5. The Project Store owns strict YAML parsing, cross-file TestCase references,
   safe artifact paths, atomic writes, manifest revisions, checksum verification,
   and orphan reporting.
6. Imported Evidence defaults to unverified. Trust does not change when checksum
   verification succeeds or fails.
7. The v0.2 mutation is the user-invoked qaw evidence import command, not an
   Agent Tool. Any future Agent/Tool path must add ChangeProposal, Validation,
   Human Review, and Apply.

## Consequences

Positive consequences:

- Evidence remains portable with a project directory.
- Existing v0.1 projects continue to validate without migration.
- Corrupted or missing artifacts are observable without silently repairing user
  files.
- Local CI can test the complete path without a live LLM or remote service.
- Machine-readable diagnostics make malformed input and concurrency conflicts
  actionable.

Costs and limits:

- The first implementation supports only three report formats and a 16 MiB limit.
- Orphan artifacts require explicit verification and are not automatically
  garbage-collected.
- Provenance is a declaration, not cryptographic proof of origin.
- No Evidence UI, remote integration, artifact deduplication, signing, or quality
  scoring is introduced in v0.2.

## Rejected Alternatives

### SQLite as Evidence Source of Truth

Rejected because Evidence is project-quality knowledge that must remain portable
and recoverable with the project directory. SQLite remains rebuildable runtime
state only.

### Automatic TestCase Matching

Rejected because name similarity cannot establish traceability. v0.2 accepts an
explicit testCaseId and validates its existence without guessing a mapping.

### Automatic Trust or QualityGate Creation

Rejected because checksum integrity does not prove provenance, and an imported
execution result is not an accountable human quality decision.

### Agent Tool Import

Rejected for v0.2 because it would create an AI mutation path around the existing
ChangeProposal and Human Review boundary.
