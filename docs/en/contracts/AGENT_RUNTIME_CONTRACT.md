# Agent Runtime Contract

**Status:** Implemented v0.1 MVP execution slice.

`AgentRunner` owns model execution state. It does not decide QA Task completion and
does not write `.ai-qa/` directly.

## States

`idle`, `running`, `waiting_for_approval`, `paused`, `completed`, `failed`, and
`cancelled` are machine values and must not be translated in persistence.

The runner supports `maxSteps`, timeout, cancellation, pause/resume, and approval
resume. `AgentEvent` reports state, step, and approval transitions. A provider is
injected through the `ModelProvider` contract; CI uses `MockProvider`.

The v0.1 runner is bounded request/response execution. It does not provide token
streaming or provider-owned tool orchestration; those are later runtime capabilities.

Runtime audit belongs in the SQLite runtime store. QA business completion belongs
to `QualityTaskLoop` and its deterministic Completion Contract.
