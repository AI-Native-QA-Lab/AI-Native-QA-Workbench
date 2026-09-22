# Evidence Contract

**Status:** Accepted for v0.2 Evidence Foundation.

**Canonical implementation:** packages/domain/src/evidence-domain.ts,
packages/project-store/src/evidence-file.ts, and packages/evidence/src/index.ts.

This contract defines imported local test-result evidence. It does not define a
quality score, a QualityAssessment, a QualityGate, a HumanDecision, coverage,
or a production acceptance decision.

## Source of Truth and File Layout

Evidence metadata is project-quality data and is stored in .ai-qa/evidence.yaml.
The original report bytes are stored below .ai-qa/evidence/. SQLite runtime
tables must not become the source of truth for Evidence, TestRun, or TestResult.

Existing v0.1 files keep their schema versions:

```text
.ai-qa/project.yaml       schemaVersion: "0.1"
.ai-qa/quality.yaml       schemaVersion: "0.1"
```

v0.2 adds:

```text
.ai-qa/evidence.yaml      schemaVersion: "0.2"
.ai-qa/evidence/          imported artifact root
```

evidence.yaml is optional. A missing file is a valid empty snapshot, so a v0.1
project does not need a migration. An existing malformed file fails closed.

## Stable YAML Shape

The top-level keys are exactly schemaVersion and evidence. The evidence keys are
exactly testRuns and evidenceRecords.

```yaml
schemaVersion: "0.2"
evidence:
  testRuns: []
  evidenceRecords: []
```

Unknown keys, malformed YAML, unsupported schema versions, non-array collections,
wrong field types, duplicate identifiers, and broken local references produce
stable machine-readable diagnostics. Serialization uses the field order above,
preserves collection order, and ends with one newline.

## Domain Types

The Domain package exports:

```ts
export const EVIDENCE_SCHEMA_VERSION = "0.2" as const;

export type TestRunStatus = "passed" | "failed" | "skipped" | "error" | "incomplete";
export type TestResultStatus = "passed" | "failed" | "skipped" | "error" | "unknown";
export type EvidenceFormat = "junit" | "playwright-json" | "pytest-json";
export type EvidenceKind = "test-result";
export type EvidenceTrust = "unverified" | "trusted" | "human-recorded";
```

TestRun contains an ID, canonical source format, derived status, optional
timezone-bearing RFC 3339 start/completion timestamps, and nested TestResult
values. Result names preserve Unicode text. durationMs is a non-negative
integer. An optional testCaseId is a syntactic ID in Domain and is resolved
against quality.yaml by Project Store validation.

Evidence contains a unique ID, a TestRun reference, kind test-result, an
ArtifactReference, and EvidenceProvenance. An artifact reference contains a
portable relative path, media type, byte size, and lower-case 64-character
SHA-256 value.

All TestRun IDs, Evidence IDs, and artifact IDs use lower-case kebab-case. The
Domain validator does not slugify, trim, or rewrite values.

## Status Derivation

TestRun.status must equal deriveTestRunStatus(results). The fixed precedence is:

1. Any error result produces error.
2. Otherwise, any failed result produces failed.
3. Otherwise, an empty result set or any unknown result produces incomplete.
4. Otherwise, all results being skipped produces skipped.
5. All remaining results produce passed.

An empty report is therefore incomplete, never passed. This status describes the
imported execution observation; it is not a QualityGate result.

## Time, Provenance, and Trust

When present, startedAt, completedAt, and importedAt are RFC 3339 timestamps
with an explicit timezone. The application persists them in UTC. A completion
time cannot precede a start time. Missing report timestamps remain missing; the
application must not invent execution times from import time.

EvidenceProvenance.sourceFormat must equal the referenced TestRun format.
sourceFileName is a non-empty basename with no slash, backslash, NUL, or
absolute-path form. v0.2 adapters set trust to unverified. Trust is a source
declaration and is independent of checksum verification. qaw evidence verify
never changes trust. AI reasoning, model output, analysis text, and ChangeProposal
records are not execution Evidence.

## Artifact Safety and Integrity

ArtifactReference.relativePath is relative to .ai-qa/evidence/. Absolute paths,
empty paths, dot and dotdot segments, traversal, NUL bytes, and symlink escapes
are invalid. The file store rejects manifest symlinks and does not follow
symlinks during orphan scanning.

