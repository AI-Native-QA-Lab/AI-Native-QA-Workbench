# Agent Runtime Contract

**状态：** 已实现 v0.1 MVP Execution 子切片。

`AgentRunner` 负责模型执行状态，不负责 QA Task completion，也不得直接写 `.ai-qa/`。

## 状态

`idle`、`running`、`waiting_for_approval`、`paused`、`completed`、`failed`、`cancelled`
是机器值，持久化时不得随语言翻译。

Runner 支持 `maxSteps`、timeout、cancel、pause/resume 和 approval resume。
`AgentEvent` 报告 state、step 和 approval transition。Provider 通过 `ModelProvider`
注入；CI 使用 `MockProvider`。

Runtime audit 由 SQLite Runtime Store 负责。QA business completion 由
`QualityTaskLoop` 和确定性的 Completion Contract 负责。
