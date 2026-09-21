# Tool Contract

**状态：** 已实现 v0.1 MVP 子切片。

Tool 声明与语言无关的 `read`、`write` 或 `restricted` 权限。`ToolRegistry` 拒绝未知
Tool；`write` 和 `restricted` 必须先通过 approval callback。每次尝试都会产生
`completed`、`denied` 或 `failed` audit record。

Registry 不是原始文件 patch API。任何 Tool 都不得绕过 Domain 校验、ChangeProposal、
Human Review 或 Project Store 原子写入来修改 `.ai-qa/`。Runtime audit 存放在 SQLite。
