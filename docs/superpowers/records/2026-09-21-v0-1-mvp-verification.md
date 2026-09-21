# v0.1 MVP 最终验证记录

**日期：** 2026-09-21
**范围：** 一次性完成 v0.1 MVP 剩余能力，并修复严格审查确认的问题
**实现提交：** `c53dc5f fix: close v0.1 mvp audit findings`

## Gate 结果

| Gate | 结果 | 证据 |
| --- | --- | --- |
| Format / lint / typecheck | PASS | `pnpm check` |
| Workspace build | PASS | 10 个 workspace package build 成功 |
| Unit / Contract / Integration | PASS | 21 个测试文件、198 个测试通过 |
| Architecture | PASS | 3 个 architecture tests 通过 |
| Documentation | PASS | 28 个 Blueprint Markdown、55 个 Markdown 文件通过 |
| Quality file Contract | PASS | `quality.yaml` malformed、round-trip、引用和原子写入测试通过 |
| Browser Golden Path | PASS | `pnpm test:e2e`，1 个测试通过 |
| Diff hygiene | PASS | `git diff --check` 通过 |

## 本轮审查修复

- QualitySnapshot 现在校验 TraceLink endpoint 是否存在，并拒绝重复 TraceLink ID。
- `qaw init` 拒绝覆盖已有质量文件；配对写入失败时清理新建的部分项目文件。
- ChangeProposal 按顺序预览操作，前序删除导致的后续目标缺失会返回诊断，不再静默继续。
- Server API 在进入应用服务前校验 locale、requirementId、reviewer、decision 和操作索引。
- ToolRegistry 要求每次执行绑定 `runId` 与 Runtime Store，并把 completed/denied/failed
  审计写入 SQLite；观察 callback 不能替代 Runtime audit。
- MVP 实施计划已与实际 v0.1 Contract 对齐；model invocation telemetry、图索引、token
  streaming、provider-tool orchestration 和持久化 `QualityTaskRun` 明确留待后续版本。
- 早期 Bootstrap 设计/计划标记为历史记录，避免其旧的“尚未开始实现”和未勾选清单被误读为当前状态。

## 验收路径

本地浏览器 Fixture 每次启动前复制到临时目录，流程为：

`load → analyze → propose → review → approve → atomic apply → reload → refresh counts`

验证内容包含：Requirement、AcceptanceCriterion、QualityRisk、TestObligation、TestCase、TraceLink、Proposal 的 `applied` 状态、显式 reviewer、独立 `uiLocale`/`outputLocale` 和重复运行不污染仓库 Fixture。

## 两轮自审

第一轮按 `AGENTS.md`、设计规格、实施计划和 Contract 检查了 Source of Truth、Proposal/Human Review、Runtime Store、Provider/Agent 边界、UI/API 和 CI；修复了 UI 把 `applied` 显示为 `approved`、伪造 review 状态、空/重复 partial approval、outputLocale 未形成模型指令和 E2E Fixture 污染问题。

第二轮检查双语 UI 文案、真实 reviewer 输入、machine value、本地化边界、重复 E2E、diff、
架构检查、文档索引以及本轮严格审查发现的契约/范围问题；当前 Gate 全部通过。

## 证据边界

本记录只证明当前本地 checkout 的源码静态检查、构建、自动化测试、MockProvider、临时本地项目
和本地浏览器流程。它不证明真实 LLM 输出质量、外部 CI 或第三方集成、生产部署、业务质量 Gate、
Google 抓取或远端 closeout 已完成。

`v0.1.0` 仍是 Bootstrap Release。本次是本地实现 closeout；推送 closeout、创建新的 GitHub
tag/Release、建立 Milestone 或 Issue 需要单独的外部发布决策。
