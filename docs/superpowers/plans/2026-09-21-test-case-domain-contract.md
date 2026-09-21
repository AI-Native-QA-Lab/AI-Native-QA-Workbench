# TestCase Domain Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 v0.1 MVP 中，以纯 TypeScript 和 TDD 交付 `TestCase` Domain 数据契约、确定性校验器和双语公共 Contract 文档。

**Architecture:** 保持 `apps/cli → packages/project-store → packages/domain` 依赖方向。`TestCase` 和 validator 继续放在现有 `packages/domain/src/quality-domain.ts`，复用 `isValidKebabCaseId`、`Diagnostic` 和 `ValidationResult`。本切片只建立 `TestObligation → TestCase` 的显式内存关系，不把 TestStrategy、TraceLink、Project Store、持久化、执行状态或 UI 逻辑放入单实体 validator。

**Tech Stack:** Node.js 22.22.2+、pnpm、TypeScript、Vitest、ESLint、Prettier、Turborepo；Domain 使用纯 TypeScript，测试离线执行。

**Spec:** `docs/superpowers/specs/2026-09-21-test-case-domain-contract-design.md`

**状态：** 已完成 v0.1 TestCase Domain Contract 实现、双语文档和最终验证。

## Global Constraints

- `.ai-qa/` 仍是项目质量数据 Source of Truth；本切片不写入任何 `.ai-qa/` 文件。
- `packages/domain` 不得导入 filesystem、YAML、Zod、SQLite、Provider SDK、MCP、GitHub、Jira、网络客户端或测试框架。
- 新增行为必须经过 RED → GREEN；实现完成后运行 architecture、完整测试、typecheck、build 和文档检查。
- `TestCase` 使用 `obligationId`；单实体 validator 只检查引用 ID 格式，不查询被引用实体是否存在。
- `id`、`obligationId`、`title`、`steps`、`expectedResult`、diagnostic code、path、severity、diagnostic 顺序和 `ValidationResult.valid` 是机器可依赖字段。
- `Diagnostic.message` 只保留英文解释，不在测试中锁定完整文案。
- validator 只读输入；文本字段只用 `trim()` 判定非空，不修改原始字符串；不补默认值、不写文件、不调用外部服务。
- 过程文档使用中文；英文正式 Contract 与中文镜像保持章节、字段和规则一致。
- 不修改 Project File Contract 的 `schemaVersion: "0.1"`，不实现 Store、CLI、UI、Traceability、TestStrategy、TestPlan、TestRun、Evidence、ChangeProposal、AI 或 Runtime。
- 每个完成的实现任务单独提交；只 stage 本任务列出的文件，不使用 `git add .`。

## Review Focus

- 整个输入为 `undefined`、`null`、数字或字符串，或实体字段为非字符串时，validator 必须返回字段诊断而不抛异常；由 Task 1 的 malformed runtime 表格测试固定。
- `TestCase.id` 与 `TestCase.obligationId` 必须拒绝中文、空格、大写、下划线、点号、连续分隔符、开头分隔符、结尾分隔符和空字符串；由 Task 1 的 ID 矩阵覆盖。
- 多个字段同时非法时，diagnostics 必须按 `id → obligationId → title → steps → expectedResult` 固定顺序返回，且 code、path、severity 均可断言；由 Task 1 的组合失败测试覆盖。
- 合法但尚未加载的 `obligationId` 必须通过单实体校验；由 Task 1 的孤立引用测试覆盖，并在双语 Contract 中说明集合级完整性属于后续 Store/Traceability。
- 合法的中文、多行、首尾带空白的 `title`、`steps` 和 `expectedResult` 必须通过且保持原对象不变；由 Task 1 的 structured clone 断言覆盖。

---

### Task 1：以 TDD 写 TestCase RED 测试

**Files:**

- Modify: `tests/unit/domain/quality-domain.test.ts`

**Interfaces:**

