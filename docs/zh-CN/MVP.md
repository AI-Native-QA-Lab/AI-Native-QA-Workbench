# MVP --- v0.1

## 当前状态

`v0.1.0` tag 是 Bootstrap Release。剩余 v0.1 MVP 实现已经在尚未发布的
closeout 工作区完成；不会重写 Bootstrap tag。

## 快速开始

```bash
pnpm install
pnpm qaw init ./example-project
pnpm qaw validate ./example-project
pnpm qaw doctor ./example-project
pnpm qaw open ./example-project
pnpm qaw analyze checkout ./example-project
```

## 已实现的 v0.1 MVP

- `.ai-qa/project.yaml` 与 `.ai-qa/quality.yaml` Contract
- QualitySnapshot、TraceLink、集合校验和质量文件原子写入
- ChangeProposal、Human Review、revision 冲突检测和确定性 QA Task Completion
- SQLite Runtime Store、ToolRegistry、Mock/OpenAI-compatible Provider 和 AgentRunner
- `qaw init`、`validate`、`doctor`、`open`、`analyze`
- Fastify 本地 API、React/Vite Workbench、双语 UI 和 Playwright Golden Path
- Workbench 在提交决策前要求用户填写非空 reviewer 标识；UI locale 与 AI outputLocale
  保持独立。

## Golden Path

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

该路径已经使用 MockProvider 和本地 fixture 实现，但不证明真实 LLM 质量、外部集成、
生产部署或执行 Evidence。

## 延后范围

TestRun、Evidence、QualityAssessment、QualityGate、Domain Event、MCP、GitHub/Jira、
远程执行、多人/RBAC、PostgreSQL 和 Shared Workbench 延后到 v0.2/v0.3/1.x/2.x。

## 证据边界

静态检查、unit/contract/integration、MockProvider replay 和本地浏览器 E2E 是不同证据
类别，不能描述为真实模型 replay、外部 CI、生产部署或 Google/远程验收证据。

## MVP 完成标准

`pnpm check` 和 `pnpm test:e2e` 在不调用真实 LLM 的条件下通过，并覆盖 Domain、Store、
Runtime、Tool、Provider、Agent、QA Task、API、UI、i18n、架构和文档边界。
