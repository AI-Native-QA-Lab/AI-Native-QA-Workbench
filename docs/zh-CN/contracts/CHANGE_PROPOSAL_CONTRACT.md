# ChangeProposal Contract

**状态：** 已实现 v0.1 MVP。

`ChangeProposal` 是 AI 生成的质量变更进入 `.ai-qa/` 的唯一 application 边界。Agent
和 Provider 只生成 operation，不直接写项目文件。

`ProposalEntityType` 覆盖 `requirement`、`acceptanceCriterion`、`qualityRisk`、
`testObligation`、`testCase` 和 `traceLink`。每个 operation 在 apply 前都必须针对当前
snapshot 重新校验。

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

## Apply 顺序

1. 读取当前 quality YAML 并计算 SHA-256 revision。
2. `baseRevision` 过期时拒绝。
3. 要求非空 human reviewer 和显式 approve/partial decision。
4. 在内存 snapshot 上应用 operation 并校验 Domain 关系。
5. 写入同目录临时文件并原子 rename。
6. 重新加载并 re-evaluate 结果 snapshot。

Reject 不写文件；校验失败不会产生部分文件。Proposal status 必须和 review decision
一致：`approved` 必须对应 `approve`，`partially-approved` 必须对应 `partial`，并且至少
包含一个不重复且在范围内的 operation index；`rejected` 必须对应 `reject`。当前 Proposal
workflow state 保存在 application memory；持久化 Proposal 历史属于后续 runtime 能力。

校验还会按 operation 顺序评估。如果前一个 operation 删除了后续 operation 的 target，
校验会返回 `PROPOSAL_TARGET_NOT_FOUND`，并且不会写入文件。
