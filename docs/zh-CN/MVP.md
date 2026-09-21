# MVP --- v0.1

## 当前 Bootstrap 状态

当前 v0.1 先建立确定性的本地基础，不把完整 AI Workflow 提前宣称为已实现。

## 快速开始

```bash
pnpm install
pnpm qaw init ./example-project
pnpm qaw validate ./example-project
```

## 当前已实现

- `.ai-qa/project.yaml` Project File Contract
- Project Domain 校验和稳定的 Project ID 推导
- 支持原子初始化和防覆盖的本地 File Store
- `qaw init` 与 `qaw validate`
- 离线 unit、contract、integration、architecture 和 documentation
  quality gate

## 规划中的 Golden Path

1. `qaw init` 初始化项目。
2. 创建或加载 Requirement。
3. 创建 Requirement Analysis QualityTask。
4. Agent Execution Loop 获取项目上下文。
5. AI 提议 Acceptance Criteria、Risk、Test Obligation、Test Case。
6. 生成 ChangeProposal。
7. 人工 Review 全部或部分变更。
8. Approved Domain Operations 经过校验并 Atomic Write 到 `.ai-qa/`。
9. 重建 Traceability。
10. Completion Contract 判断 QA Task 是否真正完成。
11. `qaw validate` 通过。
12. `git diff .ai-qa/` 可以清楚看到质量变化。

以上 Golden Path 尚未由当前 Bootstrap 实现。

## 规划中的 MVP 范围

Agent Runtime、SQLite Runtime State、Tool Runtime、MockProvider、
OpenAICompatibleProvider、Agent Execution Loop、QA Task Loop、Completion
Contract、ChangeProposal 审批、Requirement Analysis、Traceability UI、
EN/zh-CN UI 和确定性的 Golden Path E2E 仍在规划中。

## Bootstrap 不包含

Evidence 执行适配、Quality Gate、完整 Quality Engineering Loop、Skill
Runtime、多原生 Provider、MCP/GitHub/Jira、PostgreSQL、多人协作/RBAC、
Vector DB 和 Kubernetes 不属于当前 Bootstrap。

## Bootstrap 完成标准

Project File Contract 和两个 CLI 命令在离线 quality gate 中通过。规划中的
Golden Path 另有完成标准，包括使用 MockProvider 在无网络 CI 中通过。
