# 仓库启动与项目文件契约设计

**状态：** 已在对话中批准；尚未开始实现。

## 目标

将 `ai-native-qa-workbench` 启动为一个真实、可测试的仓库：纳入 GitHub
Blueprint，建立 Local-first TypeScript workspace，并交付第一条可执行的
垂直切片：`qaw init` 创建有效的 `.ai-qa/project.yaml`，`qaw validate`
报告该项目文件是否符合 Project File Contract。

## 理解与输入边界

用户请求是基于附带的 GitHub Blueprint 启动项目，并采用 PolyForm
Noncommercial License 1.0.0。附带的 Markdown 方案包属于设计输入：其中的
`AGENTS.md`、contracts、roadmap、开发计划、模板和双语文档会在复制到仓库后
成为仓库级工程指导。这些文档并不授权在本次变更中一次性实现全部 v0.1 或
v1.0 能力。

之前粘贴的仓库目录树描述的是长期目标形态。它不是一个完整的源代码仓库，
也不覆盖附带 Blueprint 中具体的 28 个文档。因此，本设计只创建第一条垂直
切片所需的 package；未来的 app 和 package 必须在各自的 contract 与测试
准备好后再引入。

## 范围

### 包含内容

- 将 28 个 Markdown Blueprint 文档和 `.github` 模板复制到仓库，排除生成的
  `.DS_Store` 文件。
- 在仓库根目录添加请求的 PolyForm Noncommercial License 1.0.0 文本，文件名
  为 `LICENSE`。
- 建立使用 pnpm 的 workspace，以及 Turborepo、TypeScript、Vitest、格式化、
  lint/typecheck 脚本和确定性的本地 CI。
- 添加纯 TypeScript 的 `@ai-native-qa-workbench/domain` package，实现第一版
  Project contract 与 diagnostics model。
- 添加 `@ai-native-qa-workbench/project-store`，负责 YAML 解析、校验、确定性
  序列化和项目文件的原子创建。
- 添加 `apps/cli`，实现 `qaw init` 和 `qaw validate`。
- 为本切片中的行为添加 unit、contract、integration、architecture 和文档检查。
- 更新英文和中文入口文档，说明可执行的 bootstrap 命令以及当前明确受限的
  实现范围。

### 明确排除

- React/Vite workbench UI、Fastify server、SQLite runtime store、agent loop、
  QA Task Loop、providers、tools、skills、evidence adapters、integrations、
  PostgreSQL，以及除 init/validate 切片之外的 Golden Path E2E。
- 对 `.ai-qa/` 的直接 AI 写入；本切片不包含 AI mutation path。
- 创建 GitHub 仓库、milestones、issues、releases、tags、push 或 pull requests。
- 对用户已有 `dsh-qa` 仓库的任何修改。这是一个拥有独立 domain 和文件契约的
  新仓库。

## 架构

第一条切片采用单向依赖图：

```text
apps/cli
  -> packages/project-store
       -> packages/domain
```

`domain` 只包含 TypeScript values 和 pure functions。它不得导入 filesystem、
YAML、SQLite、Fastify、React、provider SDK、MCP、GitHub、Jira、DSH 或测试框架
代码。

`project-store` 负责 `.ai-qa/project.yaml` 与 domain object 之间的边界。它是
本切片中唯一允许访问 filesystem 的 package，负责解析、schema 校验、诊断转换、
canonical 序列化和原子写入。

`apps/cli` 将命令行参数转换为 store 调用，并把 diagnostics 映射为稳定、易读的
输出和退出码。它不得包含 domain 校验规则或 YAML 解析规则。

根 workspace 只负责共享工具链。本切片中任何 application package 都不得使用
runtime SQLite 或未来的 provider 层。

## Project File Contract v0.1

第一份项目文件是 `.ai-qa/project.yaml`：

```yaml
schemaVersion: "0.1"
project:
  id: "example-project"
  name: "Example project"
  description: ""
  defaultLocale: "en"
```

该 contract 包含以下不变量：

1. `schemaVersion` 必须严格等于受支持的字符串 `"0.1"`。
2. `project.id` 必须是非空的 kebab-case 标识符，并匹配
   `^[a-z0-9]+(?:-[a-z0-9]+)*$`。
3. `project.name` 必须是非空的人类可读字符串。
4. `project.description` 必须是字符串，也可以为空。
5. `project.defaultLocale` 只能是 `en` 或 `zh-CN`。
6. 顶层未知 key 和 `project` 下的未知 key 都必须拒绝，防止 schema 漂移后
   静默变成项目数据。
7. 有效文件必须使用稳定的 key 顺序序列化，并以换行符结尾。

domain representation 除显式约定的 locale 值外保持 locale-neutral：

```ts
export type ProjectLocale = "en" | "zh-CN";

export interface Project {
  schemaVersion: "0.1";
  id: string;
  name: string;
  description: string;
  defaultLocale: ProjectLocale;
}
```

