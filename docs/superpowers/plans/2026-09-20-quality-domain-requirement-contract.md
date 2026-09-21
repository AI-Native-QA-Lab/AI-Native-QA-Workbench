# Quality Domain Requirement Contract Implementation Plan

> **历史记录（2026-09-21）：** 本文记录 Requirement/AcceptanceCriterion
> Domain 切片的原始实施过程，任务清单和末尾状态说明属于当时的执行上下文。
> 当前 v0.1 MVP 的整体状态以 [`v0.1 MVP 完成实施计划`](2026-09-21-v0-1-mvp-completion.md)
> 和验证记录为准。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 v0.1 MVP 中，以纯 TypeScript 和 TDD 交付 `Requirement` 与
`AcceptanceCriterion` 两个 Quality Domain 数据契约、确定性校验器和双语公共
Contract 文档，为后续 Traceability 建图提供稳定的最小基础。

**Architecture:** 保持 `apps/cli → packages/project-store → packages/domain`
依赖方向。新增实体和校验器只放在 `packages/domain`；共享的 kebab-case ID
helper 是 Domain 内部模块，不从 package 公共入口导出。当前切片不接触
`.ai-qa/`、filesystem、YAML、SQLite、Provider、AI Runtime 或 UI。

**Tech Stack:** Node.js 20+、pnpm、TypeScript、Vitest、ESLint、Prettier、
Turborepo；Domain 使用纯 TypeScript，测试离线执行。

**Spec:** `docs/superpowers/specs/2026-09-20-quality-domain-requirement-contract-design.md`

## Global Constraints

- `.ai-qa/` 仍是质量数据 Source of Truth；本切片不写入任何 `.ai-qa/` 文件。
- `packages/domain` 不得导入 filesystem、YAML、Zod、SQLite、Provider SDK、MCP、
  GitHub、Jira、测试框架或网络客户端。
- 所有新增行为必须经过 RED → GREEN；实现完成后运行 architecture、完整测试、
  typecheck 和文档检查。
- `Requirement` 与 `AcceptanceCriterion` 的 machine fields 是字段名、诊断
  code、path、severity、诊断顺序和 `valid`；`Diagnostic.message` 只作当前英文
  解释，不在测试中锁定完整文案。
- validator 只读输入：判空可以使用 `trim()`，但不得 trim、slugify、补默认值或
  修改原对象；`requirementId` 只做格式校验，不做关系存在性查询。
- 过程文档使用中文；英文正式 Contract 与中文镜像保持章节和规则一致。
- 不修改 Project File Contract 的 `schemaVersion: "0.1"`，不实现 Store、CLI、
  TraceLink、AI 生成、Evidence 或发布流程。
- 每个完成的实现任务单独提交；只 stage 本任务列出的文件，不使用 `git add .`。

## Review Focus

- malformed runtime input（`undefined`、`null`、数字）必须返回诊断而不是抛异常；
  由 Task 2 的 Requirement/AcceptanceCriterion 行为测试覆盖。
- Unicode、中文、空格、下划线、点号、连续分隔符和空字符串 ID 必须被拒绝；
  由 Task 1 的共享 helper 测试覆盖，并由 Task 2 的 public validator 测试确认
  code/path 映射。
- title/statement 的首尾空白必须保持原样，全空白值必须拒绝；由 Task 2 的
  输入快照和有效/无效行为测试覆盖。
- 格式合法但当前集合不存在的 `requirementId` 必须通过单实体校验；由 Task 2
  的孤立引用测试覆盖，并在双语 Contract 中明确集合级校验属于后续 Store/Traceability。
- 既有 Project 行为、公共导出、Domain 架构边界和文档链接不能回归；由 Task 1
  的 Project 回归测试、Task 2 的 typecheck/architecture 测试和 Task 3 的
  `check:docs`/完整回归覆盖。

---

### Task 1：提取共享 Domain ID 校验 helper 并锁定 Project 回归

**Files:**

- Create: `packages/domain/src/identifiers.ts`
- Create: `tests/unit/domain/identifiers.test.ts`
- Modify: `packages/domain/src/project.ts`
- Verify: `tests/unit/domain/project.test.ts`

