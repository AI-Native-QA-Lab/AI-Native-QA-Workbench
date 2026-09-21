# Quality Domain Contract

**状态：** 已实现的 v0.1 MVP Domain 与集合 Contract。

**规范实现：** `packages/domain/src/quality-domain.ts`

本 Contract 定义 Requirement、AcceptanceCriterion、QualityRisk、TestObligation 和
TestCase 的最小纯 Domain 表示。它不定义磁盘格式，也不定义 Workflow 引擎。

## Purpose / 目的

`Requirement`、`AcceptanceCriterion`、`QualityRisk`、`TestObligation` 与 `TestCase`
为后续 Traceability 工作提供稳定的内存数据契约。它们可以在不依赖 SQLite、文件系统、
YAML 解析、模型 Provider、AI Runtime 或 UI 的情况下完成校验。

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

export interface QualityRisk {
  id: string;
  requirementId: string;
  statement: string;
}

export interface TestObligation {
  id: string;
  riskId: string;
  statement: string;
}

export interface TestCase {
  id: string;
  obligationId: string;
  title: string;
  steps: string;
  expectedResult: string;
}

export type QualityEntityType =
  | "requirement"
  | "acceptance-criterion"
  | "quality-risk"
  | "test-obligation"
  | "test-case";

export interface TraceLink {
  id: string;
  fromType: QualityEntityType;
  fromId: string;
  toType: QualityEntityType;
  toId: string;
  relation: "satisfies" | "mitigates" | "verifies";
}

export interface QualitySnapshot {
  schemaVersion: "0.1";
  requirements: Requirement[];
  acceptanceCriteria: AcceptanceCriterion[];
  qualityRisks: QualityRisk[];
  testObligations: TestObligation[];
  testCases: TestCase[];
  traceLinks: TraceLink[];
}
```

`AcceptanceCriterion.requirementId` 和 `QualityRisk.requirementId` 是显式引用，
不是 Requirement 的嵌套副本。`TestObligation.riskId` 是指向 QualityRisk 的显式
引用。`TestCase.obligationId` 是指向 TestObligation 的显式引用。当前单实体
validator 不解析这些引用。

`QualitySnapshot` 是项目质量集合的内存边界。`validateQualitySnapshot` 在单实体
validator 之上检查 schema version、集合类型、集合内重复 ID、直接引用是否存在，以及
TraceLink 的关系类型、自引用和重复定义。它是纯读取操作，不执行文件或数据库 I/O。

## Validation API / 校验 API

公共 validator 返回现有的 `ValidationResult` Contract：

```ts
export function validateRequirement(requirement: Requirement): ValidationResult;

export function validateAcceptanceCriterion(criterion: AcceptanceCriterion): ValidationResult;

export function validateQualityRisk(risk: QualityRisk): ValidationResult;

export function validateTestObligation(obligation: TestObligation): ValidationResult;

export function validateTestCase(testCase: TestCase): ValidationResult;

