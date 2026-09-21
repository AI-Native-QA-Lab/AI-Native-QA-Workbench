# 仓库启动与项目文件契约实施计划

> **历史记录（2026-09-21）：** 本文保留 v0.1 Bootstrap 初始垂直切片的原始
> 执行清单和当时的勾选状态。该阶段已经由后续实现和
> [`v0.1 MVP 完成实施计划`](2026-09-21-v0-1-mvp-completion.md) 接管；本文中
> 未勾选的历史步骤不再作为当前 v0.1 MVP closeout 的完成门禁。当前状态以最新
> 完成设计、验证记录和实际提交为准。

> **给 agent worker：** 必须使用 superpowers:executing-plans（或
> superpowers:subagent-driven-development）逐任务执行本计划。每个步骤使用
> checkbox 跟踪，并在进入下一任务前完成该任务的验证。

**目标：** 基于已审阅的设计 spec，建立 ai-native-qa-workbench 的真实仓库
基线，并用 TDD 交付 qaw init / qaw validate 第一条可运行垂直切片。

**架构：** apps/cli 只负责参数解析和输出；packages/project-store 负责
.ai-qa/project.yaml 的 filesystem/YAML 边界；packages/domain 只包含纯
TypeScript 的 Project 校验与 ID 派生。依赖方向只能是 CLI → Project Store →
Domain。

**技术栈：** Node.js 20+、pnpm、Turborepo、TypeScript、YAML、Zod、Vitest、
ESLint、Prettier、tsx、GitHub Actions。

**规格：** docs/superpowers/specs/2026-09-20-repository-bootstrap-and-project-contract-design.md

## 全局约束

- 项目质量数据的 Source of Truth 是 .ai-qa；本计划只创建
  .ai-qa/project.yaml，不引入 SQLite。
- packages/domain 不得依赖 filesystem、YAML、Zod、SQLite、Fastify、React、
  provider SDK、MCP、GitHub、Jira、DSH 或测试框架。
- 核心测试离线运行，不调用真实 LLM、不访问网络。
- qaw init 不覆盖已有 .ai-qa/project.yaml；qaw validate 不修改项目文件。
- 所有核心行为严格遵循 RED → GREEN → REFACTOR → architecture check → regression。
- docs/development/ 和 docs/superpowers/ 的过程文档使用中文；docs/en/ 是
  英文正式文档，docs/zh-CN/ 是中文正式镜像。
- 不修改 dsh-qa，不创建 GitHub release/tag/PR，不引入 v0.1 后续 Epic 的实现。
- 许可证文件必须使用用户指定仓库中的 PolyForm Noncommercial License 1.0.0
  原文，来源为
  https://raw.githubusercontent.com/naodeng/awesome-qa-skills/main/LICENSE。

## 审查重点

- malformed YAML 和空文档必须返回 PROJECT_FILE_MALFORMED，而不是抛出未处理异常；
  由 Task 4 的 Project Store contract test 固定。
- schemaVersion: "0.2" 必须返回 PROJECT_SCHEMA_UNSUPPORTED；由 Task 3 的
  Domain test 和 Task 4 的文件 contract test 固定。
- 顶层和 project 内未知 key 必须返回 PROJECT_UNKNOWN_KEY，并指出 YAML path；
  由 Task 4 固定。
- 第二次 qaw init 必须返回 PROJECT_FILE_EXISTS 且保留原始字节内容；由 Task 4
  和 Task 5 固定。
- 含中文、空格或标点的目录名必须稳定回退到 project，不能生成非法 ID；由 Task 3
  固定。

---

### Task 1：导入 Blueprint、治理文件与许可证

**Files:**