The store computes sizeBytes and sha256 from the bytes it writes. Manifest values
are not trusted as proof of integrity. validateEvidence checks metadata,
references, path safety, and artifact existence without hashing every byte.
verifyEvidence recomputes size and SHA-256 for every referenced artifact and
reports EVIDENCE_ARTIFACT_MISSING, EVIDENCE_ARTIFACT_SIZE_MISMATCH,
EVIDENCE_ARTIFACT_CHECKSUM_MISMATCH, EVIDENCE_ARTIFACT_PATH_UNSAFE, and
EVIDENCE_ARTIFACT_ORPHAN. Orphan artifacts are reported and never deleted
automatically.

## Validation Layers

The pure Domain validator checks only snapshot-internal structure, types, IDs,
timestamps, status derivation, duplicate IDs, TestRun references, and artifact
metadata shape. It performs no filesystem, YAML, checksum, or quality.yaml I/O.

The Project Store parses and serializes the strict YAML envelope. Its
validateEvidence(rootDirectory) additionally loads the quality snapshot,
resolves optional testCaseId references, checks artifact paths, and checks that
referenced artifacts exist. Its readEvidence and validateEvidence methods return
a raw UTF-8 SHA-256 manifest revision, or null for a missing manifest.

Manifest writes require an expected revision. A missing-file creation requires
expectedRevision === null; an existing-file update requires the current revision.
The store rechecks the revision immediately before an atomic same-directory
rename and returns EVIDENCE_REVISION_CONFLICT instead of overwriting a
concurrent change.

## Adapter and Import Boundaries

packages/evidence accepts in-memory UTF-8 bytes and an explicit format. It
returns a normalized TestRun plus the original artifact bytes. It does not read
files, execute commands, access the network, call a model provider, or write
the Project Store.

Supported formats:

| Format          | Core fields                                             |
| --------------- | ------------------------------------------------------- |
| junit           | XML suites/cases, failure, error, skipped, and duration |
| playwright-json | suite/spec/test/result names, statuses, and duration    |
| pytest-json     | tests[].nodeid, outcome, and duration                   |

The parser input limit is 16 MiB and is checked before parsing. Format selection
is explicit. CLI aliases playwright and pytest normalize to canonical Domain
values; the parser never guesses from a filename. JUnit external entities and
DOCTYPE declarations are rejected. Malformed core fields fail closed and must
not be converted to passed.

The application owns the import sequence: validate the project and current
metadata, parse the report, stage bytes under .tmp, recompute artifact metadata,
atomically move the artifact, append validated metadata, atomically replace the
manifest, and reload it for validation. A failed metadata commit keeps the old
manifest valid; a crash after artifact movement can leave an unreferenced
artifact, which verify reports as an orphan.

When no run ID is supplied, the application derives
run-<format>-<rawArtifactSha256>. Evidence IDs use
evidence-<runId>-<sha256-prefix>, and artifact IDs use the full checksum. Equal
run ID, checksum, and normalized content are idempotent. Equal run ID with a
different checksum or normalized TestRun returns EVIDENCE_IMPORT_CONFLICT.

## CLI Boundary

```text
qaw evidence import <report-file> --format junit|playwright|pytest [--run-id <id>] [directory]
qaw evidence verify [directory]
```

qaw validate checks project, quality, and Evidence metadata. qaw evidence verify
and qaw doctor validate those metadata files before recomputing artifact
integrity and reporting orphans. None of these commands prints a Quality Score
or creates a QualityAssessment, QualityGate, or HumanDecision.

Evidence command exit codes are:

| Code | Meaning                                                     |
| ---- | ----------------------------------------------------------- |
| 0    | Successful import, idempotent import, or clean verification |
| 1    | Project/data/integrity/concurrency failure                  |
| 2    | Evidence command syntax or unsupported format               |

Existing v0.1 command exit codes remain unchanged.

## Compatibility and Human Boundary

Evidence import is a user-invoked CLI action in v0.2, not an Agent Tool. If a
future Agent or Tool invokes it, the operation must add ChangeProposal,
Validation, Human Review, and Apply boundaries. No AI output can impersonate a
human decision or become deterministic execution evidence.
