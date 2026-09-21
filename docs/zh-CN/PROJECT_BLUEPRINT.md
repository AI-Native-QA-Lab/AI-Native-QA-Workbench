# AI Native QA Workbench --- GitHub 项目完整方案

## GitHub 项目信息

**仓库名称：** `ai-native-qa-workbench`

**GitHub Description：**

> AI-native, local-first Quality Engineering Workbench for turning
> requirements, risks, tests and evidence into traceable quality
> decisions.

**建议 Topics：**

`quality-engineering`, `software-testing`, `qa`, `ai-testing`,
`ai-native`, `agentic-ai`, `testing-tools`, `quality-assurance`, `llm`,
`ai-agents`, `local-first`

## 项目定义

AI Native QA Workbench 是一个 Model-agnostic、Local-first、以 Quality
Engineering Domain 为核心的 AI 原生 QA 工作台。

核心链路：

`Requirement → AcceptanceCriterion → QualityRisk → TestObligation → TestStrategy → TestCase → TestRun → Evidence → QualityAssessment → QualityGate → HumanDecision`

它不是通用 Agent Framework、Browser Automation Framework、LLM
Gateway、Prompt Repository、CI 或 Jira 替代品。

## 核心差异

`Quality Domain + Test Obligation + Traceability + Evidence Provenance + AI-native Workflow + Quality Assessment + Human-controlled Decision + Three Loops`

## Three Loops

### Agent Execution Loop

负责模型、工具和观察循环：

`Reason → Act → Observe → Reason → ... → Finish`

支持 pause/resume/cancel、tool
permission、timeout、maxSteps、waiting_for_approval。

### QA Task Loop

负责判断 QA Task 是否真正完成：

`Context → Analyze → Gap → Proposal → Validate → Human Review → Apply → Re-evaluate → Completion Validator`

LLM 不能仅通过输出 "done" 完成任务。

### Quality Engineering Loop

负责在质量状态变化时重新触发质量工作：

`Domain Event → Workflow → QualityTask → QA Task Loop → Agent Loop`

采用 event-driven，而不是永久 while loop。

## Local-first

`.ai-qa/` 是 Project Quality Source of Truth。

SQLite 只负责 Agent/Workflow Runtime State 和可重建 Index。

Evidence 大文件保存在本地文件系统。

PostgreSQL 只作为后续 Shared Workbench 的可选 Storage Adapter，不进入
v0.x 默认架构。

## Human-in-the-loop

AI 不直接修改 `.ai-qa/`：

`AI → Domain Operation → ChangeProposal → Validation → Human Review → Apply → Atomic Write`

AI 可以生成 QualityAssessment，但不能冒充 HumanDecision。

## 技术栈

-   TypeScript / Node.js 22.22.2+
-   pnpm + Turborepo
-   React + Vite
-   Fastify
-   Zod + JSON Schema
-   Markdown / YAML / JSON
-   SQLite + better-sqlite3
-   Vitest + Testing Library + Playwright
-   i18next
-   GitHub Actions

## 工程方式

`Contract → RED → Minimal Implementation → GREEN → REFACTOR → Architecture Check → Regression → Docs`

Core CI 使用 MockProvider，不依赖真实 LLM。

## 文档

正式项目文档 English-first，并维护中文镜像；开发过程文档中文优先。
