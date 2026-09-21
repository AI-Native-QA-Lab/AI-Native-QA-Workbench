# TestCase Domain Contract 设计

**状态：** 方案 A 已获确认；本文已完成两轮自 review，待用户 review；尚未实现
代码或实施计划。

## 1. 目标与范围

本阶段继续完成 v0.1 MVP Quality Domain 的下一个最小纯 Domain 切片：在已有
`Requirement`、`AcceptanceCriterion`、`QualityRisk` 和 `TestObligation` 之上，
建立 `TestCase` 数据契约及其确定性校验器。

本阶段表达以下最小关系：

```text
Requirement → QualityRisk → TestObligation → TestCase
```

`TestCase` 是针对一个 `TestObligation` 的可表达、可判断测试设计。它只描述测试
意图、步骤和预期结果，不代表测试已经执行，也不代表存在执行证据。

本切片只建立内存 Domain API，不实现文件持久化、Project Store 查询、CLI、
Traceability 图、TestStrategy、TestRun、Evidence、AI 提议、ChangeProposal、
Human Review 或 UI。

### 已确认的约束

- `.ai-qa/` 仍然是项目质量数据的 Source of Truth；本阶段不写入它。
- `packages/domain` 必须保持纯 TypeScript，不引入 filesystem、YAML、Zod、
  SQLite、Provider、MCP、GitHub、Jira 或测试框架。
- 所有行为先写 RED 测试，再实现最小 GREEN，并运行 architecture check 和完整
  回归。
- 过程文档使用中文；实现完成后英文正式 Contract 与中文镜像保持结构一致。
- 本阶段不把测试设计、测试计划、执行状态和运行结果混成一个 Domain 实体。

## 2. 问题背景与领域语言

已有 `TestObligation` 表达“必须针对某个质量风险验证什么”。它仍然是质量义务，
不是具体的测试步骤。`TestCase` 将这个义务落成一个可供人工评审、后续测试计划
引用的测试设计。

本阶段采用以下语义：

- 一个 `TestCase` 针对一个 `TestObligation`；
- 一个 `TestObligation` 可以有多个 `TestCase`，例如正向、异常和边界场景；
- `steps` 和 `expectedResult` 是设计文本，不是执行记录；
- `obligationId` 是显式关系字段，但单实体 validator 不负责查询被引用实体；
- `TestCase` 不复制 Requirement、Risk 或 Obligation 的文本。

旧 dsh-qa 用例中存在 `kind`、`priority`、`status`、`automationRef`、计划关联和
执行相关字段。这些字段属于后续测试策略、计划或运行模型，本阶段不直接迁移到
新的纯 Domain Contract。

## 3. 建模方案与决策

### 3.1 备选方案

1. **结构化最小用例：** `id`、`obligationId`、`title`、`steps`、
   `expectedResult`。能够表达可执行、可判断的测试设计，同时不引入执行状态。
2. **单一叙述用例：** `id`、`obligationId`、`statement`。实现最小，但无法稳定
   区分测试步骤与判定结果，不足以支撑后续用例评审和测试提议。
3. **迁移旧用例完整字段：** 同时加入类型、优先级、前置条件、状态、自动化目标、
   计划和风险标签。信息更丰富，但会把测试设计、计划和运行语义提前耦合。

### 3.2 选定方案

采用方案 1：

```text
TestCase = id + obligationId + title + steps + expectedResult
```

选择理由：

- `title` 说明场景；
- `steps` 说明如何验证；
- `expectedResult` 提供可判断的结果；
- `obligationId` 保留从测试用例回到质量义务的明确关系；
- 字段全部是纯文本，避免本阶段提前决定步骤数组、执行器、参数化和结果枚举。

`preconditions` 暂不作为独立字段；需要前置条件时先写入 `steps` 的明确文本中。
在未来真实执行模型稳定后，再单独评估是否需要前置条件 Contract，而不是在本切片
中留下一个语义不清的可选字段。

长期 Blueprint 链中的 `TestStrategy` 仍然保留。它未来负责测试范围、选择和计划等
规划语义，可以引用一个或多个 `TestCase`；本切片的 `obligationId` 继续表示测试用例
的质量来源，不被未来的策略层替换。这样既保持 `TestObligation → TestCase` 的直接
可追踪性，也不提前创建 `TestStrategy` 实体。

## 4. Domain API