## Domain interfaces

第一版 package 暴露的 contract 等价于：

```ts
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

export function validateProject(project: Project): ValidationResult;
export function deriveProjectId(directoryName: string): string;
```

`deriveProjectId` 将目录名规范化为小写 kebab-case；如果没有任何有效片段，
则回退为 `project`。它只用于生成初始项目，并需要单独测试。

## Project Store interfaces

store package 通过一个小型 interface 管理 filesystem effects：

```ts
export interface ProjectStore {
  initProject(input: {
    rootDirectory: string;
    name?: string;
    description?: string;
    defaultLocale?: ProjectLocale;
  }): Promise<InitProjectResult>;

  validateProject(rootDirectory: string): Promise<StoreValidationResult>;
}
```

行为规则：

- `initProject` 只有在项目文件不存在时，才创建 `.ai-qa/` 和
  `project.yaml`。
- 已存在的项目文件绝不能被 `init` 覆盖；命令必须返回 diagnostic 并使用非零
  退出状态。
- store 通过同目录临时文件和原子 rename 写入。写入失败时必须清理临时文件。
- `validateProject` 必须区分文件缺失、YAML 格式错误、不支持的 schema 版本、
  schema 违反和有效项目，并使用稳定的 diagnostic code。
- validation operation 绝不能修改 `.ai-qa/`。
- 只有校验成功后，store 才能返回解析后的 domain data。

实现可以在该边界使用 YAML 和 schema library，但这些依赖不得进入 `domain`。

store-level diagnostics 在 domain validation code 之外增加以下稳定 code：
`PROJECT_FILE_MISSING`、`PROJECT_FILE_MALFORMED` 和 `PROJECT_FILE_EXISTS`。
文件级错误的 path 为 `.ai-qa/project.yaml`；schema 错误使用对应的 YAML path。

## CLI contract

支持的命令：

```text
qaw init [--name <name>] [--description <description>]
         [--locale en|zh-CN] [directory]
qaw validate [directory]
```

默认 directory 为当前工作目录。命令向 stdout 输出简短的成功信息，向 stderr
输出 diagnostics。成功使用退出码 `0`；用户输入或项目校验错误使用退出码 `1`。
未知命令或格式错误的 option 也使用退出码 `1`，并输出 usage diagnostic。不允许
网络访问。

开发阶段通过 workspace script 调用 CLI，`apps/cli` 将其打包为 `qaw`。后续版本
可以添加 `doctor` 和 `open`，但本切片不得将它们宣传为已实现命令。

## 测试与验证设计

测试顺序遵循 contract-first：

1. Domain tests 固定项目不变量、diagnostics、locale 处理和 ID 派生行为。
2. Project-store contract tests 固定 YAML 解析、未知 key 拒绝、缺失/格式错误
   文件 diagnostics、canonical round trip 和原子创建行为。
3. CLI integration tests 在临时目录中执行真实命令，并断言文件、stdout/stderr
   和退出码。
4. Architecture tests 检查 package imports；如果 `domain` 导入被禁止的 runtime
   boundary，测试必须失败。
5. Documentation checks 验证所有内部 Markdown link 可解析，并验证英文/中文入口
   包含相同的当前命令。

每个行为都遵循 RED → 最小 GREEN → REFACTOR。完整本地 gate 包含 lint、typecheck、
architecture checks、unit/contract/integration tests 和 documentation checks。
核心 CI 保持离线，不要求 LLM。

## 文档、许可证与交付

- 附带 Blueprint 仍然是仓库治理文档的来源；复制后的文件不得被静默改写成另一套
  产品计划。
- `README.md` 是英文入口，`README.zh-CN.md` 是中文对应入口。两者只描述本切片
  已交付的命令。
- `AGENTS.md` 复制到仓库根目录后，对未来变更具有约束力。
- `LICENSE` 包含请求的 PolyForm Noncommercial License 1.0.0。
- 本设计文件是 `docs/superpowers/specs/` 下的内部实现文档，不替代公开的
  Blueprint 文档。

## 验收标准

只有以下条件全部验证通过，才能认为本设计已经实现：

- 全新 checkout 可以通过 pnpm 安装；测试运行不需要真实模型或网络请求。
- `qaw init` 创建文档中规定的 `.ai-qa/project.yaml`，第二次 init 不覆盖已有
  文件。
- `qaw validate` 接受生成的项目，并针对缺失、格式错误、不支持的 schema、未知
  key 和违反不变量的项目文件返回可操作的 diagnostics。
- domain package 通过 architecture boundary check。
- package 的 unit、contract 和 CLI integration tests 通过。
- 内部文档 link 和 EN/ZH bootstrap instructions 检查通过。
- `git diff --check` 干净，且请求的许可证存在于仓库根目录。
