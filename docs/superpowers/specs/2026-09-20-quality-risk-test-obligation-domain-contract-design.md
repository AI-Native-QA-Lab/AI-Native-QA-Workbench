# QualityRisk 与 TestObligation Domain Contract 设计

**状态：** 已获范围确认，已完成两轮设计 review、两轮自 review 和 TDD 实现；实现
已完成，待最终验证。

## 1. 目标与范围

本阶段继续完成 v0.1 MVP Quality Domain 的下一个最小纯 Domain 切片：在已经存在
的 `Requirement` 与 `AcceptanceCriterion` 之上，建立 `QualityRisk` 与
`TestObligation` 两个数据契约及其确定性校验器。

本阶段的目标是表达以下可追踪的最小关系链：

```text
Requirement → QualityRisk → TestObligation
```

其中 `QualityRisk` 归属于 Requirement，`TestObligation` 针对 QualityRisk。该切片
只建立内存 Domain API，不实现文件持久化、Project Store 查询、CLI、Traceability
图、AI 提议、ChangeProposal、UI 或 Runtime。

### 已确认的约束

- `.ai-qa/` 仍然是项目质量数据的 Source of Truth；本阶段不写入它。
- `packages/domain` 必须保持纯 TypeScript，不引入 filesystem、YAML、Zod、
  SQLite、Provider、MCP、GitHub、Jira 或测试框架。
- 所有行为先写 RED 测试，再实现最小 GREEN，并运行 architecture check 和完整
  回归。
- 过程文档使用中文；实现完成后英文正式 Contract 与中文镜像保持结构一致。
- QualityRisk 和 TestObligation 不增加 status、riskSeverity、likelihood、priority、
  owner、mitigation、testLevel、locale、schemaVersion、时间戳或 AI 元数据。
- 当前 UI 不属于本切片。核心 Domain 与 Project Store 的 read model 稳定后，才
  开始第一版只读 UI；AI 助手和变更审查 UI 必须等待 ChangeProposal/Human Review
  契约稳定。

## 2. 建模方案与决策

### 2.1 备选方案

本阶段比较了三种关系建模方式：

1. `QualityRisk.requirementId` → `TestObligation.riskId`：风险归属于 Requirement，
   测试义务针对 Risk。字段最少且关系明确。
2. `QualityRisk.acceptanceCriterionId` → `TestObligation.riskId`：关系更细，但会
   强制每个风险绑定到单一 AcceptanceCriterion，无法自然表达跨 AC 风险。
3. 使用通用 `TraceLink` 或多目标引用：灵活，但会提前引入集合级图模型和关系
   类型，超出当前 Domain 垂直切片。

### 2.2 选定方案

采用方案 1：

- `QualityRisk` 使用 `requirementId` 作为所属关系；一个风险可以覆盖 Requirement
  的多个 AcceptanceCriterion，具体 AC 关联留给未来 Traceability contract。
- `TestObligation` 使用 `riskId` 作为针对关系；一个测试义务表达对某个风险的
  必须验证的质量行为。
- 单实体 validator 只检查引用 ID 的格式，不查询被引用实体是否存在。
- 集合级重复 ID、断裂引用、多对多关系和图完整性由后续 Project Store/Traceability
  contract 负责。

这个选择既保留了 `Requirement → Risk → Obligation` 的明确 Domain 关系，也避免
在没有集合上下文时把存在性检查、关系类型和图索引偷渡进 validator。

## 3. Domain API

在 `packages/domain/src/quality-domain.ts` 中新增并从
`@ai-native-qa-workbench/domain` 公共入口导出：

```ts
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

export function validateQualityRisk(risk: QualityRisk): ValidationResult;

export function validateTestObligation(obligation: TestObligation): ValidationResult;
```

现有 `Requirement`、`AcceptanceCriterion`、`Diagnostic`、`DiagnosticCode` 和
`ValidationResult` API 保持兼容；只向 `DiagnosticCode` union 追加本阶段的六个
code，不修改已有 code 的含义、字段或顺序。

## 4. 校验规则

### 4.1 共同 ID 规则

`QualityRisk.id`、`QualityRisk.requirementId`、`TestObligation.id` 和
`TestObligation.riskId` 都必须匹配现有共享 helper 使用的：