export function validateQualitySnapshot(snapshot: QualitySnapshot): ValidationResult;
```

边界适配器可以先将不可信运行时数据表示为对应的 TypeScript 类型，再调用 typed
API。validator 仍会执行运行时类型检查；字段缺失或格式错误时返回 diagnostics，
不会只依赖编译期类型。

## Identifier Rules / 标识符规则

`Requirement.id`、`AcceptanceCriterion.id`、`AcceptanceCriterion.requirementId`、
`QualityRisk.id`、`QualityRisk.requirementId`、`TestObligation.id`、
`TestObligation.riskId`、`TestCase.id` 和 `TestCase.obligationId` 必须匹配：

```text
^[a-z0-9]+(?:-[a-z0-9]+)*$
```

标识符只能使用小写 ASCII 字母、数字，以及位于非空片段之间的单个分隔符。中文、
其他 Unicode 字母、空格、大写字母、下划线、点号、连续分隔符（如 `a--b`）、开头
或结尾的分隔符，以及空字符串都不合法。

validator 不会 trim、slugify 或以其他方式改写标识符。

## Requirement Validation / Requirement 校验

`validateRequirement` 按以下固定顺序追加 diagnostics：

| 顺序 | Code                              | Path          | 规则                                       |
| ---- | --------------------------------- | ------------- | ------------------------------------------ |
| 1    | `REQUIREMENT_ID_INVALID`          | `id`          | `id` 必须匹配标识符规则。                  |
| 2    | `REQUIREMENT_TITLE_EMPTY`         | `title`       | `title` 必须是 trim 后非空的字符串。       |
| 3    | `REQUIREMENT_DESCRIPTION_INVALID` | `description` | `description` 必须是字符串；空字符串合法。 |

没有 diagnostics 时返回 `{ valid: true, diagnostics: [] }`。原始 `title` 和
`description` 值会保留；`trim()` 只用于判定是否为空。

## AcceptanceCriterion Validation / AcceptanceCriterion 校验

`validateAcceptanceCriterion` 按以下固定顺序追加 diagnostics：

| 顺序 | Code                                          | Path            | 规则                                     |
| ---- | --------------------------------------------- | --------------- | ---------------------------------------- |
| 1    | `ACCEPTANCE_CRITERION_ID_INVALID`             | `id`            | `id` 必须匹配标识符规则。                |
| 2    | `ACCEPTANCE_CRITERION_REQUIREMENT_ID_INVALID` | `requirementId` | `requirementId` 必须匹配标识符规则。     |
| 3    | `ACCEPTANCE_CRITERION_STATEMENT_EMPTY`        | `statement`     | `statement` 必须是 trim 后非空的字符串。 |

`statement` 可以包含中文、标点和多行文本。首尾空白在 trim 后仍非空时合法，并且
会保留在输入对象中。

没有 diagnostics 时返回 `{ valid: true, diagnostics: [] }`。

## QualityRisk and TestObligation Validation / QualityRisk 与 TestObligation 校验

`QualityRisk` 归属于 `Requirement`，`TestObligation` 表达必须针对
`QualityRisk` 验证的质量行为。两个 validator 按以下固定顺序追加 diagnostics：

### QualityRisk

| 顺序 | Code                                  | Path            | 规则                                     |
| ---- | ------------------------------------- | --------------- | ---------------------------------------- |
| 1    | `QUALITY_RISK_ID_INVALID`             | `id`            | `id` 必须匹配标识符规则。                |
| 2    | `QUALITY_RISK_REQUIREMENT_ID_INVALID` | `requirementId` | `requirementId` 必须匹配标识符规则。     |
| 3    | `QUALITY_RISK_STATEMENT_EMPTY`        | `statement`     | `statement` 必须是 trim 后非空的字符串。 |

### TestObligation

| 顺序 | Code                              | Path        | 规则                                     |
| ---- | --------------------------------- | ----------- | ---------------------------------------- |
| 1    | `TEST_OBLIGATION_ID_INVALID`      | `id`        | `id` 必须匹配标识符规则。                |
| 2    | `TEST_OBLIGATION_RISK_ID_INVALID` | `riskId`    | `riskId` 必须匹配标识符规则。            |
| 3    | `TEST_OBLIGATION_STATEMENT_EMPTY` | `statement` | `statement` 必须是 trim 后非空的字符串。 |

两个 `statement` 都可以包含中文、标点和多行文本。首尾空白在 trim 后仍非空时合法，
并且会保留在输入对象中。格式合法但当前尚未加载的 `requirementId` 或 `riskId` 会
通过对应的单实体 validator。

## TestCase Validation / TestCase 校验

`TestCase` 表示一个针对 `TestObligation` 的具体测试用例。`obligationId` 只检查
标识符语法；validator 不解析被引用的 obligation 是否存在。validator 按以下固定
顺序追加 diagnostics：

| 顺序 | Code                              | Path             | 规则                                          |
| ---- | --------------------------------- | ---------------- | --------------------------------------------- |
| 1    | `TEST_CASE_ID_INVALID`            | `id`             | `id` 必须匹配标识符规则。                     |
| 2    | `TEST_CASE_OBLIGATION_ID_INVALID` | `obligationId`   | `obligationId` 必须匹配标识符规则。           |
| 3    | `TEST_CASE_TITLE_EMPTY`           | `title`          | `title` 必须是 trim 后非空的字符串。          |
| 4    | `TEST_CASE_STEPS_EMPTY`           | `steps`          | `steps` 必须是 trim 后非空的字符串。          |
| 5    | `TEST_CASE_EXPECTED_RESULT_EMPTY` | `expectedResult` | `expectedResult` 必须是 trim 后非空的字符串。 |

`title`、`steps` 和 `expectedResult` 可以包含中文、标点和多行文本。首尾空白在 trim
后仍非空时合法，并且会保留在输入对象中。格式合法但当前尚未加载的 `obligationId`
会通过单实体 validator。

## Diagnostics / 诊断

`Diagnostic.code`、`path`、`severity`、diagnostics 顺序和
`ValidationResult.valid` 是机器可读的 Contract 字段。每个 diagnostic 的
`severity` 都是 `"error"`。

QualityRisk/TestObligation/TestCase 合计十一个 code 如下：

| Code                                  | Path             | 含义                                            |
| ------------------------------------- | ---------------- | ----------------------------------------------- |
| `QUALITY_RISK_ID_INVALID`             | `id`             | Quality risk 的 `id` 语法不合法。               |
| `QUALITY_RISK_REQUIREMENT_ID_INVALID` | `requirementId`  | Quality risk 的 `requirementId` 语法不合法。    |
| `QUALITY_RISK_STATEMENT_EMPTY`        | `statement`      | Quality risk 的 `statement` 不是非空字符串。    |
| `TEST_OBLIGATION_ID_INVALID`          | `id`             | Test obligation 的 `id` 语法不合法。            |
| `TEST_OBLIGATION_RISK_ID_INVALID`     | `riskId`         | Test obligation 的 `riskId` 语法不合法。        |
| `TEST_OBLIGATION_STATEMENT_EMPTY`     | `statement`      | Test obligation 的 `statement` 不是非空字符串。 |
| `TEST_CASE_ID_INVALID`                | `id`             | Test case 的 `id` 语法不合法。                  |
| `TEST_CASE_OBLIGATION_ID_INVALID`     | `obligationId`   | Test case 的 `obligationId` 语法不合法。        |
| `TEST_CASE_TITLE_EMPTY`               | `title`          | Test case 的 `title` 不是非空字符串。           |
| `TEST_CASE_STEPS_EMPTY`               | `steps`          | Test case 的 `steps` 不是非空字符串。           |
| `TEST_CASE_EXPECTED_RESULT_EMPTY`     | `expectedResult` | Test case 的 `expectedResult` 不是非空字符串。  |

`Diagnostic.message` 是当前供 CLI 和调试输出使用的英文解释，不是兼容性键。调用方
应根据 `code` 和 `path` 分支；测试不得把完整 message 文本当作跨版本保证。

`undefined`、`null`、数字、字符串或字段原始类型错误等不合法运行时输入会返回
diagnostics，不会导致 validator 抛异常。

## Immutability / 不可变性

五个 validator 都是纯读取操作：不修改输入对象、不规范化字符串、不创建默认值、不
进行 I/O，也不调用外部服务。

## QualitySnapshot 与 TraceLink 校验

规范的质量 schema version 是 `"0.1"`。集合校验会在需要时返回以下集合级 code：

| Code | 含义 |
| ---- | ---- |
| `QUALITY_SCHEMA_UNSUPPORTED` | snapshot 的 schema version 不是 `0.1`。 |
| `QUALITY_*_NOT_ARRAY` | 必需的质量集合不是数组。 |
| `QUALITY_DUPLICATE_ID` | 同一个集合内重复出现 ID，包括 `traceLinks`。 |
| `QUALITY_REFERENCE_NOT_FOUND` | 直接实体引用无法在当前 snapshot 中解析。 |
| `QUALITY_TRACE_LINK_INVALID` | TraceLink 结构或类型/关系组合不合法。 |
| `QUALITY_TRACE_LINK_SELF_REFERENCE` | TraceLink 指向自身。 |
| `QUALITY_TRACE_LINK_DUPLICATE` | 同一条 trace edge 被重复声明。 |

支持的 TraceLink 语义组合如下：

| From | Relation | To |
| ---- | -------- | -- |
| `requirement` | `satisfies` | `requirement` |
| `acceptance-criterion` | `satisfies` | `requirement` |
| `quality-risk` | `mitigates` | `requirement` |
| `test-obligation` | `verifies` | `quality-risk` |
| `test-case` | `verifies` | `test-obligation` |

validator 保留输入值和 diagnostics 顺序，不推断缺失链接、不改写标识符，也不修改
snapshot。

集合校验还要求每个合法 TraceLink 的端点都能解析到声明类型对应的实体；`traceLinks`
集合内的 TraceLink ID 必须唯一。

## Relationship Boundary / 关系边界

`AcceptanceCriterion` 与 `QualityRisk` validator 只检查各自 `requirementId` 引用
的语法；`TestObligation` validator 只检查 `riskId` 引用的语法；`TestCase` validator
只检查 `obligationId` 引用的语法。它们不检查被引用的实体是否存在，因为单实体
validator 没有集合上下文。集合级重复 ID、断裂引用和图完整性属于后续 Project Store
或集合 Contract。现在由 `validateQualitySnapshot` 提供集合校验；图完整性和覆盖率
策略仍不属于本 Contract。

`QualityRisk` 不要求增加 `acceptanceCriterionId`；一个风险可以覆盖多个验收标准。
更具体的验收标准关联属于未来 Traceability Contract。

## Out of Scope / 当前范围之外

本 Contract 不定义：

- Markdown、YAML、JSON 或数据库持久化格式；
- 实体级 schema version 或 migration 规则；
- QualityRisk/TestObligation 的 `status`、`riskSeverity`、`likelihood`、
  `priority`、`owner`、`mitigation`、`testLevel`、`locale`、时间戳或 AI 元数据；
- TestCase 的 `status`、`priority`、`kind`、`automationRef`、执行目标、运行结果、
  步骤数组、参数化和断言 DSL；
- TraceLink 创建工作流、图完整性或覆盖率策略；
- AI 生成、Provider 调用、CLI 命令、UI 行为、Evidence 或 Workflow 状态。

`.ai-qa/` 仍是项目质量数据的 Source of Truth，本 Domain 子切片不会修改它。

## Compatibility Notes / 兼容性说明

这是 v0.1 MVP Domain API。任何未来持久化表示都必须另行设计文件 Contract 和
Migration。诊断 code、path、severity 或诊断顺序的变更必须经过明确的 Contract
审查并补充 Compatibility Test。Diagnostic message 的措辞可以演进，但不能改变
机器契约。
