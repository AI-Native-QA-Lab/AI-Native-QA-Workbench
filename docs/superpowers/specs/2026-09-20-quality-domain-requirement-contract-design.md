# Requirement 与 AcceptanceCriterion Domain 契约设计

**状态：** 已获范围确认，等待书面 spec review；尚未开始实现。

## 1. 目标与当前理解

本阶段继续完成 v0.1 MVP 的下一个最小 Domain 切片：在已经存在的
`Project` contract 之上，建立 `Requirement` 与 `AcceptanceCriterion` 两个
纯 TypeScript 值对象及其确定性校验。

本阶段的成功标准是：未来 Project Store 可以在不依赖 SQLite、UI、Provider 或
AI Runtime 的情况下表达一条可追踪的需求及其验收标准，并能对不合法输入返回
稳定 diagnostics。当前不实现文件持久化、CLI 命令、TraceLink 或 AI 生成流程。

### 已确认的约束

- `.ai-qa/` 仍然是项目质量数据的 Source of Truth；本阶段不写入它。
- `packages/domain` 必须保持纯 TypeScript，不引入 filesystem、YAML、Zod、
  SQLite、Provider、MCP、GitHub、Jira 或测试框架。
- 所有行为先写 RED 测试，再实现最小 GREEN，并运行 architecture check 和完整
  回归。
- 过程文档使用中文；英文正式 contract 文档与中文镜像保持结构一致。
- 不修改 Project File Contract 的 `schemaVersion: "0.1"`；本阶段新增的是
  Domain API，不是项目文件 schema migration。

## 2. 设计决策与范围边界

### 2.1 只建立两个实体

第一版只加入以下两个实体：

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

`AcceptanceCriterion` 使用 `requirementId` 建立指向 Requirement 的显式关系，
而不是把验收标准嵌套在 `Requirement` 中。这样后续可以独立审查、排序和建立
TraceLink，也不会同时维护嵌套副本和独立记录。

### 2.2 有意不加入的字段

本阶段不加入 `status`、`priority`、`owner`、`labels`、`locale`、
`schemaVersion`、时间戳或 AI 元数据：

- workflow 状态必须先由 QA Task/ChangeProposal 契约定义，不能在本切片猜测；
- `locale` 是用户界面或输出偏好，不是 Domain machine value；
- 当前实体尚未拥有独立持久化文件，添加实体级 `schemaVersion` 会制造未定义的
  migration contract；
- priority、owner、labels 和时间戳会扩大需求管理语义，但不是当前垂直切片的
  必要条件。

### 2.3 不做关系存在性校验

`validateAcceptanceCriterion` 只检查 `requirementId` 的标识符格式，不检查某个
Requirement 是否已存在。单实体 validator 没有项目集合上下文，不能可靠地判断
引用是否存在；集合级完整性检查留给后续 Project Store/Traceability contract。

## 3. Domain API

在 `packages/domain/src/quality-domain.ts` 中导出：

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

export function validateRequirement(
  requirement: Requirement,
): ValidationResult;