```text
^[a-z0-9]+(?:-[a-z0-9]+)*$
```

中文、其他 Unicode 字符、空格、大写字母、下划线、点号、连续分隔符（例如 `a--b`）、
开头或结尾的分隔符，以及空字符串都返回 invalid diagnostic。validator 不 trim、
slugify 或修改 ID。

### 4.2 QualityRisk 校验

`validateQualityRisk` 按以下固定顺序追加 diagnostics：

1. `id` 不合法：`QUALITY_RISK_ID_INVALID`，path 为 `id`；
2. `requirementId` 不合法：`QUALITY_RISK_REQUIREMENT_ID_INVALID`，path 为
   `requirementId`；
3. `statement` 不是字符串或 trim 后为空：`QUALITY_RISK_STATEMENT_EMPTY`，path
   为 `statement`。

合法的 `statement` 可以是中文、标点或多行文本；首尾空白在 trim 后仍非空时合法，
并且必须原样保留。没有 diagnostics 时返回 `{ valid: true, diagnostics: [] }`。

### 4.3 TestObligation 校验

`validateTestObligation` 按以下固定顺序追加 diagnostics：

1. `id` 不合法：`TEST_OBLIGATION_ID_INVALID`，path 为 `id`；
2. `riskId` 不合法：`TEST_OBLIGATION_RISK_ID_INVALID`，path 为 `riskId`；
3. `statement` 不是字符串或 trim 后为空：`TEST_OBLIGATION_STATEMENT_EMPTY`，
   path 为 `statement`。

合法的 `statement` 可以是中文、标点或多行文本；首尾空白在 trim 后仍非空时合法，
并且必须原样保留。没有 diagnostics 时返回 `{ valid: true, diagnostics: [] }`。

### 4.4 运行时输入与不可变性

两个 validator 的 TypeScript 参数保持实体类型，但实现必须防御边界适配器传入的
不可信运行时值。对整个输入为 `undefined`、`null`、数字或字符串的情况，validator
不得抛异常，而应返回对应字段的 diagnostics。实现时分别将 candidate 归一化为：

```ts
const riskCandidate = (risk ?? {}) as Partial<QualityRisk>;
const obligationCandidate = (obligation ?? {}) as Partial<TestObligation>;
```

validator 只读输入对象，不 trim、slugify、补默认值、写文件或调用外部服务。

## 5. Diagnostic Contract

新增 `DiagnosticCode`：

```text
QUALITY_RISK_ID_INVALID
QUALITY_RISK_REQUIREMENT_ID_INVALID
QUALITY_RISK_STATEMENT_EMPTY
TEST_OBLIGATION_ID_INVALID
TEST_OBLIGATION_RISK_ID_INVALID
TEST_OBLIGATION_STATEMENT_EMPTY
```

`Diagnostic.code`、`path`、`severity`、diagnostics 顺序和 `ValidationResult.valid`
是机器可依赖字段。每个 diagnostic 的 severity 都是 `"error"`。

`Diagnostic.message` 继续使用当前英文解释，仅服务于 CLI/调试输出，不是兼容性键。
测试必须断言 code、path、severity 和顺序，不断言完整 message 文本。

## 6. 架构与实现边界

实现继续放在 `packages/domain`：

- `packages/domain/src/quality-domain.ts`：新增两个 interface 和两个 validator；
- `packages/domain/src/project.ts`：扩展 `DiagnosticCode` union；
- `packages/domain/src/index.ts`：导出新增的 public API；
- `packages/domain/src/identifiers.ts`：继续作为内部共享 ID helper，不从公共入口
  导出；
- `tests/unit/domain/quality-domain.test.ts`：追加两个实体的行为测试。

不新建 Store、CLI、UI 或 Traceability 实现，不修改 Project File Contract 的
`schemaVersion: "0.1"`，不新增任何运行时依赖。

依赖方向保持：

```text
apps/cli → packages/project-store → packages/domain
```

## 7. 测试设计

严格执行 `Contract → Behavior → RED → Minimal Implementation → GREEN →
REFACTOR → Architecture Check → Regression → Docs`：

1. 合法 QualityRisk 通过，statement 可以为空格包裹的中文多行文本并保持输入不变；
2. QualityRisk 同时包含非法 id、非法 requirementId、空 statement 时，返回三个
   固定顺序的 diagnostics；