**Interfaces:**

- Consumes: 现有 `validateProject` 的 Project ID 规则和既有 Project unit tests。
- Produces: Domain 内部函数 `isValidKebabCaseId(value: unknown): value is string`；
  `validateProject` 改为使用该函数，但保持现有公共 API、诊断 code 和行为不变。

- [x] **Step 1: 写共享 helper 的 RED 测试**

  新建 `tests/unit/domain/identifiers.test.ts`，从内部源码路径导入 helper，
  不从 `@ai-native-qa-workbench/domain` 导入，以明确它不是 public API。测试至少
  固定以下行为：

  ```ts
  import { describe, expect, it } from "vitest";
  import { isValidKebabCaseId } from "../../../packages/domain/src/identifiers.js";

  describe("isValidKebabCaseId", () => {
    it.each(["checkout-service", "a", "a1-b2"])('accepts "%s"', (value) => {
      expect(isValidKebabCaseId(value)).toBe(true);
    });

    it.each([
      "",
      "中文",
      "Bad_ID",
      "has space",
      "has.dot",
      "a--b",
      "-leading",
      "trailing-",
      undefined,
      null,
      42,
    ])("rejects %j", (value) => {
      expect(isValidKebabCaseId(value)).toBe(false);
    });
  });
  ```

  Run: `pnpm exec vitest run tests/unit/domain/identifiers.test.ts`

  Expected: RED，测试因 `packages/domain/src/identifiers.ts` 尚不存在而失败；
  不修改测试以绕过失败。

- [x] **Step 2: 实现最小 helper**

  创建 `packages/domain/src/identifiers.ts`，只保留以下职责，不做 trim、slugify
  或错误收集：

  ```ts
  const KEBAB_CASE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  export function isValidKebabCaseId(value: unknown): value is string {
    return typeof value === "string" && KEBAB_CASE_ID_PATTERN.test(value);
  }
  ```

- [x] **Step 3: 让 Project 使用 helper 并运行 GREEN**

  在 `packages/domain/src/project.ts` 中导入
  `isValidKebabCaseId`，删除 `PROJECT_ID_PATTERN`，将 Project ID 判断改为：

  ```ts
  if (!isValidKebabCaseId(candidate.id)) {
    diagnostics.push(
      diagnostic(
        "PROJECT_ID_INVALID",
        "id",
        "Project id must use lowercase kebab-case characters.",
      ),
    );
  }
  ```

  Run: `pnpm exec vitest run tests/unit/domain/identifiers.test.ts tests/unit/domain/project.test.ts`

  Expected: GREEN；Project 既有六个校验行为和两个 ID 派生行为保持通过，
  helper 的无效输入矩阵全部通过。不要把 helper 添加到 `packages/domain/src/index.ts`。

- [x] **Step 4: 检查任务边界并提交**

  Run: `git diff --check`。

  Expected: 无空白错误；变更只包含 helper、Project 的内部调用和对应测试。

  ```bash
  git add packages/domain/src/identifiers.ts packages/domain/src/project.ts tests/unit/domain/identifiers.test.ts
  git commit -m "refactor: share domain identifier validation"
  ```

### Task 2：以 TDD 实现 Requirement 与 AcceptanceCriterion Domain Contract

**Files:**