- Create: AGENTS.md
- Create: CHANGELOG.md
- Create: CONTRIBUTING.md
- Create: FILE_INDEX.md
- Create: README.md
- Create: README.zh-CN.md
- Create: SECURITY.md
- Create: LICENSE
- Create: .github/ISSUE_TEMPLATE/feature.md
- Create: .github/PULL_REQUEST_TEMPLATE.md
- Create: .github/workflows/README.md
- Create: docs/adr/README.md
- Create: docs/development/GITHUB_MILESTONES_AND_EPICS.md
- Create: docs/development/RELEASE_PLAN.md
- Create: docs/development/iterations/POST_V1_PLAN.md
- Create: docs/development/iterations/V1_0_IMPLEMENTATION_PLAN.md
- Create: docs/development/migration/DSH_QA_MIGRATION_MATRIX.md
- Create: docs/development/mvp/MVP_IMPLEMENTATION_PLAN.md
- Create: docs/development/tdd/TDD_PLAN.md
- Create: docs/en/MVP.md
- Create: docs/en/PROJECT_BLUEPRINT.md
- Create: docs/en/ROADMAP.md
- Create: docs/en/TECH_STACK.md
- Create: docs/en/contracts/CORE_CONTRACT_INDEX.md
- Create: docs/zh-CN/MVP.md
- Create: docs/zh-CN/PROJECT_BLUEPRINT.md
- Create: docs/zh-CN/ROADMAP.md
- Create: docs/zh-CN/TECH_STACK.md
- Create: docs/zh-CN/contracts/CORE_CONTRACT_INDEX.md

**Interfaces:**

- Consumes: /Users/nao.deng/Downloads/ai-native-qa-workbench-github-blueprint/
  中的 28 个 Markdown 文件和用户指定的许可证来源。
- Produces: 仓库治理文档、双语 Blueprint、GitHub 模板以及根目录 LICENSE；
  不产生运行时代码。

- [ ] **Step 1: 导入 Blueprint 文件**

  按上面的完整清单使用 apply_patch 将附件包中的文件复制到仓库，保持正文、
  标题、链接和目录结构不变；不要复制任何 .DS_Store。

- [ ] **Step 2: 写入许可证**

  将指定 raw LICENSE 的完整原文写入根目录 LICENSE。文件第一行必须是：

  ~~~text
  # PolyForm Noncommercial License 1.0.0
  ~~~

- [ ] **Step 3: 验证导入边界**

  Run: rg --files --hidden -g '*.md' -g '!**/.git/**' | sort

  Expected: 输出包含 28 个 Blueprint Markdown 文件；不包含 .DS_Store，不包含
  来自 dsh-qa 的文件。

- [ ] **Step 4: 检查 Markdown 和许可证格式**

  Run: git diff --check

  Expected: 无空白错误。

- [ ] **Step 5: Commit**

  ~~~bash
  git add AGENTS.md CHANGELOG.md CONTRIBUTING.md FILE_INDEX.md README.md README.zh-CN.md SECURITY.md LICENSE .github docs/adr docs/development docs/en docs/zh-CN
  git commit -m "docs: import GitHub blueprint and license"
  ~~~

### Task 2：建立 workspace、工具链与 package 元数据

**Files:**

- Create: package.json
- Create: pnpm-workspace.yaml
- Create: turbo.json
- Create: tsconfig.base.json
- Create: tsconfig.json
- Create: vitest.config.ts
- Create: eslint.config.js
- Create: .prettierrc.json
- Create: .prettierignore
- Create: .gitignore
- Create: packages/domain/package.json
- Create: packages/domain/tsconfig.json
- Create: packages/domain/tsconfig.build.json
- Create: packages/project-store/package.json
- Create: packages/project-store/tsconfig.json
- Create: packages/project-store/tsconfig.build.json
- Create: apps/cli/package.json
- Create: apps/cli/tsconfig.json
- Create: apps/cli/tsconfig.build.json

**Interfaces:**

- Consumes: Task 1 的仓库文档。
- Produces: 可安装的 pnpm workspace；package 名称分别为
  @ai-native-qa-workbench/domain、@ai-native-qa-workbench/project-store 和
  @ai-native-qa-workbench/cli。