- Consumes: 尚不存在的 `TestCase` 类型和 `validateTestCase` public API；现有测试使用 Vitest 和 `@ai-native-qa-workbench/domain` 入口。
- Produces: 明确 `TestCase` 的合法行为、固定 diagnostics 顺序、malformed runtime 行为、输入不变性和 ID 边界；为 Task 2 提供精确 RED 行为。

- [x] **Step 1: 扩展 Domain public import**

在 `tests/unit/domain/quality-domain.test.ts` 的现有 import 中加入：

```ts
  validateTestCase,
  type TestCase,
```

保持既有 import 来源为 `@ai-native-qa-workbench/domain`，不从 `packages/domain/src` 私有路径导入。

- [x] **Step 2: 写合法、孤立引用和组合诊断测试**

在 `validateTestObligation` 测试之后加入以下测试块：

```ts
describe("validateTestCase", () => {
  it("accepts Chinese multiline fields and preserves the input", () => {
    const testCase: TestCase = {
      id: "login-idempotency",
      obligationId: "login-idempotency-check",
      title: "  重复提交不会创建重复订单  ",
      steps: "  1. 用户已登录\n2. 重复提交同一请求  ",
      expectedResult: "只创建一个订单并返回相同订单号",
    };
    const before = structuredClone(testCase);

    expect(validateTestCase(testCase)).toEqual({ valid: true, diagnostics: [] });
    expect(testCase).toEqual(before);
  });

  it("accepts a syntactically valid but currently unresolved obligationId", () => {
    expect(
      validateTestCase({
        id: "case-1",
        obligationId: "obligation-not-loaded",
        title: "A valid test case",
        steps: "Perform the scenario",
        expectedResult: "The expected behavior is observable",
      }),
    ).toEqual({ valid: true, diagnostics: [] });
  });

  it("reports all fields in contract order", () => {
    const result = validateTestCase({
      id: "a--b",
      obligationId: "Bad_ID",
      title: " \n\t",
      steps: "",
      expectedResult: "  \t",
    } as unknown as TestCase);

    expect(
      result.diagnostics.map(({ code, path, severity }) => ({ code, path, severity })),
    ).toEqual([
      { code: "TEST_CASE_ID_INVALID", path: "id", severity: "error" },
      {
        code: "TEST_CASE_OBLIGATION_ID_INVALID",
        path: "obligationId",
        severity: "error",
      },
      { code: "TEST_CASE_TITLE_EMPTY", path: "title", severity: "error" },
      { code: "TEST_CASE_STEPS_EMPTY", path: "steps", severity: "error" },
      {
        code: "TEST_CASE_EXPECTED_RESULT_EMPTY",
        path: "expectedResult",
        severity: "error",
      },
    ]);
  });

  it.each([undefined, null, 42, "not-an-object"])(
    "returns the five diagnostics for malformed whole input %j",
    (value) => {
      const validate = () => validateTestCase(value as unknown as TestCase);

      expect(validate).not.toThrow();
      expect(
        validate().diagnostics.map(({ code, path, severity }) => ({
          code,
          path,
          severity,
        })),
      ).toEqual([
        { code: "TEST_CASE_ID_INVALID", path: "id", severity: "error" },
        {
          code: "TEST_CASE_OBLIGATION_ID_INVALID",
          path: "obligationId",
          severity: "error",
        },
        { code: "TEST_CASE_TITLE_EMPTY", path: "title", severity: "error" },
        { code: "TEST_CASE_STEPS_EMPTY", path: "steps", severity: "error" },
        {
          code: "TEST_CASE_EXPECTED_RESULT_EMPTY",
          path: "expectedResult",
          severity: "error",
        },
      ]);
    },
  );

  it.each([
    ["id", 42, "TEST_CASE_ID_INVALID", "id"],
    ["obligationId", null, "TEST_CASE_OBLIGATION_ID_INVALID", "obligationId"],
    ["title", 42, "TEST_CASE_TITLE_EMPTY", "title"],
    ["steps", null, "TEST_CASE_STEPS_EMPTY", "steps"],
    ["expectedResult", 42, "TEST_CASE_EXPECTED_RESULT_EMPTY", "expectedResult"],
  ])("returns a diagnostic for malformed %s", (field, value, code, path) => {
    const testCase = {
      id: "case-1",
      obligationId: "obligation-1",
      title: "valid title",
      steps: "valid steps",
      expectedResult: "valid expected result",
      [field]: value,
    } as unknown as TestCase;

    expect(() => validateTestCase(testCase)).not.toThrow();
    expect(
      validateTestCase(testCase).diagnostics.map(({ code, path, severity }) => ({
        code,
        path,
        severity,
      })),
    ).toEqual([{ code, path, severity: "error" }]);
  });
});
```

