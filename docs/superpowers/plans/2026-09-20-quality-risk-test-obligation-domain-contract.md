# QualityRisk 与 TestObligation Domain Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 v0.1 MVP 中，以纯 TypeScript 和 TDD 交付 `QualityRisk` 与
`TestObligation` 两个 Quality Domain 数据契约、确定性校验器和双语公共 Contract
文档。

**Architecture:** 保持 `apps/cli → packages/project-store → packages/domain`
依赖方向。两个实体和 validator 继续放在 `packages/domain`；复用内部
`isValidKebabCaseId`，不把集合存在性、TraceLink、持久化或 UI 逻辑放入单实体
validator。本次实现只扩展现有 Quality Domain 文件和单元测试，并更新双语 Contract
与项目索引。

**Tech Stack:** Node.js 22.22.2+、pnpm、TypeScript、Vitest、ESLint、Prettier、Turborepo；
Domain 使用纯 TypeScript，测试离线执行。

**Spec:** `docs/superpowers/specs/2026-09-20-quality-risk-test-obligation-domain-contract-design.md`

## Global Constraints

- `.ai-qa/` 仍是项目质量数据 Source of Truth；本切片不写入任何 `.ai-qa/` 文件。
- `packages/domain` 不得导入 filesystem、YAML、Zod、SQLite、Provider SDK、MCP、
  GitHub、Jira、测试框架或网络客户端。
- 所有新增行为必须经过 RED → GREEN；实现完成后运行 architecture、完整测试、
  typecheck、build 和文档检查。
- `QualityRisk` 使用 `requirementId`；`TestObligation` 使用 `riskId`；单实体
  validator 只检查引用 ID 格式，不查询被引用实体是否存在。
- machine fields 是字段名、diagnostic code、path、severity、diagnostic 顺序和
  `ValidationResult.valid`；`Diagnostic.message` 只保留英文解释，不在测试中锁定
  完整文案。
- validator 只读输入；`statement` 只用 `trim()` 判定非空，不修改原始字符串；不
  trim、slugify、补默认值、写文件或调用外部服务。
- 过程文档使用中文；英文正式 Contract 与中文镜像保持章节、字段和规则一致。
- 不修改 Project File Contract 的 `schemaVersion: "0.1"`，不实现 Store、CLI、UI、
  Traceability、ChangeProposal、AI 或 Runtime。
- 每个完成的实现任务单独提交；只 stage 本任务列出的文件，不使用 `git add .`。

## Review Focus

- 整个输入为 `undefined`、`null`、数字或字符串，或实体字段为非字符串时，validator
  必须返回字段诊断而不抛异常；由 Task 1 和 Task 2 的 malformed runtime 表格测试固定。
- `QualityRisk` 的 `id`/`requirementId` 与 `TestObligation` 的 `id`/`riskId` 必须
  拒绝中文、空格、大写、下划线、点号、连续分隔符、开头分隔符、结尾分隔符和空
  字符串；由两个任务的 ID 矩阵覆盖。
- 多个字段同时非法时，diagnostics 必须按 `id → relationId → statement` 固定顺序
  返回，且 code、path、severity 均可断言；由两个任务的组合失败测试覆盖。
- 合法但尚未加载的 `requirementId`/`riskId` 必须通过单实体校验；由两个任务的孤立
  引用测试覆盖，并在双语 Contract 中说明集合级完整性属于后续 Store/Traceability。
- 合法的中文、多行、首尾带空白的 `statement` 必须通过且保持原对象不变；由两个
  任务的 structured clone 断言覆盖。

---

### Task 1：以 TDD 实现 QualityRisk Domain Contract

**Files:**

- Modify: `tests/unit/domain/quality-domain.test.ts`
- Modify: `packages/domain/src/project.ts`
- Modify: `packages/domain/src/quality-domain.ts`

**Interfaces:**

- Consumes: `isValidKebabCaseId`、现有 `Diagnostic` 和 `ValidationResult`。
- Produces: `QualityRisk`、`validateQualityRisk`，以及三个
  `QualityRisk` diagnostic code，并从现有 public entry 间接导出。