- [ ] **Step 1: 写入 workspace 清单**

  pnpm-workspace.yaml 使用以下内容：

  ~~~yaml
  packages:
    - apps/*
    - packages/*
  ~~~

  根 package.json 必须包含 private: true、type: module、
  packageManager: pnpm@12.4.2、engines.node: >=20，并包含以下脚本：

  ~~~json
  {
    "build": "turbo run build",
    "dev": "turbo run dev --parallel",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "check:architecture": "vitest run tests/architecture",
    "check:docs": "tsx scripts/check-docs.ts",
    "check": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm check:architecture && pnpm check:docs",
    "qaw": "tsx apps/cli/src/main.ts"
  }
  ~~~

  根开发依赖使用 TypeScript、Vitest、Turborepo、tsx、ESLint 9、
  @eslint/js、typescript-eslint、Prettier 3 和 @types/node；
  project-store 的运行时依赖使用 yaml 和 zod。

- [ ] **Step 2: 写入 TypeScript 和测试配置**

  tsconfig.base.json 开启 strict、noUncheckedIndexedAccess、
  exactOptionalPropertyTypes、verbatimModuleSyntax、isolatedModules，使用
  target: ES2022、module: NodeNext、moduleResolution: NodeNext。

  根 tsconfig.json include apps/**/*.ts、packages/**/*.ts、tests/**/*.ts
  和 scripts/**/*.ts，并设置 noEmit: true。

  vitest.config.ts 只包含 tests/**/*.test.ts；eslint.config.js 使用 flat
  config，忽略 node_modules、dist 和 .ai-qa；Prettier 使用 2 空格、双引号、
  trailing comma 和 100 列宽。

- [ ] **Step 3: 写入 package 元数据**

  每个 package 使用 NodeNext ESM。Domain 和 Project Store 的 build 脚本分别为
  tsc -p tsconfig.build.json，CLI 的 build 脚本相同。Project Store 使用
  workspace:* 依赖 @ai-native-qa-workbench/domain；CLI 使用 workspace:*
  依赖 @ai-native-qa-workbench/project-store。

  每个 package 都必须提供 build、lint、typecheck 和 clean script，以便
  Turborepo 能够调度；CLI 的 bin 声明为 qaw: dist/main.js。

