# QA Task Contract

**状态：** 已实现 v0.1 MVP 子切片。

`QualityTaskLoop` 与 Agent Execution Loop 分离，必须按以下顺序工作：

`context → analyze → propose → validate → review → apply → re-evaluate → complete`

生成 Proposal 只能停在 `review`，不能直接 `complete`。只有显式 human approve 或
partial approve 才能进入 apply；reject 始终不能进入 completion state。

`completionFor(snapshot, requirementId)` 是确定性的：snapshot 合法，并且该需求至少
有一个 AcceptanceCriterion、QualityRisk、TestObligation 和 TestCase，才算完成。模型
文本中的 `done` 不是 completion evidence。

v0.1 结果是本地 read model 和集合计数。Execution Evidence、QualityAssessment、
QualityGate 与 Domain Event 延后到 v0.2/v0.3。