在 `packages/domain/src/quality-domain.ts` 中新增并从
`@ai-native-qa-workbench/domain` 公共入口导出：

```ts
export interface TestCase {
  id: string;
  obligationId: string;
  title: string;
  steps: string;
  expectedResult: string;
}

export function validateTestCase(testCase: TestCase): ValidationResult;
```

现有 `Project`、`Requirement`、`AcceptanceCriterion`、`QualityRisk`、
`TestObligation`、`Diagnostic`、`DiagnosticCode` 和 `ValidationResult` API 保持
兼容；只向 `DiagnosticCode` union 追加本阶段的五个 code，不修改已有 code 的含义、
字段或顺序。

## 5. 校验规则

### 5.1 ID 规则

`TestCase.id` 和 `TestCase.obligationId` 必须匹配现有共享 helper 使用的：

```text
^[a-z0-9]+(?:-[a-z0-9]+)*$
```

中文、其他 Unicode 字符、空格、大写字母、下划线、点号、连续分隔符（例如 `a--b`）、
开头或结尾的分隔符，以及空字符串都返回 invalid diagnostic。validator 不 trim、
slugify 或修改 ID。

### 5.2 字段规则与固定顺序

`validateTestCase` 按以下固定顺序追加 diagnostics：

1. `id` 不合法：`TEST_CASE_ID_INVALID`，path 为 `id`；
2. `obligationId` 不合法：`TEST_CASE_OBLIGATION_ID_INVALID`，path 为
   `obligationId`；
3. `title` 不是字符串或 trim 后为空：`TEST_CASE_TITLE_EMPTY`，path 为 `title`；
4. `steps` 不是字符串或 trim 后为空：`TEST_CASE_STEPS_EMPTY`，path 为 `steps`；
5. `expectedResult` 不是字符串或 trim 后为空：`TEST_CASE_EXPECTED_RESULT_EMPTY`，
   path 为 `expectedResult`。

合法的文本字段可以包含中文、标点、换行和首尾空白；首尾空白在 trim 后仍非空时
合法，并且必须原样保留。没有 diagnostics 时返回：

```ts
{ valid: true, diagnostics: [] }
```

### 5.3 运行时输入与不可变性

TypeScript 参数保持 `TestCase` 类型，但实现必须防御边界适配器传入的不可信运行时
值。对整个输入为 `undefined`、`null`、数字或字符串的情况，validator 不得抛异常，
而应按固定顺序返回对应字段 diagnostics。实现可使用：

```ts
const candidate = (testCase ?? {}) as Partial<TestCase>;
```

validator 只读输入对象，不 trim、slugify、补默认值、写文件或调用外部服务。

### 5.4 关系边界

`validateTestCase` 只检查 `obligationId` 的标识符语法，不检查该
`TestObligation` 是否存在，也不检查它是否属于同一个 Project。孤立引用、重复 ID、
跨实体一致性和图完整性属于后续 Project Store/Traceability Contract 的职责。

## 6. Diagnostic Contract

新增 `DiagnosticCode`：

```text
TEST_CASE_ID_INVALID
TEST_CASE_OBLIGATION_ID_INVALID
TEST_CASE_TITLE_EMPTY
TEST_CASE_STEPS_EMPTY
TEST_CASE_EXPECTED_RESULT_EMPTY
```

`Diagnostic.code`、`path`、`severity`、diagnostics 顺序和 `ValidationResult.valid`
是机器可依赖字段。每个 diagnostic 的 severity 都是 `"error"`。

`Diagnostic.message` 继续使用当前英文解释，仅服务于 CLI/调试输出，不是兼容性键。
测试必须断言 code、path、severity 和顺序，不断言完整 message 文本。

## 7. 架构与实现边界

实现继续放在 `packages/domain`：

- `packages/domain/src/quality-domain.ts`：新增 `TestCase` interface 和
  `validateTestCase`；
- `packages/domain/src/project.ts`：扩展 `DiagnosticCode` union；
- `packages/domain/src/index.ts`：确认新增 public API 可导出；
- `packages/domain/src/identifiers.ts`：继续作为内部共享 ID helper，不从公共入口
  导出；
- `tests/unit/domain/quality-domain.test.ts`：追加 `TestCase` 行为测试。

双语正式 Contract 在实现阶段同步更新：

- `docs/en/contracts/QUALITY_DOMAIN_CONTRACT.md`；
- `docs/zh-CN/contracts/QUALITY_DOMAIN_CONTRACT.md`。