- [x] **Step 3: 写 ID 边界矩阵测试**

在同一测试文件中加入以下常量和测试：

```ts
const invalidTestCaseIds = [
  "中文",
  "has space",
  "Bad_ID",
  "has.dot",
  "a--b",
  "-leading",
  "trailing-",
  "",
];

describe("TestCase identifier validation", () => {
  it.each(invalidTestCaseIds)("rejects TestCase.id %j", (id) => {
    expect(
      validateTestCase({
        id,
        obligationId: "obligation-1",
        title: "valid",
        steps: "valid",
        expectedResult: "valid",
      }).diagnostics,
    ).toContainEqual({
      code: "TEST_CASE_ID_INVALID",
      message: expect.any(String),
      path: "id",
      severity: "error",
    });
  });

  it.each(invalidTestCaseIds)("rejects TestCase.obligationId %j", (obligationId) => {
    expect(
      validateTestCase({
        id: "case-1",
        obligationId,
        title: "valid",
        steps: "valid",
        expectedResult: "valid",
      }).diagnostics,
    ).toContainEqual({
      code: "TEST_CASE_OBLIGATION_ID_INVALID",
      message: expect.any(String),
      path: "obligationId",
      severity: "error",
    });
  });
});
```

- [x] **Step 4: 运行 TestCase RED 测试**

Run:

```bash
pnpm exec vitest run tests/unit/domain/quality-domain.test.ts
```

Expected: RED。失败原因应是 `TestCase` 类型、`validateTestCase` 或五个 diagnostic
code 尚未从 Domain public entry 提供，而不是测试语法错误、选择器错误或既有
Requirement/AcceptanceCriterion/QualityRisk/TestObligation 回归。

- [x] **Step 5: 提交 RED 测试**

只暂存测试文件并提交：

```bash
git add tests/unit/domain/quality-domain.test.ts
git commit -m "test: define test case domain behavior"
```

### Task 2：以最小实现通过 TestCase Domain Contract

**Files:**

- Modify: `packages/domain/src/project.ts`
- Modify: `packages/domain/src/quality-domain.ts`
- Verify only: `packages/domain/src/index.ts`

**Interfaces:**

- Consumes: Task 1 的 failing tests、`isValidKebabCaseId`、现有 `diagnostic` helper、`Diagnostic` 和 `ValidationResult`。
- Produces: `TestCase`、`validateTestCase`，以及五个 `TestCase` diagnostic code；现有 wildcard public export 继续对外暴露它们。

- [x] **Step 1: 增加五个 DiagnosticCode**

在 `packages/domain/src/project.ts` 现有 `TEST_OBLIGATION_*` code 后追加：

```ts
  | "TEST_CASE_ID_INVALID"
  | "TEST_CASE_OBLIGATION_ID_INVALID"
  | "TEST_CASE_TITLE_EMPTY"
  | "TEST_CASE_STEPS_EMPTY"
  | "TEST_CASE_EXPECTED_RESULT_EMPTY";
```

不重排、不改名、不删除已有 DiagnosticCode。

- [x] **Step 2: 增加 TestCase 类型**

在 `packages/domain/src/quality-domain.ts` 的 `TestObligation` interface 后追加：

```ts
export interface TestCase {
  id: string;
  obligationId: string;
  title: string;
  steps: string;
  expectedResult: string;
}
```

- [x] **Step 3: 增加最小 validator**

