# Traceability Contract

**Status:** Implemented v0.1 MVP.

Traceability is stored in `.ai-qa/quality.yaml` as `QualitySnapshot` entities and
explicit `TraceLink` records. SQLite may store rebuildable runtime records, but it
does not own quality entities or trace links.

## Supported links

| From | Relation | To |
| --- | --- | --- |
| `requirement` | `satisfies` | `requirement` |
| `acceptance-criterion` | `satisfies` | `requirement` |
| `quality-risk` | `mitigates` | `requirement` |
| `test-obligation` | `verifies` | `quality-risk` |
| `test-case` | `verifies` | `test-obligation` |

The Domain validator rejects malformed endpoints, unsupported combinations,
self-links, duplicate edges, duplicate collection IDs, and broken direct
references. IDs are locale-neutral kebab-case values.

## Re-evaluation boundary

The v0.1 rebuild operation is deterministic: reload the YAML snapshot, validate
its collections and links, then derive counts for the QA Task completion result.
There is no separate graph database or remote index. Evidence coverage and graph
completeness remain later v0.2/v0.7 capabilities.
