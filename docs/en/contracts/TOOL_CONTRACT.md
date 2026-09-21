# Tool Contract

**Status:** Implemented v0.1 MVP slice.

Tools declare one of three locale-neutral permissions: `read`, `write`, or
`restricted`. `ToolRegistry` rejects unknown tools. `write` and `restricted`
tools require an approval callback before execution. Every attempt emits an audit
record with `completed`, `denied`, or `failed` status.

The registry is not a raw filesystem patch API. No tool may bypass Domain
validation, ChangeProposal, Human Review, or atomic Project Store writes to mutate
`.ai-qa/`. Runtime audit records belong in SQLite.
