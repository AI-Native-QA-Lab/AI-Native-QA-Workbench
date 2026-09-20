# AI Native QA Workbench

> 一个 AI 原生、Local-first 的 Quality Engineering
> Workbench，将需求、风险、测试、执行和证据连接成可追溯的质量判断。

**[English](README.md) \| 简体中文**

## 核心链路

`Requirement → Acceptance Criteria → Quality Risk → Test Obligation → Test → Execution → Evidence → Quality Assessment → Quality Gate → Human Decision`

AI 参与质量工程全过程，但重要结论需要 Evidence 与 Traceability
支撑，有责任归属的质量决策由人类控制。

## MVP

MVP 只验证一条真正的产品闭环：

`Requirement → AI Analysis → AC/Risk/Obligation/Test Proposal → Human Review → .ai-qa → Traceability → Validation`

该流程必须使用 `MockProvider` 在 CI 中确定性运行，不依赖真实 LLM。

## Local-first

-   `.ai-qa/`：项目质量数据 Source of Truth
-   SQLite：本地 Agent/Workflow Runtime State
-   Filesystem：大型 Evidence Artifact
-   PostgreSQL：后续 Shared Workbench 可选能力，不是 v0.x 依赖

完整方案见 [GitHub 项目完整方案](docs/zh-CN/PROJECT_BLUEPRINT.md)。
