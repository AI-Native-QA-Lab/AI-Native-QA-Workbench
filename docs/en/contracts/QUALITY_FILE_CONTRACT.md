# Quality File Contract

**Status:** Implemented v0.1 MVP.

**Canonical implementation:** `packages/project-store/src/quality-file.ts`

This contract defines the project-quality file at `.ai-qa/quality.yaml`. It is
the file-backed source of truth for the quality collections. Runtime operational
state must not be copied into this file.

## Stable Shape

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

The top-level keys are exactly `schemaVersion` and `quality`. The `quality` keys
are exactly the six collections shown above. Unknown keys are rejected.

## Parser

`parseQualityFile(contents)` parses YAML, rejects malformed YAML and non-mapping
documents, validates the strict key shape, then delegates collection validation to
`validateQualitySnapshot` in the pure Domain package.

The result is:

```ts
{ valid: true, projectQuality: QualitySnapshot, diagnostics: [] }
```

or a `valid: false` result with machine-readable `code`, `path`, `message`, and
`severity: "error"` diagnostics. Collection diagnostics are rooted at
`quality.*`; YAML syntax failures use `.ai-qa/quality.yaml` as their path.

## Serializer

`serializeQualitySnapshot(snapshot)` validates the snapshot before serialization,
writes fields in the canonical order, and always returns a trailing newline. It
does not add runtime state or rewrite entity values. Invalid snapshots throw rather
than producing a file that cannot pass the parser.

File writes are owned by the Project Store. Store implementations must write a
same-directory temporary file and rename it atomically, cleaning up the temporary
file if the write fails.

Project initialization must refuse to overwrite an existing project or quality file.
If paired initialization fails after creating the project file, the new project file
must be removed so initialization does not leave a partial pair.

## Compatibility

Changes to key names, collection order, diagnostic codes, diagnostic paths, or
schema version require a contract review, compatibility tests, and synchronized
English and Chinese documentation.
