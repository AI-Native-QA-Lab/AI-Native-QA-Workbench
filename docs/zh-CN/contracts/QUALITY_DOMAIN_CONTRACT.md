# Quality Domain Contract

**状态：** 已实现的 v0.1 MVP Domain 子切片。

**规范实现：** `packages/domain/src/quality-domain.ts`

本 Contract 定义需求及其验收标准的最小纯 Domain 表示。它不定义磁盘格式，也不
定义 Workflow 引擎。

## Purpose / 目的

`Requirement` 与 `AcceptanceCriterion` 为后续 Traceability 工作提供稳定的内存
数据契约。它们可以在不依赖 SQLite、文件系统、YAML 解析、模型 Provider、AI
Runtime 或 UI 的情况下完成校验。

## Public Types / Public 类型

Domain package 从 `@ai-native-qa-workbench/domain` 导出以下类型：

```ts
export interface Requirement {
  id: string;
  title: string;
  description: string;
}

export interface AcceptanceCriterion {
  id: string;
  requirementId: string;
  statement: string;
}
```

`AcceptanceCriterion.requirementId` 是显式引用，不是 Requirement 的嵌套副本。
当前单实体 validator 不解析这个引用。

## Validation API / 校验 API

公共 validator 返回现有的 `ValidationResult` Contract：

```ts
export function validateRequirement(requirement: Requirement): ValidationResult;

export function validateAcceptanceCriterion(
  criterion: AcceptanceCriterion,
): ValidationResult;
```

边界适配器可以先将不可信运行时数据表示为对应的 TypeScript 类型，再调用 typed
API。validator 仍会执行运行时类型检查；字段缺失或格式错误时返回 diagnostics，
不会只依赖编译期类型。

## Identifier Rules / 标识符规则

`Requirement.id`、`AcceptanceCriterion.id` 和
`AcceptanceCriterion.requirementId` 必须匹配：

```text
^[a-z0-9]+(?:-[a-z0-9]+)*$
```

标识符只能使用小写 ASCII 字母、数字，以及位于非空片段之间的单个分隔符。中文、
其他 Unicode 字母、空格、大写字母、下划线、点号、连续分隔符（如 `a--b`）、开头
或结尾的分隔符，以及空字符串都不合法。

validator 不会 trim、slugify 或以其他方式改写标识符。

## Requirement Validation / Requirement 校验

`validateRequirement` 按以下固定顺序追加 diagnostics：

| 顺序 | Code | Path | 规则 |
| --- | --- | --- | --- |
| 1 | `REQUIREMENT_ID_INVALID` | `id` | `id` 必须匹配标识符规则。 |
| 2 | `REQUIREMENT_TITLE_EMPTY` | `title` | `title` 必须是 trim 后非空的字符串。 |
| 3 | `REQUIREMENT_DESCRIPTION_INVALID` | `description` | `description` 必须是字符串；空字符串合法。 |

没有 diagnostics 时返回 `{ valid: true, diagnostics: [] }`。原始 `title` 和
`description` 值会保留；`trim()` 只用于判定是否为空。

## AcceptanceCriterion Validation / AcceptanceCriterion 校验

`validateAcceptanceCriterion` 按以下固定顺序追加 diagnostics：

| 顺序 | Code | Path | 规则 |
| --- | --- | --- | --- |
| 1 | `ACCEPTANCE_CRITERION_ID_INVALID` | `id` | `id` 必须匹配标识符规则。 |
| 2 | `ACCEPTANCE_CRITERION_REQUIREMENT_ID_INVALID` | `requirementId` | `requirementId` 必须匹配标识符规则。 |
| 3 | `ACCEPTANCE_CRITERION_STATEMENT_EMPTY` | `statement` | `statement` 必须是 trim 后非空的字符串。 |

`statement` 可以包含中文、标点和多行文本。首尾空白在 trim 后仍非空时合法，并且
会保留在输入对象中。

没有 diagnostics 时返回 `{ valid: true, diagnostics: [] }`。

## Diagnostics / 诊断

`Diagnostic.code`、`path`、`severity`、diagnostics 顺序和
`ValidationResult.valid` 是机器可读的 Contract 字段。每个 diagnostic 的
`severity` 都是 `"error"`。

`Diagnostic.message` 是当前供 CLI 和调试输出使用的英文解释，不是兼容性键。调用方
应根据 `code` 和 `path` 分支；测试不得把完整 message 文本当作跨版本保证。

`undefined`、`null`、数字或字段原始类型错误等不合法运行时输入会返回 diagnostics，
不会导致 validator 抛异常。

## Immutability / 不可变性

两个 validator 都是纯读取操作：不修改输入对象、不规范化字符串、不创建默认值、
不进行 I/O，也不调用外部服务。

## Relationship Boundary / 关系边界

Acceptance Criterion validator 只检查 `requirementId` 的语法，不检查被引用的
Requirement 是否存在。单实体 validator 没有集合上下文，无法可靠完成存在性判断。
集合级引用完整性属于后续 Project Store 或 Traceability Contract。

## Out of Scope / 当前范围之外

本 Contract 不定义：

- Markdown、YAML、JSON 或数据库持久化格式；
- 实体级 schema version 或 migration 规则；
- `status`、`priority`、`owner`、`labels`、locale、时间戳或 AI 元数据；
- `TraceLink` 创建或图完整性；
- AI 生成、Provider 调用、CLI 命令、UI 行为、Evidence 或 Workflow 状态。

`.ai-qa/` 仍是项目质量数据的 Source of Truth，本 Domain 子切片不会修改它。

## Compatibility Notes / 兼容性说明

这是 v0.1 MVP Domain API。任何未来持久化表示都必须另行设计文件 Contract 和
Migration。诊断 code、path、severity 或诊断顺序的变更必须经过明确的 Contract
审查并补充 Compatibility Test。Diagnostic message 的措辞可以演进，但不能改变
机器契约。
