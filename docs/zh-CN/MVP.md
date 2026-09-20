# MVP --- v0.1

## 目标

证明 AI 可以参与真实 Quality Engineering Workflow，同时保证项目数据
Local-first、可追溯、可 Review、CI 可确定性执行，并保持 Human Control。

## Golden Path

1.  `qaw init` 初始化 `.ai-qa/`。
2.  创建或加载 Requirement。
3.  创建 Requirement Analysis QualityTask。
4.  Agent Execution Loop 获取项目上下文。
5.  AI 提议 Acceptance Criteria、Risk、Test Obligation、Test Case。
6.  生成 ChangeProposal。
7.  人工 Review 全部或部分变更。
8.  Approved Domain Operations 经过校验并 Atomic Write 到 `.ai-qa/`。
9.  重建 Traceability。
10. Completion Contract 判断 QA Task 是否真正完成。
11. `qaw validate` 通过。
12. `git diff .ai-qa/` 可以清楚看到质量变化。

## MVP 范围

Repository Foundation、Project File Contract、核心 Domain、CLI、Project
Store、Runtime SQLite、Tool
Runtime、MockProvider、OpenAICompatibleProvider、Agent Execution
Loop、QA Task Loop、ChangeProposal、Requirement
Analysis、Traceability、EN/zh-CN、Golden Path E2E。

## 不做

Evidence 执行适配、Quality Gate、完整 Quality Engineering Loop、Skill
Runtime、多原生
Provider、MCP/GitHub/Jira、PostgreSQL、多人协作/RBAC、Vector
DB、Kubernetes。

## MVP 完成标准

Golden Path 必须使用 MockProvider 在无网络 CI 中通过；相同
Domain/Application 代码还应验证 DeepSeek 和至少一个其他
OpenAI-compatible 模型。