在 `validateTestObligation` 后追加以下实现，复用现有 helper，不创建新的抽象层：

```ts
export function validateTestCase(testCase: TestCase): ValidationResult {
  const candidate = (testCase ?? {}) as Partial<TestCase>;
  const diagnostics: Diagnostic[] = [];

  if (!isValidKebabCaseId(candidate.id)) {
    diagnostics.push(diagnostic("TEST_CASE_ID_INVALID", "id", "Test case id is invalid."));
  }

  if (!isValidKebabCaseId(candidate.obligationId)) {
    diagnostics.push(
      diagnostic(
        "TEST_CASE_OBLIGATION_ID_INVALID",
        "obligationId",
        "Test case obligationId is invalid.",
      ),
    );
  }

  if (typeof candidate.title !== "string" || candidate.title.trim().length === 0) {
    diagnostics.push(
      diagnostic("TEST_CASE_TITLE_EMPTY", "title", "Test case title must not be empty."),
    );
  }

  if (typeof candidate.steps !== "string" || candidate.steps.trim().length === 0) {
    diagnostics.push(
      diagnostic("TEST_CASE_STEPS_EMPTY", "steps", "Test case steps must not be empty."),
    );
  }

  if (
    typeof candidate.expectedResult !== "string" ||
    candidate.expectedResult.trim().length === 0
  ) {
    diagnostics.push(
      diagnostic(
        "TEST_CASE_EXPECTED_RESULT_EMPTY",
        "expectedResult",
        "Test case expectedResult must not be empty.",
      ),
    );
  }

  return {
    valid: diagnostics.length === 0,
    diagnostics,
  };
}
```

- [x] **Step 4: 确认 public entry 不需要额外导出语句**

确认 `packages/domain/src/index.ts` 保持：

```ts
export * from "./project.js";
export * from "./quality-domain.js";
```

不要增加从内部文件的重复 named export。

- [x] **Step 5: 运行 targeted GREEN 和类型检查**

Run:

```bash
pnpm exec vitest run tests/unit/domain/quality-domain.test.ts
pnpm typecheck
```

Expected: TestCase 测试和既有 Quality Domain 测试全部 PASS；TypeScript 编译通过；validator 不引入基础设施依赖。

- [x] **Step 6: 提交最小实现**

只暂存本任务列出的三个源文件并提交：

```bash
git add packages/domain/src/project.ts packages/domain/src/quality-domain.ts
git commit -m "feat: add test case domain contract"
```

如果 `packages/domain/src/index.ts` 没有实际 diff，不要为了制造 diff 修改它；提交命令可只包含两个实际修改文件。

### Task 3：同步双语 Contract、变更记录和索引

**Files:**

- Modify: `docs/en/contracts/QUALITY_DOMAIN_CONTRACT.md`
- Modify: `docs/zh-CN/contracts/QUALITY_DOMAIN_CONTRACT.md`
- Modify: `CHANGELOG.md`
- Modify: `FILE_INDEX.md`

**Interfaces:**

- Consumes: Task 2 已实现的 `TestCase` public type、`validateTestCase` 和五个 diagnostic code。
- Produces: 与实现一致的英文 canonical Contract、中文镜像、Unreleased 变更记录和实施计划索引。

- [x] **Step 1: 扩展英文 Quality Domain Contract**

在 `docs/en/contracts/QUALITY_DOMAIN_CONTRACT.md` 中完成以下确定性修改：

1. 将开头的实体范围扩展为 requirements、acceptance criteria、quality risks、test obligations 和 test cases。
2. 在 Public Types 代码块追加：

   ```ts
   export interface TestCase {
     id: string;
     obligationId: string;
     title: string;
     steps: string;
     expectedResult: string;
   }
   ```

3. 在 Validation API 追加：

   ```ts
   export function validateTestCase(testCase: TestCase): ValidationResult;
   ```