- [x] **Step 1: 写 QualityRisk RED 测试**

  在现有 `quality-domain.test.ts` 的导入中增加：

  ```ts
  validateQualityRisk,
  type QualityRisk,
  ```

  增加以下行为测试，测试必须从 `@ai-native-qa-workbench/domain` 导入 public API：

  ```ts
  describe("validateQualityRisk", () => {
    it("accepts Chinese multiline statements and preserves the input", () => {
      const risk: QualityRisk = {
        id: "login-risk",
        requirementId: "login",
        statement: "  用户可能在重复提交时看到不一致状态\n需要验证幂等行为  ",
      };
      const before = structuredClone(risk);

      expect(validateQualityRisk(risk)).toEqual({ valid: true, diagnostics: [] });
      expect(risk).toEqual(before);
    });

    it("accepts a syntactically valid but currently unresolved requirementId", () => {
      expect(
        validateQualityRisk({
          id: "risk-1",
          requirementId: "requirement-not-loaded",
          statement: "A valid risk statement",
        }),
      ).toEqual({ valid: true, diagnostics: [] });
    });

    it("reports id, requirementId, and statement in contract order", () => {
      const result = validateQualityRisk({
        id: "a--b",
        requirementId: "Bad_ID",
        statement: " \n\t",
      } as unknown as QualityRisk);

      expect(
        result.diagnostics.map(({ code, path, severity }) => ({ code, path, severity })),
      ).toEqual([
        { code: "QUALITY_RISK_ID_INVALID", path: "id", severity: "error" },
        {
          code: "QUALITY_RISK_REQUIREMENT_ID_INVALID",
          path: "requirementId",
          severity: "error",
        },
        { code: "QUALITY_RISK_STATEMENT_EMPTY", path: "statement", severity: "error" },
      ]);
    });

    it.each([undefined, null, 42, "not-an-object"])(
      "returns diagnostics for malformed whole input %j",
      (value) => {
        const validate = () => validateQualityRisk(value as unknown as QualityRisk);

        expect(validate).not.toThrow();
        expect(validate().valid).toBe(false);
      },
    );

    it.each([
      ["id", 42],
      ["requirementId", null],
      ["statement", 42],
    ])("returns a diagnostic for malformed %s", (field, value) => {
      const risk = {
        id: "risk-1",
        requirementId: "login",
        statement: "valid",
        [field]: value,
      } as unknown as QualityRisk;

      expect(() => validateQualityRisk(risk)).not.toThrow();
      expect(validateQualityRisk(risk).valid).toBe(false);
    });
  });

  const invalidQualityRiskIds = [
    "中文",
    "has space",
    "Bad_ID",
    "has.dot",
    "a--b",
    "-leading",
    "trailing-",
    "",
  ];

  describe("QualityRisk identifier validation", () => {
    it.each(invalidQualityRiskIds)("rejects QualityRisk.id %j", (id) => {
      expect(
        validateQualityRisk({ id, requirementId: "login", statement: "valid" }).diagnostics,
      ).toContainEqual({
        code: "QUALITY_RISK_ID_INVALID",
        message: expect.any(String),
        path: "id",
        severity: "error",
      });
    });

    it.each(invalidQualityRiskIds)("rejects QualityRisk.requirementId %j", (requirementId) => {
      expect(
        validateQualityRisk({ id: "risk-1", requirementId, statement: "valid" }).diagnostics,
      ).toContainEqual({
        code: "QUALITY_RISK_REQUIREMENT_ID_INVALID",
        message: expect.any(String),
        path: "requirementId",
        severity: "error",
      });
    });
  });
  ```

  Run:

  ```bash
  pnpm exec vitest run tests/unit/domain/quality-domain.test.ts
  ```

  Expected: RED，测试因 `validateQualityRisk` 和 `QualityRisk` 尚未从 Domain public
  entry 导出而失败；不得修改测试来绕过该失败。

- [x] **Step 2: 验证 RED 原因正确**

  Run:

  ```bash
  pnpm exec vitest run tests/unit/domain/quality-domain.test.ts 2>&1 | tail -40
  ```

  Expected: 失败原因是缺少 QualityRisk public API 或对应实现，而不是语法错误、
  测试选择器错误或既有 Requirement/AcceptanceCriterion 回归。若输出暴露测试本身
  的错误，先修复测试并重新观察预期 RED。