export function validateAcceptanceCriterion(
  criterion: AcceptanceCriterion,
): ValidationResult;
```

两个 validator 复用现有的 `Diagnostic`、`DiagnosticCode` 和
`ValidationResult`，保持 Domain 校验结果的调用方式一致。新增 diagnostic code
为：

```ts
"REQUIREMENT_ID_INVALID"
"REQUIREMENT_TITLE_EMPTY"
"REQUIREMENT_DESCRIPTION_INVALID"
"ACCEPTANCE_CRITERION_ID_INVALID"
"ACCEPTANCE_CRITERION_REQUIREMENT_ID_INVALID"
"ACCEPTANCE_CRITERION_STATEMENT_EMPTY"
```

### 3.1 共同 ID 规则

`Requirement.id`、`AcceptanceCriterion.id` 和
`AcceptanceCriterion.requirementId` 都必须匹配：

```text
^[a-z0-9]+(?:-[a-z0-9]+)*$
```

这是项目内稳定引用的 machine identifier；中文、空格、大写字母、下划线、点号
和空字符串都返回对应的 invalid diagnostic。该规则与现有 Project ID contract
一致，但本阶段不自动改写用户输入。

### 3.2 Requirement 校验顺序

`validateRequirement` 按以下固定顺序追加 diagnostics：

1. `id` 不是合法 kebab-case 时返回 `REQUIREMENT_ID_INVALID`，path 为 `id`；
2. `title` 不是非空字符串时返回 `REQUIREMENT_TITLE_EMPTY`，path 为 `title`；
3. `description` 不是字符串时返回 `REQUIREMENT_DESCRIPTION_INVALID`，path 为
   `description`；
4. 没有 diagnostics 时返回 `{ valid: true, diagnostics: [] }`。

description 可以是空字符串；title 只允许首尾空白，但不自动 trim 或修改实体。

### 3.3 AcceptanceCriterion 校验顺序

`validateAcceptanceCriterion` 按以下固定顺序追加 diagnostics：

1. `id` 不合法时返回 `ACCEPTANCE_CRITERION_ID_INVALID`，path 为 `id`；
2. `requirementId` 不合法时返回
   `ACCEPTANCE_CRITERION_REQUIREMENT_ID_INVALID`，path 为 `requirementId`；
3. `statement` 不是非空字符串时返回
   `ACCEPTANCE_CRITERION_STATEMENT_EMPTY`，path 为 `statement`；
4. 没有 diagnostics 时返回 `{ valid: true, diagnostics: [] }`。

statement 可以包含中文、标点和多行文本；只拒绝空字符串或全是空白的字符串。

## 4. 架构与实现边界

依赖方向保持：

```text
apps/cli → packages/project-store → packages/domain
```

本阶段只修改 `packages/domain` 及其 unit tests。实现不得把公共 validator 放入
Project Store，也不得在 Domain 中读取 `.ai-qa/` 或调用任何外部服务。

新增文件：

- `packages/domain/src/quality-domain.ts`：实体类型、diagnostic code 和两个
  validator；
- `tests/unit/domain/quality-domain.test.ts`：Requirement/AcceptanceCriterion
  的行为 contract。

修改文件：

- `packages/domain/src/project.ts`：扩展共享 `DiagnosticCode`；
- `packages/domain/src/index.ts`：导出新的 Domain contract；
- `docs/en/contracts/CORE_CONTRACT_INDEX.md` 和
  `docs/zh-CN/contracts/CORE_CONTRACT_INDEX.md`：链接到新增的双语 contract
  文档；
- `docs/en/contracts/QUALITY_DOMAIN_CONTRACT.md` 和
  `docs/zh-CN/contracts/QUALITY_DOMAIN_CONTRACT.md`：记录稳定字段、校验和当前
  明确不包含的语义；
- `FILE_INDEX.md`、`CHANGELOG.md`：记录新 contract。

## 5. 测试设计

测试必须覆盖真实纯函数行为，而不是 mock：

1. 合法 Requirement 通过，description 为空仍有效；
2. Requirement 同时包含非法 ID、空 title、非字符串 description 时，返回固定
   顺序的三个 diagnostics；
3. 合法 AcceptanceCriterion 通过，statement 可以是中文和多行文本；
4. AcceptanceCriterion 的 id、requirementId、statement 分别覆盖非法值；
5. 全是中文、空格、下划线或点号的 ID 被拒绝；
6. `packages/domain` architecture boundary 继续通过，不出现 forbidden import。

每个新增行为都必须观察到 RED，再实现 GREEN；最终运行：

```bash
pnpm exec vitest run tests/unit/domain/quality-domain.test.ts
pnpm typecheck
pnpm check:architecture
pnpm test
pnpm check:docs
```

## 6. 验收标准

只有以下条件全部满足，才认为本切片完成：

- `Requirement` 和 `AcceptanceCriterion` 类型从 Domain package 公共入口导出；
- 所有 diagnostic code、path 和顺序与本 spec 一致；
- validator 不修改输入对象，不做 trim、slugify 或隐式关系查询；
- Domain 无新增基础设施或 Provider 依赖；
- unit、typecheck、architecture、完整测试和文档检查通过；
- 英文/中文 contract 文档明确区分当前实现和后续关系完整性、持久化、AI
  Workflow 能力；
- `git diff --check` 干净，未修改无关项目。

## 7. 后续迁移方向

后续 Project Store 可以将 Requirement 和 AcceptanceCriterion 持久化到 `.ai-qa/`
中的 Markdown/YAML/JSON 文件，但必须另写文件 contract 和 migration 设计；
不能因为本阶段已有 TypeScript interface 就直接定义磁盘格式。

后续 Traceability contract 可以在集合上下文中检查
`AcceptanceCriterion.requirementId` 是否存在，并建立可重建的图索引；这不属于
本阶段的 validator 行为。