4. 在 Identifier Rules 追加 `TestCase.id` 和 `TestCase.obligationId`。
5. 新增 TestCase Validation 小节，明确 `obligationId` 只检查 ID 语法，validator 不解析实体存在性；按 `id → obligationId → title → steps → expectedResult` 列出五行表格：

   | Order | Code                              | Path             | Rule                                                                |
   | ----- | --------------------------------- | ---------------- | ------------------------------------------------------------------- |
   | 1     | `TEST_CASE_ID_INVALID`            | `id`             | `id` must match the identifier rule.                                |
   | 2     | `TEST_CASE_OBLIGATION_ID_INVALID` | `obligationId`   | `obligationId` must match the identifier rule.                      |
   | 3     | `TEST_CASE_TITLE_EMPTY`           | `title`          | `title` must be a string whose trimmed value is not empty.          |
   | 4     | `TEST_CASE_STEPS_EMPTY`           | `steps`          | `steps` must be a string whose trimmed value is not empty.          |
   | 5     | `TEST_CASE_EXPECTED_RESULT_EMPTY` | `expectedResult` | `expectedResult` must be a string whose trimmed value is not empty. |

6. Diagnostics 部分在现有六个 QualityRisk/TestObligation code 后加入五个 TestCase code，形成十一个 QualityRisk/TestObligation/TestCase code，并加入五行 code/path/meaning 表。
7. Immutability 改为覆盖五个 validator；Relationship Boundary 增加 TestCase 只校验 `obligationId` 语法的说明。
8. Out of Scope 明确不定义 TestCase 的 `status`、`priority`、`kind`、`automationRef`、执行目标、运行结果、步骤数组、参数化和断言 DSL。

- [x] **Step 2: 同步中文 Quality Domain Contract**

在 `docs/zh-CN/contracts/QUALITY_DOMAIN_CONTRACT.md` 保持与英文章节、字段和表格顺序一致：

- Public Types 增加同样的 `TestCase` interface；
- Validation API 增加 `validateTestCase`；
- 标识符规则增加 `TestCase.id` 和 `TestCase.obligationId`；
- 增加 TestCase 校验表，固定顺序和五个 code 与英文一致；
- Diagnostics 增加五个 code 的中文含义，QualityRisk/TestObligation/TestCase 三类合计十一个 code；
- 不可变性、关系边界和当前范围之外同步记录 TestCase 边界。

- [x] **Step 3: 更新 Unreleased 和 FILE_INDEX**

在 `CHANGELOG.md` 的 `## [Unreleased]` 下追加：

```md
- Added the TestCase domain contract with deterministic validation diagnostics and bilingual contract documentation.
```

在 `FILE_INDEX.md` 的 Process documents 区块追加：

```md
- `docs/superpowers/plans/2026-09-21-test-case-domain-contract.md`
```

保留 `FILE_INDEX.md` 现有列表缩进格式，不运行会重写整文件的 Markdown formatter。

- [x] **Step 4: 运行文档验证并提交**

Run:

```bash
pnpm exec prettier --check docs/en/contracts/QUALITY_DOMAIN_CONTRACT.md docs/zh-CN/contracts/QUALITY_DOMAIN_CONTRACT.md CHANGELOG.md docs/superpowers/plans/2026-09-21-test-case-domain-contract.md
pnpm check:docs
git diff --check
```

Expected: 英文和中文 Contract 结构、字段、code 和边界一致；文档检查通过；没有 whitespace error。

提交：

```bash
git add docs/en/contracts/QUALITY_DOMAIN_CONTRACT.md docs/zh-CN/contracts/QUALITY_DOMAIN_CONTRACT.md CHANGELOG.md FILE_INDEX.md
git commit -m "docs: document test case domain contract"
```

### Task 4：完整回归、更新实施记录并交付

**Files:**

- Modify: `docs/superpowers/specs/2026-09-21-test-case-domain-contract-design.md`
- Modify: `docs/superpowers/plans/2026-09-21-test-case-domain-contract.md`

**Interfaces:**

- Consumes: Tasks 1–3 的实现、测试、双语 Contract 和验证输出。
- Produces: 已勾选的实施记录、完成状态、最终验证证据和干净工作区。