- [x] **Step 3: 写最小 QualityRisk 实现**

  在 `packages/domain/src/project.ts` 的 `DiagnosticCode` union 末尾追加：

  ```ts
  | "QUALITY_RISK_ID_INVALID"
  | "QUALITY_RISK_REQUIREMENT_ID_INVALID"
  | "QUALITY_RISK_STATEMENT_EMPTY"
  ```

  在 `packages/domain/src/quality-domain.ts` 中追加类型和 validator，继续复用
  现有 `diagnostic` 和 `isValidKebabCaseId`：

  ```ts
  export interface QualityRisk {
    id: string;
    requirementId: string;
    statement: string;
  }

  export function validateQualityRisk(risk: QualityRisk): ValidationResult {
    const candidate = (risk ?? {}) as Partial<QualityRisk>;
    const diagnostics: Diagnostic[] = [];

    if (!isValidKebabCaseId(candidate.id)) {
      diagnostics.push(diagnostic("QUALITY_RISK_ID_INVALID", "id", "Quality risk id is invalid."));
    }

    if (!isValidKebabCaseId(candidate.requirementId)) {
      diagnostics.push(
        diagnostic(
          "QUALITY_RISK_REQUIREMENT_ID_INVALID",
          "requirementId",
          "Quality risk requirementId is invalid.",
        ),
      );
    }

    if (typeof candidate.statement !== "string" || candidate.statement.trim().length === 0) {
      diagnostics.push(
        diagnostic(
          "QUALITY_RISK_STATEMENT_EMPTY",
          "statement",
          "Quality risk statement must not be empty.",
        ),
      );
    }

    return { valid: diagnostics.length === 0, diagnostics };
  }
  ```

  不修改 `packages/domain/src/index.ts` 的现有 `export * from "./quality-domain.js"`；
  该公共入口已经覆盖新增 API，任务 2 会用 public import 再次验证。

- [x] **Step 4: 运行 QualityRisk GREEN 与既有 Domain 回归**

  Run:

  ```bash
  pnpm exec vitest run tests/unit/domain/quality-domain.test.ts tests/unit/domain/project.test.ts tests/unit/domain/identifiers.test.ts
  ```

  Expected: GREEN；QualityRisk 新测试和既有 Project、Requirement、AcceptanceCriterion
  测试全部通过，且 diagnostics 的 code/path/severity/order 与测试一致。

- [x] **Step 5: 检查并提交 Task 1**

  Run:

  ```bash
  git diff --check
  ```

  Expected: 无空白错误；只包含本任务列出的三个文件。

  ```bash
  git add packages/domain/src/project.ts packages/domain/src/quality-domain.ts tests/unit/domain/quality-domain.test.ts
  git commit -m "feat: add quality risk domain contract"
  ```

### Task 2：以 TDD 实现 TestObligation Domain Contract

**Files:**

- Modify: `tests/unit/domain/quality-domain.test.ts`
- Modify: `packages/domain/src/project.ts`
- Modify: `packages/domain/src/quality-domain.ts`
- Verify: `packages/domain/src/index.ts`

**Interfaces:**

- Consumes: Task 1 的 `QualityRisk`、`validateQualityRisk`、诊断 helper 和已有
  public entry。
- Produces: `TestObligation`、`validateTestObligation`，以及三个
  `TestObligation` diagnostic code。

