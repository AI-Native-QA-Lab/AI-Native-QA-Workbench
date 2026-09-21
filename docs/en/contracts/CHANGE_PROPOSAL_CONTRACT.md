# Change Proposal Contract

**Status:** Implemented v0.1 MVP.

`ChangeProposal` is the only application boundary through which AI-generated
quality changes can reach `.ai-qa/`. Agents and providers produce operations;
they do not write project files directly.

`ProposalEntityType` covers `requirement`, `acceptanceCriterion`, `qualityRisk`,
`testObligation`, `testCase`, and `traceLink`. Every operation is validated
against the current snapshot before it can be applied.

```ts
type QualityOperation =
  | { kind: "create"; entityType: ProposalEntityType; entity: unknown }
  | { kind: "update"; entityType: ProposalEntityType; id: string; entity: unknown }
  | { kind: "delete"; entityType: ProposalEntityType; id: string };

interface ChangeProposal {
  id: string;
  baseRevision: string;
  operations: QualityOperation[];
  status: "proposed" | "approved" | "rejected" | "partially-approved" | "applied";
  review?: { reviewer: string; decision: "approve" | "reject" | "partial" };
}
```

## Apply sequence

1. Read the current quality YAML and compute its SHA-256 revision.
2. Reject a stale `baseRevision`.
3. Require an explicit non-empty human reviewer and approve/partial decision.
4. Apply operations to an in-memory snapshot and validate Domain relationships.
5. Serialize to a same-directory temporary file and atomically rename it.
6. Reload and re-evaluate the resulting snapshot.

Reject decisions never write. A failed validation never produces a partial file.
The proposal status and review decision must agree: `approved` requires
`approve`, `partially-approved` requires `partial` with at least one unique,
in-range operation index, and `rejected` requires `reject`.
The current implementation keeps proposal workflow state in application memory;
durable proposal history is a later runtime capability.

Validation also evaluates operations in order. If an earlier operation removes a later
operation's target, validation returns `PROPOSAL_TARGET_NOT_FOUND` and no file is written.