- [x] **Step 1: 运行完整质量门禁**

Run:

```bash
pnpm check
git diff --check
git status --short --branch
```

Expected：Prettier、ESLint、TypeScript、三包 build、全量 Vitest、architecture test 和 docs check 全部通过；`git diff --check` 无输出；工作区只包含本切片待记录的变更。

- [x] **Step 2: 更新 spec 完成状态**

将 spec 顶部状态替换为：

```md
**状态：** 方案 A 已获确认；已完成两轮 spec review、TDD 实现和最终验证；TestCase Domain Contract 已完成 v0.1 交付。
```

保留 spec 中的两轮自 review 记录，并在验收标准中确认五个 diagnostic code、双语文档和全量质量门禁均已满足。

- [x] **Step 3: 更新 plan 执行记录**

将本计划所有已完成步骤的 `- [ ]` 改为 `- [x]`，在顶部追加：

```md
**状态：** 已完成 v0.1 TestCase Domain Contract 实现、双语文档和最终验证。
```

在文档末尾追加最终结果：

```md
## 最终验证记录

- TestCase public type、validator 和五个 diagnostics 已交付。
- TestCase validator 保持纯函数、输入不变，并只检查 `obligationId` 的 ID 语法。
- targeted Domain test、typecheck、build、完整 test、architecture check 和 docs check 已通过。
- 没有实现 TestStrategy、TraceLink、Store、UI、执行状态或 Evidence。
```

- [x] **Step 4: 提交实施记录**

只暂存两个过程文档并提交：

```bash
git add docs/superpowers/specs/2026-09-21-test-case-domain-contract-design.md docs/superpowers/plans/2026-09-21-test-case-domain-contract.md
git commit -m "docs: finalize test case implementation record"
```

- [x] **Step 5: 提交后核验**

Run:

```bash
git status --short --branch
git log -5 --oneline
git show --stat --oneline HEAD
```

Expected：工作区干净；最终提交只包含 TestCase Domain Contract 实现记录；向用户报告实现范围、验证命令和未实现的后续边界，不把静态/单元验证表述为真实模型、浏览器或生产运行证据。

## Plan Self-Review

### Spec coverage

- `TestCase` 五字段、`obligationId` 关系和不复制上游文本：Task 1、Task 2、Task 3。
- 五个 diagnostic code、固定顺序、path、severity 和 runtime malformed 行为：Task 1、Task 2、Task 3。
- ID 边界、中文多行文本、首尾空白和输入不变性：Task 1。
- 不检查引用存在性、不实现 TestStrategy/TraceLink/Store/UI：Global Constraints、Task 2、Task 3、Task 4。
- 英文 canonical Contract、中文镜像、CHANGELOG、FILE_INDEX 和最终状态：Task 3、Task 4。

### Placeholder scan

本计划没有未定义占位符、空泛的“补充错误处理”或未定义的函数名；每个代码行为都有明确文件、签名、测试或命令。

### Type consistency

- Task 1 的 `TestCase` 字段与 Task 2 的 interface 完全一致：`id`、`obligationId`、`title`、`steps`、`expectedResult`。
- Task 1 的五个 code/path 与 Task 2 的 `DiagnosticCode` 和 validator 实现完全一致。
- Task 2 保持 `packages/domain/src/index.ts` 的 wildcard export，Task 3 文档引用同一 public API。

### Review Focus coverage

Review Focus 的五类输入均由 Task 1 的合法、组合失败、malformed runtime、ID 矩阵、孤立引用和 structured clone 测试覆盖；Task 2 只实现这些已固定行为，不扩展输入语义。

## 最终验证记录

- TestCase public type、validator 和五个 diagnostics 已交付。
- TestCase validator 保持纯函数、输入不变，并只检查 `obligationId` 的 ID 语法。
- targeted Domain test、typecheck、build、完整 test、architecture check 和 docs check 已通过。
- 没有实现 TestStrategy、TraceLink、Store、UI、执行状态或 Evidence。