- [x] **Step 1: 写 TestObligation RED 测试**

  在现有 Domain 测试导入中增加：

  ```ts
  validateTestObligation,
  type TestObligation,
  ```

  增加以下行为测试：

  ```ts
  describe("validateTestObligation", () => {
    it("accepts Chinese multiline statements and preserves the input", () => {
      const obligation: TestObligation = {
        id: "login-idempotency-check",
        riskId: "login-risk",
        statement: "验证重复提交不会创建重复订单\n验证失败时有可观察证据",
      };
      const before = structuredClone(obligation);

      expect(validateTestObligation(obligation)).toEqual({ valid: true, diagnostics: [] });
      expect(obligation).toEqual(before);
    });

    it("accepts a syntactically valid but currently unresolved riskId", () => {
      expect(
        validateTestObligation({
          id: "obligation-1",
          riskId: "risk-not-loaded",
          statement: "A valid obligation statement",
        }),
      ).toEqual({ valid: true, diagnostics: [] });
    });

    it("reports id, riskId, and statement in contract order", () => {
      const result = validateTestObligation({
        id: "a--b",
        riskId: "Bad_ID",
        statement: " \n\t",
      } as unknown as TestObligation);

      expect(
        result.diagnostics.map(({ code, path, severity }) => ({ code, path, severity })),
      ).toEqual([
        { code: "TEST_OBLIGATION_ID_INVALID", path: "id", severity: "error" },
        { code: "TEST_OBLIGATION_RISK_ID_INVALID", path: "riskId", severity: "error" },
        {
          code: "TEST_OBLIGATION_STATEMENT_EMPTY",
          path: "statement",
          severity: "error",
        },
      ]);
    });

    it.each([undefined, null, 42, "not-an-object"])(
      "returns diagnostics for malformed whole input %j",
      (value) => {
        const validate = () => validateTestObligation(value as unknown as TestObligation);

        expect(validate).not.toThrow();
        expect(validate().valid).toBe(false);
      },
    );

    it.each([
      ["id", 42],
      ["riskId", null],
      ["statement", 42],
    ])("returns a diagnostic for malformed %s", (field, value) => {
      const obligation = {
        id: "obligation-1",
        riskId: "login-risk",
        statement: "valid",
        [field]: value,
      } as unknown as TestObligation;

      expect(() => validateTestObligation(obligation)).not.toThrow();
      expect(validateTestObligation(obligation).valid).toBe(false);
    });
  });

  const invalidTestObligationIds = [
    "中文",
    "has space",
    "Bad_ID",
    "has.dot",
    "a--b",
    "-leading",
    "trailing-",
    "",
  ];

  describe("TestObligation identifier validation", () => {
    it.each(invalidTestObligationIds)("rejects TestObligation.id %j", (id) => {
      expect(
        validateTestObligation({ id, riskId: "login-risk", statement: "valid" }).diagnostics,
      ).toContainEqual({
        code: "TEST_OBLIGATION_ID_INVALID",
        message: expect.any(String),
        path: "id",
        severity: "error",
      });
    });

    it.each(invalidTestObligationIds)("rejects TestObligation.riskId %j", (riskId) => {
      expect(
        validateTestObligation({ id: "obligation-1", riskId, statement: "valid" }).diagnostics,
      ).toContainEqual({
        code: "TEST_OBLIGATION_RISK_ID_INVALID",
        message: expect.any(String),
        path: "riskId",
        severity: "error",
      });
    });
  });
  ```

  Run:

  ```bash
  pnpm exec vitest run tests/unit/domain/quality-domain.test.ts
  ```

  Expected: RED，测试因 `validateTestObligation` 和 `TestObligation` 尚未导出而失败；
  既有 QualityRisk 测试必须继续通过。

- [x] **Step 2: 验证 RED 原因正确**

  Run:

  ```bash
  pnpm exec vitest run tests/unit/domain/quality-domain.test.ts 2>&1 | tail -40
  ```

  Expected: 失败原因是缺少 TestObligation public API 或实现，不是测试语法错误；
  如果 import 报错同时隐藏了既有测试结果，先确认 Task 1 已提交且代码可编译，再
  继续实现。

- [x] **Step 3: 写最小 TestObligation 实现**

  在 `DiagnosticCode` union 末尾追加：

  ```ts
  | "TEST_OBLIGATION_ID_INVALID"
  | "TEST_OBLIGATION_RISK_ID_INVALID"
  | "TEST_OBLIGATION_STATEMENT_EMPTY"
  ```

  在 `quality-domain.ts` 中追加：

  ```ts
  export interface TestObligation {
    id: string;
    riskId: string;
    statement: string;
  }

  export function validateTestObligation(obligation: TestObligation): ValidationResult {
    const candidate = (obligation ?? {}) as Partial<TestObligation>;
    const diagnostics: Diagnostic[] = [];

    if (!isValidKebabCaseId(candidate.id)) {
      diagnostics.push(
        diagnostic("TEST_OBLIGATION_ID_INVALID", "id", "Test obligation id is invalid."),
      );
    }

    if (!isValidKebabCaseId(candidate.riskId)) {
      diagnostics.push(
        diagnostic(
          "TEST_OBLIGATION_RISK_ID_INVALID",
          "riskId",
          "Test obligation riskId is invalid.",
        ),
      );
    }

    if (typeof candidate.statement !== "string" || candidate.statement.trim().length === 0) {
      diagnostics.push(
        diagnostic(
          "TEST_OBLIGATION_STATEMENT_EMPTY",
          "statement",
          "Test obligation statement must not be empty.",
        ),
      );
    }

    return { valid: diagnostics.length === 0, diagnostics };
  }
  ```

  保持 `packages/domain/src/index.ts` 的以下 public export：

  ```ts
  export * from "./project.js";
  export * from "./quality-domain.js";
  ```

