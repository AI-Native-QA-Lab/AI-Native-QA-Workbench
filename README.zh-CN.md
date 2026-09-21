# AI Native QA Workbench

> 一个 AI 原生、Local-first 的 Quality Engineering
> Workbench，将需求、风险、测试、执行和证据连接成可追溯的质量判断。

**[English](README.md) \| 简体中文**

## 核心链路

`Requirement → Acceptance Criteria → Quality Risk → Test Obligation → Test → Execution → Evidence → Quality Assessment → Quality Gate → Human Decision`

AI 参与质量工程全过程，但重要结论需要 Evidence 与 Traceability
支撑，有责任归属的质量决策由人类控制。

## 快速开始

v0.1 MVP 在本地运行，并把项目质量数据保存在 `.ai-qa/`：

```bash
pnpm install
pnpm qaw init ./example-project
pnpm qaw validate ./example-project
pnpm qaw doctor ./example-project
pnpm qaw open ./example-project
pnpm qaw analyze checkout ./example-project
```

启动本地 API 和 UI：

```bash
QAW_ROOT_DIRECTORY="$PWD/example-project" pnpm --filter @ai-native-qa-workbench/server dev
pnpm --filter @ai-native-qa-workbench/web dev
```

`v0.1.0` tag 是之前的 Bootstrap Release；已完成的 v0.1 MVP 实现当前属于
尚未发布的工作区 closeout，不会回写描述为该 tag 已包含的能力。

## 当前 v0.1 MVP 范围

MVP 已实现：

- `.ai-qa/project.yaml` 与 `.ai-qa/quality.yaml` Contract
- 纯 Domain 校验、TraceLink 和确定性的 Completion Contract
- 带 ChangeProposal、显式 Human Review 的 Project Store 原子写入
- 与项目质量数据隔离的 SQLite Runtime State
- Tool 权限/audit、MockProvider、OpenAI-compatible Provider 边界和 Agent Loop
- `qaw init`、`validate`、`doctor`、`open`、`analyze`
- 本地 Fastify API、React/Vite Workbench、英文/zh-CN UI，以及独立的
  `uiLocale`/`outputLocale`
- offline unit、contract、integration、architecture、documentation 和
  Playwright Golden Path gate

Evidence 执行、Quality Assessment/Gate、HumanDecision 持久化、Domain Event、
外部集成和 Shared Workbench 仍属于后续 Roadmap。

## Local-first

- `.ai-qa/`：项目质量数据 Source of Truth
- SQLite：保存 `agent_sessions`、run、step、tool run、approval、workflow 等运行时状态
- Filesystem：大型 Evidence Artifact
- PostgreSQL：后续 Shared Workbench 可选能力，不是当前版本依赖

完整方案见 [GitHub 项目完整方案](docs/zh-CN/PROJECT_BLUEPRINT.md)。

## License

PolyForm Noncommercial License 1.0.0，见 [LICENSE](LICENSE)。