3. 合法 TestObligation 通过，statement 可以是中文和多行文本并保持输入不变；
4. TestObligation 同时包含非法 id、非法 riskId、空 statement 时，返回三个固定
   顺序的 diagnostics；
5. 对两个实体的全部 ID 字段覆盖中文、空格、下划线、点号、连续分隔符、开头分隔符、
   结尾分隔符和空字符串；
6. 对两个实体覆盖 `undefined`、`null`、数字、字段非字符串等 malformed runtime
   input，确认不抛异常；
7. 使用格式合法但未加载的 `requirementId`/`riskId`，确认单实体 validator 不做
   存在性查询；
8. 确认 `QualityRisk`、`TestObligation` 从 public entry 导出，内部 helper 不导出；
9. 运行 Domain architecture check、typecheck、完整测试和 docs check。

## 8. UI 进入条件

本 spec 不实现 UI。第一版 UI 的进入条件是：

- Requirement、AcceptanceCriterion、QualityRisk、TestObligation 的核心 Domain
  Contract 已明确；
- Project Store 能提供稳定的只读 read model，而不是让组件直接读取 `.ai-qa/`；
- 至少具备离线的 Project Overview、Requirements、Risks 和 Test Obligations
  读取路径。

UI 第一阶段只做上述内容的只读展示和导航；Traceability 页面需要等 TraceLink
Contract 与 read model 稳定后再加入。ChangeProposal、Human Review、AI Assistant
等写入或审查交互必须在相应 Contract 稳定后单独设计。

## 9. 验收标准

只有以下条件全部满足，才认为本切片完成：

- `QualityRisk` 和 `TestObligation` 类型、validator 从 Domain public entry 导出；
- 六个 diagnostic code、path、severity 和固定顺序与本 spec 一致；
- validator 不修改输入、不做关系存在性查询，不引入基础设施依赖；
- QualityRisk 使用 `requirementId`，TestObligation 使用 `riskId`；
- 既有 Project、Requirement 和 AcceptanceCriterion 行为不回归；
- unit、typecheck、architecture、build、完整测试和 docs check 全部通过；
- 后续双语 Contract 文档明确当前实现与集合级关系、持久化、UI、AI 能力的边界；
- `git diff --check` 干净，未修改无关项目。

## 10. 两轮自 review 记录

### 第一轮：关系语义与范围

- 确认 QualityRisk 不能强制绑定单一 AcceptanceCriterion，否则无法表达跨 AC 风险；
  已选择 `requirementId` 作为风险归属。
- 确认 TestObligation 是针对风险的质量义务，已选择 `riskId` 作为显式关系。
- 确认不把通用 TraceLink、集合存在性检查或图索引提前放入单实体 validator。
- 确认 UI 进入条件单独记录，不把 UI 实现混入本 Domain 切片。

### 第二轮：对抗性输入与兼容性

- 补充两个实体的 ID 全部边界值、整对象 malformed runtime input 和输入不变性测试。
- 固定两个 validator 的字段校验顺序、诊断 code/path/severity 和 message 兼容边界。
- 明确不新增 status、riskSeverity、likelihood、priority、owner、mitigation 或
  testLevel，避免把风险管理和测试执行语义提前混入。
- 确认现有共享 ID helper、Project/Requirement/AcceptanceCriterion public API 和
  Domain 架构边界保持不变。

## 11. 本轮两轮自 review 修订记录

### 第一轮：规格覆盖

- 发现共同 ID 规则包含开头/结尾分隔符，但测试设计没有明确列出；已补充
  `-leading` 与 `trailing-` 覆盖要求。
- 确认 `QualityRisk` 不强制增加 `acceptanceCriterionId`，避免把跨 AC 风险错误地
  限制为单一 AC 关系。

### 第二轮：边界一致性

- 确认运行时 candidate 示例已使用 `Partial<QualityRisk>` 和
  `Partial<TestObligation>`，不存在未定义的泛型占位符。
- 确认风险字段 `riskSeverity` 与 diagnostic `severity` 语义已区分。
- 确认第一版 UI 只读入口不再错误依赖 TestCase/TraceLink；Traceability 页面仍
  明确等待后续 TraceLink Contract 和 read model。