- [x] **Step 4: 运行完整 Domain GREEN**

  Run:

  ```bash
  pnpm exec vitest run tests/unit/domain/quality-domain.test.ts tests/unit/domain/project.test.ts tests/unit/domain/identifiers.test.ts
  pnpm typecheck
  ```

  Expected: 所有 Domain unit tests 和 workspace typecheck 通过；四个 ID 字段、六个
  diagnostic code、固定顺序、malformed runtime input、孤立引用和 public export
  均被验证。

- [x] **Step 5: 检查并提交 Task 2**

  Run:

  ```bash
  git diff --check
  ```

  Expected: 无空白错误；Task 2 只增加 TestObligation 的行为、实现和诊断 code。

  ```bash
  git add packages/domain/src/project.ts packages/domain/src/quality-domain.ts tests/unit/domain/quality-domain.test.ts
  git commit -m "feat: add test obligation domain contract"
  ```

### Task 3：同步双语 Contract、索引与实现状态

**Files:**

- Modify: `docs/en/contracts/QUALITY_DOMAIN_CONTRACT.md`
- Modify: `docs/zh-CN/contracts/QUALITY_DOMAIN_CONTRACT.md`
- Modify: `docs/superpowers/specs/2026-09-20-quality-risk-test-obligation-domain-contract-design.md`
- Modify: `FILE_INDEX.md`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Consumes: Task 1/2 的最终 Domain public API 与本计划中的六个新增 diagnostics。
- Produces: 与实现一致的英文 canonical Contract、中文镜像、过程文档状态和项目
  索引记录。

- [x] **Step 1: 扩展英文 Contract**

  在 `docs/en/contracts/QUALITY_DOMAIN_CONTRACT.md` 保留已有 Requirement 与
  AcceptanceCriterion 章节，并增加以下公共类型、validator 和规则：

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

  文档必须明确：QualityRisk 属于 Requirement，TestObligation 针对 QualityRisk；四个
  ID 共用 `^[a-z0-9]+(?:-[a-z0-9]+)*$`；validator 只检查语法，不做集合存在性
  查询；statement trim 后非空且保留原文；新增六个 code 的 code/path/severity/顺序
  是 machine contract；不新增 status、riskSeverity、likelihood、priority、owner、
  mitigation、testLevel、locale、schemaVersion、时间戳或 AI 元数据；集合级断裂引用
  由后续 Project Store/Traceability 处理；当前不包含持久化、UI、AI 或 Runtime。

- [x] **Step 2: 同步中文镜像**

  在 `docs/zh-CN/contracts/QUALITY_DOMAIN_CONTRACT.md` 按英文 Contract 相同顺序
  增加 QualityRisk/TestObligation 的类型、validator、ID 规则、六个诊断 code 表格、
  关系边界和 Out of Scope。中文文档可以保留现有双语 API 名称，但不得遗漏英文
  canonical Contract 的任何字段、顺序或行为边界。

- [x] **Step 3: 更新过程状态、索引和 Changelog**

  将 spec 状态更新为：

  ```md
  **状态：** 已获范围确认，已完成两轮设计 review、两轮自 review 和 TDD 实现；实现
  已完成，待最终验证。
  ```

  在 `FILE_INDEX.md` 的 Process documents 下加入：

  ```md
  -   `docs/superpowers/plans/2026-09-20-quality-risk-test-obligation-domain-contract.md`
  -   `docs/superpowers/specs/2026-09-20-quality-risk-test-obligation-domain-contract-design.md`
  ```

  在 `CHANGELOG.md` 的 `[Unreleased]` 下加入：

  ```md
  - Added the QualityRisk and TestObligation domain contracts with deterministic
    validation diagnostics and bilingual contract documentation.
  ```