- Create: `tests/unit/domain/quality-domain.test.ts`
- Create: `packages/domain/src/quality-domain.ts`
- Modify: `packages/domain/src/project.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Consumes: Task 1 的 `isValidKebabCaseId`、现有 `Diagnostic`、`DiagnosticCode` 和
  `ValidationResult`。
- Produces: public `Requirement`、`AcceptanceCriterion`、
  `validateRequirement`、`validateAcceptanceCriterion`；新增六个质量域
  `DiagnosticCode`，但不改变既有 Project code。

- [x] **Step 1: 写 Requirement 和 AcceptanceCriterion 的 RED 行为测试**

  新建测试并从 `@ai-native-qa-workbench/domain` 导入 public contract。测试输入
  用 `as Requirement` 或 `as AcceptanceCriterion` 模拟运行时不可信数据，避免把
  TypeScript 编译期类型误当成运行时保证。先写以下断言：

  ```ts
  import { describe, expect, it } from "vitest";
  import {
    validateAcceptanceCriterion,
    validateRequirement,
    type AcceptanceCriterion,
    type Requirement,
  } from "@ai-native-qa-workbench/domain";

  describe("validateRequirement", () => {
    it("accepts an empty description", () => {
      expect(
        validateRequirement({ id: "login", title: "  登录  ", description: "" }),
      ).toEqual({ valid: true, diagnostics: [] });
    });

    it("reports malformed fields in contract order", () => {
      const result = validateRequirement({
        id: "Bad_ID",
        title: " \t",
        description: 42,
      } as unknown as Requirement);

      expect(result.valid).toBe(false);
      expect(result.diagnostics.map(({ code, path, severity }) => ({ code, path, severity }))).toEqual([
        { code: "REQUIREMENT_ID_INVALID", path: "id", severity: "error" },
        { code: "REQUIREMENT_TITLE_EMPTY", path: "title", severity: "error" },
        { code: "REQUIREMENT_DESCRIPTION_INVALID", path: "description", severity: "error" },
      ]);
      expect(result.diagnostics.every(({ message }) => typeof message === "string")).toBe(true);
    });

    it.each([undefined, null, 42])("returns diagnostics for malformed runtime input %j", (value) => {
      expect(() => validateRequirement(value as unknown as Requirement)).not.toThrow();
      expect(validateRequirement(value as unknown as Requirement).valid).toBe(false);
    });
  });

  describe("validateAcceptanceCriterion", () => {
    it("accepts Chinese multiline statements and preserves the input", () => {
      const criterion: AcceptanceCriterion = {
        id: "login-success",
        requirementId: "login",
        statement: "  Given 用户已登录\nWhen 提交表单\nThen 显示成功  ",
      };
      const before = structuredClone(criterion);

      expect(validateAcceptanceCriterion(criterion)).toEqual({ valid: true, diagnostics: [] });
      expect(criterion).toEqual(before);
    });

    it("accepts a syntactically valid but currently unresolved requirementId", () => {
      expect(
        validateAcceptanceCriterion({
          id: "criterion-1",
          requirementId: "requirement-not-loaded",
          statement: "A valid statement",
        }),
      ).toEqual({ valid: true, diagnostics: [] });
    });

    it("reports id, requirementId, and statement in contract order", () => {
      const result = validateAcceptanceCriterion({
        id: "a--b",
        requirementId: "Bad_ID",
        statement: " \n\t",
      });

      expect(result.diagnostics.map(({ code, path }) => ({ code, path }))).toEqual([
        { code: "ACCEPTANCE_CRITERION_ID_INVALID", path: "id" },
        { code: "ACCEPTANCE_CRITERION_REQUIREMENT_ID_INVALID", path: "requirementId" },
        { code: "ACCEPTANCE_CRITERION_STATEMENT_EMPTY", path: "statement" },
      ]);
    });

    it.each([
      ["id", undefined],
      ["requirementId", null],
      ["statement", 42],
    ])("returns diagnostics for malformed %s runtime data", (field, value) => {
      const criterion = {
        id: "criterion-1",
        requirementId: "login",
        statement: "valid",
        [field]: value,
      } as unknown as AcceptanceCriterion;

      expect(() => validateAcceptanceCriterion(criterion)).not.toThrow();
      expect(validateAcceptanceCriterion(criterion).valid).toBe(false);
    });
  });
  ```

  另外加入一个输入快照测试：对 title 和 statement 含首尾空白的合法对象调用
  validator 前后分别 `structuredClone`，确认对象不变；用以下 table tests 固定
  三个 ID 字段的无效值和对应 code：

  ```ts
  const invalidIds = ["中文", "has space", "Bad_ID", "has.dot", "a--b", ""];

  it.each(invalidIds)("rejects invalid Requirement.id %j", (id) => {
    const result = validateRequirement({ id, title: "Title", description: "" });
    expect(result.diagnostics.map(({ code, path }) => ({ code, path }))).toContainEqual({
      code: "REQUIREMENT_ID_INVALID",
      path: "id",
    });
  });

  it.each(invalidIds)("rejects invalid AcceptanceCriterion.id %j", (id) => {
    const result = validateAcceptanceCriterion({
      id,
      requirementId: "login",
      statement: "valid",
    });
    expect(result.diagnostics.map(({ code, path }) => ({ code, path }))).toContainEqual({
      code: "ACCEPTANCE_CRITERION_ID_INVALID",
      path: "id",
    });
  });

  it.each(invalidIds)("rejects invalid AcceptanceCriterion.requirementId %j", (requirementId) => {
    const result = validateAcceptanceCriterion({
      id: "criterion-1",
      requirementId,
      statement: "valid",
    });
    expect(result.diagnostics.map(({ code, path }) => ({ code, path }))).toContainEqual({
      code: "ACCEPTANCE_CRITERION_REQUIREMENT_ID_INVALID",
      path: "requirementId",
    });
  });
  ```

  Run: `pnpm exec vitest run tests/unit/domain/quality-domain.test.ts`

  Expected: RED，因 public types/validators 尚未存在而失败。

- [x] **Step 2: 扩展共享 diagnostic code 并实现最小 validator**

  在 `packages/domain/src/project.ts` 的 `DiagnosticCode` union 追加且只追加：

  ```ts
  | "REQUIREMENT_ID_INVALID"
  | "REQUIREMENT_TITLE_EMPTY"
  | "REQUIREMENT_DESCRIPTION_INVALID"
  | "ACCEPTANCE_CRITERION_ID_INVALID"
  | "ACCEPTANCE_CRITERION_REQUIREMENT_ID_INVALID"
  | "ACCEPTANCE_CRITERION_STATEMENT_EMPTY"
  ```

  创建 `packages/domain/src/quality-domain.ts`：

  - 导出 spec 中的两个 interface；
  - 仅以 `.js` 相对 import 引入 `isValidKebabCaseId` 和 `project.ts` 的
    `Diagnostic`/`DiagnosticCode`/`ValidationResult` 类型；
  - 用本模块内部 `diagnostic` helper 创建 `{ code, message, path, severity: "error" }`；
  - `validateRequirement` 固定按 `id → title → description` 追加 diagnostics；
  - `validateAcceptanceCriterion` 固定按 `id → requirementId → statement` 追加
    diagnostics；
  - `validateRequirement` 先用
    `const candidate = (requirement ?? {}) as Partial<Requirement>`，
    `validateAcceptanceCriterion` 先用
    `const candidate = (criterion ?? {}) as Partial<AcceptanceCriterion>`，再通过
    `typeof` 检查保证整个输入为 `undefined` 或 `null` 时也不抛异常；数字等非对象
    值同样只能产生 diagnostics，不能依赖 TypeScript 类型断言提供运行时保护；
  - title/statement 只在判空时使用 `trim()`，返回值不改写输入；
  - 不查询 Requirement 集合，不引入任何 Store/IO 依赖。

  validator 的核心结构必须保持如下确定性顺序：

  ```ts
  const diagnostics: Diagnostic[] = [];
  if (!isValidKebabCaseId(candidate.id)) {
    diagnostics.push(diagnostic("REQUIREMENT_ID_INVALID", "id", "Requirement id is invalid."));
  }
  if (typeof candidate.title !== "string" || candidate.title.trim().length === 0) {
    diagnostics.push(diagnostic("REQUIREMENT_TITLE_EMPTY", "title", "Requirement title must not be empty."));
  }
  if (typeof candidate.description !== "string") {
    diagnostics.push(
      diagnostic("REQUIREMENT_DESCRIPTION_INVALID", "description", "Requirement description must be a string."),
    );
  }
  return { valid: diagnostics.length === 0, diagnostics };
  ```

  AcceptanceCriterion validator 必须使用以下对应结构，保持独立的字段检查顺序：

  ```ts
  const candidate = (criterion ?? {}) as Partial<AcceptanceCriterion>;
  const diagnostics: Diagnostic[] = [];
  if (!isValidKebabCaseId(candidate.id)) {
    diagnostics.push(
      diagnostic(
        "ACCEPTANCE_CRITERION_ID_INVALID",
        "id",
        "Acceptance criterion id is invalid.",
      ),
    );
  }
  if (!isValidKebabCaseId(candidate.requirementId)) {
    diagnostics.push(
      diagnostic(
        "ACCEPTANCE_CRITERION_REQUIREMENT_ID_INVALID",
        "requirementId",
        "Acceptance criterion requirementId is invalid.",
      ),
    );
  }
  if (typeof candidate.statement !== "string" || candidate.statement.trim().length === 0) {
    diagnostics.push(
      diagnostic(
        "ACCEPTANCE_CRITERION_STATEMENT_EMPTY",
        "statement",
        "Acceptance criterion statement must not be empty.",
      ),
    );
  }
  return { valid: diagnostics.length === 0, diagnostics };
  ```

- [x] **Step 3: 暴露 public API 并运行 GREEN**

  在 `packages/domain/src/index.ts` 追加：

  ```ts
  export * from "./quality-domain.js";
  ```

  不导出 `identifiers.ts`。运行：

  ```bash
  pnpm exec vitest run tests/unit/domain/quality-domain.test.ts tests/unit/domain/identifiers.test.ts tests/unit/domain/project.test.ts
  pnpm typecheck
  pnpm check:architecture
  ```

  Expected：新增行为 GREEN；三组 Domain unit tests、类型检查和架构边界全部通过；
  `packages/domain/src` 中没有 forbidden import；public package 可以导出两个实体
  和两个 validator，但不能导出内部 ID helper。

- [x] **Step 4: 完成任务级回归并提交**

  Run: `git diff --check`。

  Expected: 无空白错误；`git diff` 只包含 Domain 实现和 unit tests，未出现 Store、
  CLI、`.ai-qa/` 或外部依赖变更。

  ```bash
  git add packages/domain/src/project.ts packages/domain/src/quality-domain.ts packages/domain/src/index.ts tests/unit/domain/quality-domain.test.ts
  git commit -m "feat: add requirement quality domain contract"
  ```

### Task 3：同步双语 Contract、索引与变更记录，并完成全量质量门禁

**Files:**

- Create: `docs/en/contracts/QUALITY_DOMAIN_CONTRACT.md`
- Create: `docs/zh-CN/contracts/QUALITY_DOMAIN_CONTRACT.md`
- Modify: `docs/en/contracts/CORE_CONTRACT_INDEX.md`
- Modify: `docs/zh-CN/contracts/CORE_CONTRACT_INDEX.md`
- Modify: `docs/superpowers/plans/2026-09-20-quality-domain-requirement-contract.md`
- Modify: `FILE_INDEX.md`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Consumes: Task 2 已验证的 public Domain API 和已审阅 spec。
- Produces: 面向仓库贡献者的中英文稳定 Contract 文档；文档明确当前能力、字段
  校验、diagnostic 兼容边界，以及后续 Store/Traceability/AI 能力不属于当前切片。

- [x] **Step 1: 编写英文 Contract**

  `docs/en/contracts/QUALITY_DOMAIN_CONTRACT.md` 必须至少包含以下章节，并以实现
  为准写出完整规则：Purpose、Public Types、Validation Rules、Diagnostics、
  Immutability、Relationship Boundary、Out of Scope、Compatibility Notes。

  Public type 代码块必须与实现一致：

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

  文档必须说明：ID 使用 `^[a-z0-9]+(?:-[a-z0-9]+)*$`；title/statement 只拒绝
  trim 后为空的字符串且保留原值；description 可为空但必须是字符串；诊断顺序和
  code/path/severity 是 machine contract；message 不是兼容性键；单实体校验不
  查询关系存在性；当前不定义持久化格式、schema migration、AI 生成或 TraceLink。

- [x] **Step 2: 编写中文镜像并同步索引**

  `docs/zh-CN/contracts/QUALITY_DOMAIN_CONTRACT.md` 保持与英文文档相同章节、
  字段、正则、diagnostic code 和范围边界，解释文字使用中文。

  在两个 `CORE_CONTRACT_INDEX.md` 中把无链接的 `Quality Domain Contract` 改为
  指向同目录新增文件的相对链接：

  ```md
  - [Quality Domain Contract](QUALITY_DOMAIN_CONTRACT.md)
  ```

  中文索引的显示文字可以保持中文，但链接目标必须是
  `QUALITY_DOMAIN_CONTRACT.md`。

- [x] **Step 3: 更新文件索引和 Changelog**

  在 `FILE_INDEX.md` 现有 Contract 文档路径列表中加入以下两行：

  ```md
  -   `docs/en/contracts/QUALITY_DOMAIN_CONTRACT.md`
  -   `docs/zh-CN/contracts/QUALITY_DOMAIN_CONTRACT.md`
  ```

  在 Process documents 区域确认以下两行存在；如果不存在则补入：

  ```md
  -   `docs/superpowers/plans/2026-09-20-quality-domain-requirement-contract.md`
  -   `docs/superpowers/specs/2026-09-20-quality-domain-requirement-contract-design.md`
  ```

  在 `CHANGELOG.md` 的 `[Unreleased]` 下追加以下条目，明确已加入
  Requirement、AcceptanceCriterion、确定性 diagnostics 和双语 Contract，不把它
  描述成 v0.1 全部完成或 v1.0 发布：

  ```md
  - Added the Requirement and AcceptanceCriterion domain contracts with deterministic
    validation diagnostics and bilingual contract documentation.
  ```

  当时的 spec 状态曾记录为“已获用户确认；尚未开始实现”；该句只保留历史执行
  上下文。Task 3 不再把它当作当前仓库实现状态，当前状态以最新 v0.1 验证记录为准。

- [x] **Step 4: 运行文档门禁和全量回归**

  依次运行：

  ```bash
  pnpm check:docs
  pnpm format:check
  pnpm lint
  pnpm typecheck
  pnpm build
  pnpm test
  pnpm check:architecture
  git diff --check
  git status --short --branch
  ```

  Expected：文档链接、格式、lint、类型、3 个 package build、全部 unit/contract/
  integration/architecture tests 均通过；`git status` 只剩本任务待提交的文档变更。
  若 `pnpm check:docs` 报告链接错误，先修正相对路径再继续，不降低检查范围。

- [x] **Step 5: 提交文档并记录最终状态**

  ```bash
  git add CHANGELOG.md FILE_INDEX.md docs/en/contracts/CORE_CONTRACT_INDEX.md docs/en/contracts/QUALITY_DOMAIN_CONTRACT.md docs/zh-CN/contracts/CORE_CONTRACT_INDEX.md docs/zh-CN/contracts/QUALITY_DOMAIN_CONTRACT.md docs/superpowers/plans/2026-09-20-quality-domain-requirement-contract.md
  git commit -m "docs: document requirement quality domain contract"
  ```

  提交后再次运行 `git status --short --branch` 和 `git log -3 --oneline`；最终汇报
  必须区分：本切片完成的是 v0.1 MVP 的 Quality Domain 子切片，不等于 v0.1 全部
  MVP、v1.0 稳定版、持久化、AI Runtime 或发布完成。

## Final Acceptance Checklist

- [x] `Requirement` 和 `AcceptanceCriterion` 从 `@ai-native-qa-workbench/domain`
  公共入口导出，`identifiers.ts` 未被公共入口导出。
- [x] 六个新增 diagnostic code、path、severity 和固定顺序与 spec 完全一致。
- [x] malformed runtime input 不抛异常；validator 不改写输入；空 description 合法；
  unresolved 但格式合法的 `requirementId` 合法。
- [x] Project、新增实体共享同一内部 ID helper，既有 Project tests 通过。
- [x] Domain architecture、format、lint、typecheck、build、完整测试和文档链接检查
  全部通过。
- [x] 英文/中文 Contract、FILE_INDEX 和 CHANGELOG 已同步，`git diff --check` 干净，
  没有无关文件变更。
