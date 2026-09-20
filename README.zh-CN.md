# AI Native QA Workbench

> 一个 AI 原生、Local-first 的 Quality Engineering
> Workbench，将需求、风险、测试、执行和证据连接成可追溯的质量判断。

**[English](README.md) \| 简体中文**

## 核心链路

`Requirement → Acceptance Criteria → Quality Risk → Test Obligation → Test → Execution → Evidence → Quality Assessment → Quality Gate → Human Decision`

AI 参与质量工程全过程，但重要结论需要 Evidence 与 Traceability
支撑，有责任归属的质量决策由人类控制。

## 快速开始

当前启动切片只负责创建并校验本地项目契约：

```bash
pnpm install
pnpm qaw init ./example-project
pnpm qaw validate ./example-project
```

当前版本还没有声称实现 `doctor`、`open` 或 AI 分析流程；这些能力仍在
Roadmap 中。

## 当前 Bootstrap 范围

当前 v0.1 Bootstrap 已实现：

- `.ai-qa/project.yaml` Project File Contract
- 确定性的 Domain 校验和本地文件存储
- `qaw init` 与 `qaw validate`
- 离线 unit、contract、integration、architecture 和 documentation
  quality gate

Agent Runtime、SQLite Runtime State、UI、Provider、Evidence 以及包含 AI
分析的 Golden Path 仍在规划中，当前版本没有这些可用命令。

## Local-first

- `.ai-qa/`：项目质量数据 Source of Truth
- SQLite：后续 Agent/Workflow Runtime State 能力，当前尚未实现
- Filesystem：大型 Evidence Artifact
- PostgreSQL：后续 Shared Workbench 可选能力，不是当前版本依赖

完整方案见 [GitHub 项目完整方案](docs/zh-CN/PROJECT_BLUEPRINT.md)。