- [ ] **Step 4: 写入 Turborepo 任务**

  turbo.json 定义 build（依赖 ^build，输出 dist/**）、lint、typecheck、
  test（依赖 ^build）和 clean；dev 必须设置 cache: false、persistent: true。

- [ ] **Step 5: 安装并验证工具链**

  Run: pnpm install

  Expected: 生成 pnpm-lock.yaml，安装不执行任何模型调用。

  Run: pnpm exec prettier --check package.json pnpm-workspace.yaml turbo.json tsconfig.base.json tsconfig.json

  Expected: PASS。

- [ ] **Step 6: Commit**

  ~~~bash
  git add package.json pnpm-workspace.yaml turbo.json tsconfig.base.json tsconfig.json vitest.config.ts eslint.config.js .prettierrc.json .prettierignore .gitignore packages/domain/package.json packages/domain/tsconfig.json packages/domain/tsconfig.build.json packages/project-store/package.json packages/project-store/tsconfig.json packages/project-store/tsconfig.build.json apps/cli/package.json apps/cli/tsconfig.json apps/cli/tsconfig.build.json pnpm-lock.yaml
  git commit -m "build: scaffold pnpm workspace"
  ~~~

### Task 3：用 TDD 实现 Domain Project Contract

**Files:**

- Test: tests/unit/domain/project.test.ts
- Create: packages/domain/src/project.ts
- Create: packages/domain/src/index.ts
- Modify: packages/domain/tsconfig.build.json（确认 declaration/outDir/rootDir）

**Interfaces:**

- Consumes: Task 2 的 Domain package 元数据。
- Produces: ProjectLocale、Project、DiagnosticCode、Diagnostic、
  ValidationResult、validateProject、deriveProjectId。

- [ ] **Step 1: 写第一个失败测试——有效项目通过**

  在 tests/unit/domain/project.test.ts 中写：

  ~~~ts
  import { describe, expect, it } from "vitest";
  import { validateProject } from "@ai-native-qa-workbench/domain";

  describe("validateProject", () => {
    it("accepts a valid v0.1 project", () => {
      expect(validateProject({
        schemaVersion: "0.1",
        id: "checkout-service",
        name: "Checkout Service",
        description: "",
        defaultLocale: "en",
      })).toEqual({ valid: true, diagnostics: [] });
    });
  });
  ~~~

- [ ] **Step 2: 运行 RED**

  Run: pnpm exec vitest run tests/unit/domain/project.test.ts

  Expected: FAIL，原因是 @ai-native-qa-workbench/domain 尚未导出
  validateProject，而不是测试语法错误。

- [ ] **Step 3: 写失败测试覆盖不变量和 ID 派生**

  追加测试：schema version 为 0.2 返回 PROJECT_SCHEMA_UNSUPPORTED；ID 为
  Bad_ID 返回 PROJECT_ID_INVALID；name 为空返回 PROJECT_NAME_EMPTY；
  description 非字符串返回 PROJECT_DESCRIPTION_INVALID；locale 为 fr 返回
  PROJECT_LOCALE_INVALID；目录名 My QA / 项目 派生为 my-qa，全是中文或标点
  时派生为 project。

- [ ] **Step 4: 写最小实现**

  packages/domain/src/project.ts 导出：

  ~~~ts
  export const PROJECT_SCHEMA_VERSION = "0.1" as const;
  export type ProjectLocale = "en" | "zh-CN";
  export interface Project {
    schemaVersion: string;
    id: string;
    name: string;
    description: string;
    defaultLocale: string;
  }
  export type DiagnosticCode =
    | "PROJECT_SCHEMA_UNSUPPORTED"
    | "PROJECT_ID_INVALID"
    | "PROJECT_NAME_EMPTY"
    | "PROJECT_DESCRIPTION_INVALID"
    | "PROJECT_LOCALE_INVALID";
  export interface Diagnostic {
    code: DiagnosticCode;
    message: string;
    path: string;
    severity: "error";
  }
  export interface ValidationResult {
    valid: boolean;
    diagnostics: readonly Diagnostic[];
  }
  ~~~

  validateProject 按 schemaVersion、ID、name、description、locale 的固定顺序
  追加 diagnostics；没有错误时返回 { valid: true, diagnostics: [] }。
  deriveProjectId 使用 trim().toLowerCase()，将连续非 ASCII 小写字母/数字
  字符替换为 -，去除两端 -，空结果回退为 project。

- [ ] **Step 5: 运行 GREEN 和完整 Domain 回归**

  Run: pnpm exec vitest run tests/unit/domain/project.test.ts

  Expected: 所有 Domain tests PASS。

  Run: pnpm typecheck

  Expected: PASS。

- [ ] **Step 6: Commit**

  ~~~bash
  git add packages/domain/src tests/unit/domain/project.test.ts
  git commit -m "feat: add project domain contract"
  ~~~

### Task 4：用 TDD 实现 Project Store

**Files:**

- Test: tests/contract/project-file.contract.test.ts
- Create: packages/project-store/src/types.ts
- Create: packages/project-store/src/project-file.ts
- Create: packages/project-store/src/file-project-store.ts
- Create: packages/project-store/src/index.ts

**Interfaces:**

- Consumes: Task 3 的 Domain exports。
- Produces: PROJECT_FILE_RELATIVE_PATH、StoreDiagnosticCode、
  StoreDiagnostic、StoreValidationResult、InitProjectResult、
  serializeProject、parseProjectFile、FileProjectStore。

- [ ] **Step 1: 写失败的 parse contract tests**

  测试以下输入：

  ~~~ts
  const validYaml = [
    "schemaVersion: \"0.1\"",
    "project:",
    "  id: checkout-service",
    "  name: Checkout Service",
    "  description: \"\"",
    "  defaultLocale: en",
    "",
  ].join("\n");
  ~~~

  parseProjectFile(validYaml) 必须返回 valid: true 和扁平 Domain Project。
  空字符串、非法 YAML 和 YAML 标量必须返回 PROJECT_FILE_MALFORMED。

- [ ] **Step 2: 运行 RED**

  Run: pnpm exec vitest run tests/contract/project-file.contract.test.ts

  Expected: FAIL，原因是 parseProjectFile 尚未定义。

- [ ] **Step 3: 写失败的 schema contract tests**

  追加测试：schemaVersion: 0.2 返回 PROJECT_SCHEMA_UNSUPPORTED；缺少
  project.name 返回 PROJECT_NAME_EMPTY；顶层 metadata 和 project.owner
  分别返回 PROJECT_UNKNOWN_KEY，path 分别为 metadata 和 project.owner；
  locale fr 返回 PROJECT_LOCALE_INVALID。

- [ ] **Step 4: 实现 YAML 解析和 schema 边界**

  在 project-file.ts 使用 yaml.parse 和严格的 Zod schema：顶层只允许
  schemaVersion、project；project 只允许 id、name、description、defaultLocale；
  字段先保持 string，再交给 Domain validateProject。将 Zod unrecognized_keys
  映射为 PROJECT_UNKNOWN_KEY，其他结构性错误映射为 PROJECT_FILE_MALFORMED，
  YAML path 使用点号连接。

  serializeProject 必须按以下对象顺序构造 YAML，并保留末尾换行：

  ~~~ts
  {
    schemaVersion: project.schemaVersion,
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      defaultLocale: project.defaultLocale,
    },
  }
  ~~~

- [ ] **Step 5: 写失败的 filesystem tests**

  用 fs.mkdtemp 建立临时项目目录，测试：validateProject 缺文件返回
  PROJECT_FILE_MISSING；initProject 创建 .ai-qa/project.yaml；第二次 init
  返回 PROJECT_FILE_EXISTS 且读取到的原始文本完全不变；init 写入的文件再次
  validate 成功。

- [ ] **Step 6: 运行 RED**

  Run: pnpm exec vitest run tests/contract/project-file.contract.test.ts

  Expected: 新增 filesystem tests FAIL，失败原因是 FileProjectStore 尚未实现。

- [ ] **Step 7: 实现 FileProjectStore**

  FileProjectStore.initProject({ rootDirectory, name, description, defaultLocale })
  使用目录 basename 作为默认 name，使用 deriveProjectId 作为默认 id，默认
  description 为空字符串、locale 为 en。创建 .ai-qa/ 后先检查目标文件，
  已存在则不写入并返回 PROJECT_FILE_EXISTS。

  原子写入使用目标文件同目录的随机临时文件：先 writeFile，再 rename；失败时
  在 finally 中尝试删除临时文件。validateProject 只读目标文件并调用
  parseProjectFile，不得创建或修改任何文件。

- [ ] **Step 8: 运行 GREEN、序列化回归和 Store typecheck**

  Run: pnpm exec vitest run tests/contract/project-file.contract.test.ts

  Expected: 所有 Project Store contract tests PASS。

  Run: pnpm --filter @ai-native-qa-workbench/project-store typecheck

  Expected: PASS。

- [ ] **Step 9: Commit**

  ~~~bash
  git add packages/project-store/src tests/contract/project-file.contract.test.ts
  git commit -m "feat: add local project file store"
  ~~~

### Task 5：用 TDD 实现 qaw init 与 qaw validate

**Files:**

- Test: tests/integration/cli.test.ts
- Create: apps/cli/src/cli.ts
- Create: apps/cli/src/main.ts
- Modify: apps/cli/package.json（确认 bin 指向 dist/main.js）

**Interfaces:**

- Consumes: Task 4 的 FileProjectStore 和 store result types。
- Produces: runCli(argv, dependencies): Promise<number>；真实命令
  qaw init 和 qaw validate。

- [ ] **Step 1: 写失败的 CLI integration tests**

  用 fs.mkdtemp 创建临时目录，并通过 Node 子进程执行真实入口：

  ~~~ts
  const tsxEntry = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));
  const cliEntry = fileURLToPath(new URL("../../apps/cli/src/main.ts", import.meta.url));
  const result = spawnSync(process.execPath, [tsxEntry, cliEntry, ...args], {
    cwd: temporaryDirectory,
    encoding: "utf8",
  });
  ~~~

  测试成功 init、成功 validate、第二次 init、缺文件 validate 和未知 option；分别
  断言 exit code、stdout/stderr、生成文件和原始内容不变。

- [ ] **Step 2: 运行 RED**

  Run: pnpm exec vitest run tests/integration/cli.test.ts

  Expected: FAIL，原因是 apps/cli/src/main.ts 尚不存在。

- [ ] **Step 3: 实现参数解析与 CLI 输出**

  cli.ts 支持：

  ~~~text
  qaw init [--name <name>] [--description <description>]
           [--locale en|zh-CN] [directory]
  qaw validate [directory]
  ~~~

  默认 directory 为 process.cwd()；所有相对路径先 resolve。未知命令、重复
  directory、缺少 option value 和非法 locale 返回 1，并向 stderr 输出 usage。
  main.ts 调用 runCli(process.argv.slice(2)) 并设置 process.exitCode，不在
  模块 import 时退出进程。

  成功 init 输出 Initialized project at ...；成功 validate 输出
  Project is valid: ...；diagnostic 输出固定格式
  <code> <path>: <message>，全部写 stderr。

- [ ] **Step 4: 运行 GREEN 和完整集成回归**

  Run: pnpm exec vitest run tests/integration/cli.test.ts

  Expected: 所有 CLI integration tests PASS。

  Run: pnpm qaw init --name "Checkout Service" /tmp/qaw-cli-smoke

  Expected: 创建 /tmp/qaw-cli-smoke/.ai-qa/project.yaml；随后使用同一目录运行
  pnpm qaw validate /tmp/qaw-cli-smoke 返回 0。

- [ ] **Step 5: Commit**

  ~~~bash
  git add apps/cli/src tests/integration/cli.test.ts apps/cli/package.json
  git commit -m "feat: add qaw init and validate commands"
  ~~~

### Task 6：添加架构检查、文档检查与离线 CI

**Files:**

- Test: tests/architecture/domain-boundary.test.ts
- Create: scripts/check-docs.ts
- Create: .github/workflows/ci.yml
- Modify: package.json（确认 check 脚本顺序）

**Interfaces:**

- Consumes: Task 1 的 Blueprint 文件和 Tasks 3–5 的源码。
- Produces: pnpm check:architecture、pnpm check:docs 和 GitHub Actions 离线
  quality gate。

- [ ] **Step 1: 写架构失败测试**

  tests/architecture/domain-boundary.test.ts 递归读取 packages/domain/src，
  对每个 .ts 文件检查以下 forbidden import pattern：node:fs、node:sqlite、
  yaml、zod、fastify、react、openai、anthropic、deepseek、gemini、mcp、github、
  jira、dsh、vitest、playwright。命中时断言失败并输出文件和 import。

- [ ] **Step 2: 运行 RED**

  Run: pnpm exec vitest run tests/architecture/domain-boundary.test.ts

  Expected: 在测试文件或实现尚未建立前，测试命令至少能被 Vitest 发现；先用一个
  临时 forbidden import fixture 验证断言会失败，再删除 fixture，确保测试不是
  恒真测试。

- [ ] **Step 3: 实现架构检查**

  只保留对真实 packages/domain/src 文件的检查，不扫描 dist、node_modules
  或测试目录。移除临时 fixture 后运行：

  Run: pnpm check:architecture

  Expected: PASS。

- [ ] **Step 4: 实现文档检查脚本**

  scripts/check-docs.ts 检查：根 LICENSE 存在并首行匹配 PolyForm；28 个
  Blueprint Markdown 文件存在；README.md 和 README.zh-CN.md 都包含
  qaw init、qaw validate；所有相对 Markdown link 指向现有文件，忽略
  http://、https://、#anchor 和 code block 内的文本。失败时打印具体文件和
  link，并以非零状态退出。

- [ ] **Step 5: 写离线 CI workflow**

  .github/workflows/ci.yml 使用 Node 20、pnpm cache 和
  pnpm install --frozen-lockfile，执行 pnpm check。触发条件为所有 pull request
  和 main push；权限只有 contents: read；不安装浏览器、不配置 LLM secret、不
  调用 provider。

- [ ] **Step 6: 运行完整质量 gate**

  Run: pnpm check

  Expected: format、lint、typecheck、build、unit、contract、integration、
  architecture 和 docs 全部 PASS。

- [ ] **Step 7: Commit**

  ~~~bash
  git add tests/architecture/domain-boundary.test.ts scripts/check-docs.ts .github/workflows/ci.yml package.json
  git commit -m "ci: add offline architecture and documentation gates"
  ~~~

### Task 7：同步公开文档并完成交付验证

**Files:**

- Modify: README.md
- Modify: README.zh-CN.md
- Modify: docs/en/MVP.md
- Modify: docs/zh-CN/MVP.md
- Modify: CHANGELOG.md
- Modify: FILE_INDEX.md

**Interfaces:**

- Consumes: Tasks 1–6 已验证的真实命令和文件契约。
- Produces: 对用户可直接阅读的双语启动说明，以及与当前实现相符的 changelog
  和文件索引。

- [ ] **Step 1: 更新英文入口**

  在 README.md 中增加当前 Bootstrap 状态和 Quick Start：

  ~~~text
  pnpm install
  pnpm qaw init ./example-project
  pnpm qaw validate ./example-project
  ~~~

  明确写出当前只实现 Project File Contract、qaw init 和 qaw validate；
  Agent Runtime、SQLite、UI、Provider、Evidence 和 Golden Path 仍在路线图中。

- [ ] **Step 2: 更新中文入口与双语 MVP**

  README.zh-CN.md、docs/en/MVP.md、docs/zh-CN/MVP.md 使用相同的命令和范围，
  但保持各自语言。不得把尚未实现的 qaw doctor、qaw open 或 AI Analysis
  写成已可用功能。

- [ ] **Step 3: 更新 changelog 和文件索引**

  在 CHANGELOG.md 的 Unreleased 区域记录 workspace、许可证、Project File
  Contract 和两个 CLI 命令；在 FILE_INDEX.md 增加 bootstrap 源码、测试和
  docs/superpowers 计划/spec 路径，同时保留 Blueprint 原有文件清单。

- [ ] **Step 4: 运行最终验证命令**

  Run: pnpm check

  Expected: exit code 0，无 lint、typecheck、test、architecture 或 docs failure。

  Run: git diff --check

  Expected: 无输出。

  Run: git status --short --branch

  Expected: 只显示当前分支及其与远程的已知提交差异；不留下未跟踪文件或未提交
  修改。

- [ ] **Step 5: 检查验收清单**

  逐项确认：

  ~~~text
  [ ] 28 个 Blueprint Markdown 文件已纳入
  [ ] LICENSE 为 PolyForm Noncommercial License 1.0.0
  [ ] Domain 无 forbidden dependency
  [ ] qaw init 创建 .ai-qa/project.yaml
  [ ] 第二次 init 不覆盖文件
  [ ] qaw validate 覆盖 missing/malformed/unsupported/unknown-key/invalid-value
  [ ] 所有测试离线运行
  [ ] EN/ZH 入口只宣传已实现能力
  [ ] pnpm check 通过
  [ ] git diff --check 通过
  ~~~

- [ ] **Step 6: Commit**

  ~~~bash
  git add README.md README.zh-CN.md docs/en/MVP.md docs/zh-CN/MVP.md CHANGELOG.md FILE_INDEX.md
  git commit -m "docs: document project bootstrap workflow"
  ~~~

## 执行方式

本计划在当前会话由主 agent 直接执行（Native）。每个 Task 完成后先运行该 Task
的验证命令，再进入下一 Task；最终以 pnpm check、git diff --check 和干净的
工作区状态作为交付依据。