本阶段不新建 Store、CLI、UI、TraceLink 或 TestStrategy 实现，不修改 Project File
Contract 的 `schemaVersion: "0.1"`，不新增运行时依赖。

依赖方向保持：

```text
apps/cli → packages/project-store → packages/domain
```

## 8. 测试设计

严格执行：

```text
Contract → Behavior → RED → Minimal Implementation → GREEN → REFACTOR
→ Architecture Check → Regression → Documentation
```

至少覆盖：

1. 合法 `TestCase` 通过，中文、多行文本和首尾空白均保持输入不变；
2. 同时提供非法 `id`、非法 `obligationId`、空 `title`、空 `steps` 和空
   `expectedResult`，确认返回五个固定顺序的 diagnostics；
3. 每个文本字段分别覆盖非字符串、空字符串和 trim 后为空的字符串；
4. `id` 与 `obligationId` 分别覆盖中文、空格、大写、下划线、点号、连续分隔符、
   开头分隔符、结尾分隔符和空字符串；
5. 覆盖整个输入为 `undefined`、`null`、数字和字符串的 malformed runtime input，
   确认不抛异常；
6. 使用格式合法但未加载的 `obligationId`，确认单实体 validator 不做存在性查询；
7. 确认 validator 不修改输入对象；
8. 确认 `TestCase` 类型和 validator 从 public entry 导出，内部 helper 不导出；
9. 运行 Domain architecture check、typecheck、build、完整测试和 docs check。

## 9. UI 与后续模型进入条件

本 spec 不实现 UI。第一版测试相关 UI 的进入条件是：

- `TestCase` Contract 与 Project Store 的只读 read model 已稳定；
- UI 不直接读取 `.ai-qa/`，而是消费应用层 read model；
- Traceability Contract 能表达 `TestObligation → TestCase` 和其他质量关系。

本切片不定义以下字段或实体：

- `TestStrategy`、`TestPlan`、`TestRun`、`Evidence`；
- `status`、`priority`、`kind`、`automationRef`、执行目标和运行结果；
- AI 来源、置信度、生成时间、人工审批或 ChangeProposal 元数据；
- 步骤数组、参数化数据、断言 DSL 和执行器特定配置。

这些内容必须在各自 Contract 和边界明确后单独设计，不能通过给 `TestCase` 继续加
字段来绕过建模。

## 10. 验收标准

只有以下条件全部满足，才认为本切片完成：

- `TestCase` 类型和 validator 从 Domain public entry 导出；
- 五个 diagnostic code、path、severity 和固定顺序与本 spec 一致；
- validator 不修改输入、不做关系存在性查询，不引入基础设施依赖；
- `TestCase` 使用 `obligationId` 建立到 TestObligation 的显式关系；
- 既有 Project、Requirement、AcceptanceCriterion、QualityRisk 和
  TestObligation 行为不回归；
- unit、typecheck、architecture、build、完整测试和 docs check 全部通过；
- 英文正式 Contract 与中文镜像同步记录字段、校验规则和边界；
- `git diff --check` 干净，未修改无关项目。

## 11. 两轮自 review 记录

### 第一轮：领域语义与范围

- 确认 `TestCase` 表达测试设计，不把执行结果或 Evidence 伪装成设计字段；
- 确认 `obligationId` 是唯一上游关系，避免复制 `requirementId`、`riskId` 或提前
  引入通用 `TraceLink`；
- 确认 `TestStrategy` 虽出现在长期产品链中，但不属于当前最小 Domain 实现，避免
  为了占位而创建空实体；
- 确认旧 dsh-qa 的完整字段不能直接作为新 Domain Contract，已明确延后计划、状态
  和自动化字段。

### 第二轮：可验证性与未来兼容

- 确认 `title`、`steps`、`expectedResult` 三个字段足以形成可判断测试设计，且不需
  在本阶段决定数组或 DSL 结构；
- 确认 `preconditions` 的暂缓是显式边界，不使用模糊的可选字段；
- 确认 malformed runtime input、输入不变性、孤立但语法合法的引用和诊断顺序均有
  明确测试要求；
- 确认五个诊断 code 与已有命名、path、severity 约定一致，未改变既有 Contract；
- 确认实现文件、双语 Contract、测试文件和验证命令范围均已列出，未把 Store、UI、
  AI 或执行器实现混入本切片。