- [x] **Step 4: 运行文档检查并提交 Task 3**

  Run:

  ```bash
  pnpm check:docs
  git diff --check
  ```

  Expected: 文档链接和 Blueprint 文件检查通过，且无空白错误。

  ```bash
  git add CHANGELOG.md FILE_INDEX.md docs/en/contracts/QUALITY_DOMAIN_CONTRACT.md docs/zh-CN/contracts/QUALITY_DOMAIN_CONTRACT.md docs/superpowers/specs/2026-09-20-quality-risk-test-obligation-domain-contract-design.md
  git commit -m "docs: document risk and test obligation contracts"
  ```

### Task 4：最终回归与独立自 review

**Files:**

- Verify: `packages/domain/src/project.ts`
- Verify: `packages/domain/src/quality-domain.ts`
- Verify: `packages/domain/src/index.ts`
- Verify: `tests/unit/domain/quality-domain.test.ts`
- Verify: `docs/en/contracts/QUALITY_DOMAIN_CONTRACT.md`
- Verify: `docs/zh-CN/contracts/QUALITY_DOMAIN_CONTRACT.md`

**Interfaces:**

- Consumes: Task 1、Task 2、Task 3 的提交结果。
- Produces: 可交付的 v0.1 QualityRisk/TestObligation Domain 子切片；不改变既有
  Project、Requirement 和 AcceptanceCriterion 行为。

- [x] **Step 1: 执行完整质量门禁**

  Run:

  ```bash
  pnpm check
  ```

  Expected: format、lint、typecheck、build、完整测试、architecture check 和 docs
  check 全部通过。

- [x] **Step 2: 做最终差异 review**

  Run:

  ```bash
  git diff --check origin/main..HEAD
  git status --short --branch
  git diff --stat origin/main..HEAD
  ```

  Review must confirm：

  - 没有引入 Store、filesystem、外部 Provider、UI 或 Runtime 依赖；
  - 四个关系/实体 ID 都复用同一 helper；
  - 两个 validator 都防御 malformed runtime input，且不修改输入；
  - diagnostics 顺序、code、path、severity 与中英文 Contract 一致；
  - public entry 导出实体和 validator，内部 helper 未导出；
  - 只修改本切片所需文件，没有覆盖用户已有改动。

- [x] **Step 3: 完成状态记录**

  将本计划所有已完成步骤标记为 `[x]`，并将 spec 状态从“待最终验证”更新为：

  ```md
  **状态：** 已获范围确认，已完成两轮设计 review、两轮自 review、TDD 实现和最终
  验证；QualityRisk 与 TestObligation Domain Contract 已完成 v0.1 交付。
  ```

  Run:

  ```bash
  git diff --check
  git status --short --branch
  ```

  Expected: 工作区干净；最终汇报明确列出实现版本、提交、验证命令和未实现边界。

- [x] **Step 4: 提交最终状态记录**

  只提交本计划执行过程中产生的计划勾选和最终 spec 状态变更：

  ```bash
  git add docs/superpowers/plans/2026-09-20-quality-risk-test-obligation-domain-contract.md docs/superpowers/specs/2026-09-20-quality-risk-test-obligation-domain-contract-design.md
  git commit -m "docs: finalize risk and test obligation implementation record"
  ```

## Plan Self-Review

- **Spec coverage:** Task 1 覆盖 QualityRisk 字段、关系 ID、statement、诊断顺序、
  malformed input、输入不变性和孤立引用；Task 2 对 TestObligation 覆盖同等行为；
  Task 3 覆盖双语 Contract、过程状态、索引和 Changelog；Task 4 覆盖完整质量门禁与
  最终差异审查。
- **Explicitness check:** 计划没有用模糊执行语句替代具体内容；每个代码行为都给出了
  具体 API、字段、命令或断言。
- **Type consistency:** `QualityRisk.requirementId`、`TestObligation.riskId`、
  六个 `DiagnosticCode`、两个 validator 签名与 spec、测试、实现和双语 Contract
  保持一致；public entry 使用现有 `export * from "./quality-domain.js"`。
- **Review focus:** 五类高风险输入均在 Task 1/2 的实际测试代码中覆盖；特别补充了
  开头/结尾分隔符、整对象字符串和诊断 severity，避免只测试常见非法值。
- **Execution boundary:** 计划没有引入 Store、UI、Traceability、AI、Runtime、
  持久化或新依赖；最终状态提交单独列出，避免完整验证前误报完成。
