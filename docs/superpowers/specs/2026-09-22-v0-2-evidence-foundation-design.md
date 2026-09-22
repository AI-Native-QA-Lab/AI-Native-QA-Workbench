# v0.2 Evidence Foundation 设计

**状态：** 已确认，进入实现计划与实现

**日期：** 2026-09-22

**目标版本：** v0.2 Evidence Foundation

## 1. 背景与目标

v0.1 已经完成 Local-first Quality Domain、Project Store、Traceability、
Agent/QA Task Loop、ChangeProposal、CLI、Workbench 和确定性 Golden Path。
v0.1 明确不实现 `TestRun`、`Evidence` 和 Evidence 执行结果。

v0.2 只补齐 Evidence Foundation：把本地测试结果导入为可校验、可追溯、
可验证完整性的项目质量数据，同时保留现有 v0.1 项目的兼容性。

本设计必须满足：

1. Evidence 元数据属于 `.ai-qa/` Project Quality Source of Truth，不进入
   SQLite Runtime Store。
2. 原始 artifact 保存在项目目录内，元数据引用使用可移植的相对路径。
3. 适配器只解析不写文件；文件写入只由 application/store 层负责。
4. checksum 完整性与 provenance 可信度是两个独立概念。
5. 核心流程离线、确定性、不依赖真实 LLM、CI 或远程服务。
6. 不把导入结果自动升级为 QualityAssessment、QualityGate 或 coverage 结论。

## 2. 范围

### 2.1 本版本实现

- `packages/domain` 中的 `TestRun`、`TestResult`、`Evidence`、
  `ArtifactReference`、`EvidenceProvenance` 和纯校验器；
- 独立的 Evidence File Contract；
- `.ai-qa/evidence.yaml` 和 `.ai-qa/evidence/` 文件存储；
- JUnit XML、Playwright JSON Reporter、Pytest JSON Report 三种离线导入适配器；
- artifact 字节大小、SHA-256、路径安全和完整性验证；
- `qaw evidence import` 和 `qaw evidence verify`；
- `qaw validate` 对 Evidence 元数据和跨文件引用的检查；
- `qaw doctor` 对 artifact 的 checksum 重新计算；
- Domain、Contract、Adapter、Store、CLI、安全边界和失败恢复测试；
- 英文 canonical 契约、中文镜像、ADR-005 草案、Roadmap 和开发记录更新。

### 2.2 明确不实现

- `QualityAssessment`、`QualityGate`、`HumanDecision`；
- Domain Event 和完整 Quality Engineering Loop；
- Evidence coverage、quality gap、completeness score 和自动质量结论；
- TestCase 的自动名称匹配或自动 TraceLink；
- UI Evidence 页面和 Server API；
- GitHub、Jira、CI 远程连接和外部 artifact URL；
- Agent Tool 形式的 Evidence Import；
- artifact 删除策略、去重存储、签名和密码学来源证明；
- 对历史 `quality.yaml` 的 schema 升级。

## 3. 兼容性与文件边界

### 3.1 增量文件布局

现有文件保持不变：

```text
.ai-qa/project.yaml       schemaVersion: "0.1"
.ai-qa/quality.yaml       schemaVersion: "0.1"
```

v0.2 新增：

```text
.ai-qa/evidence.yaml      schemaVersion: "0.2"
.ai-qa/evidence/          imported artifact root
```

`evidence.yaml` 是可选文件。没有该文件时，Project Store 返回一个有效的空
`EvidenceSnapshot`，因此 v0.1 项目无需迁移即可继续使用。

### 3.2 Evidence 文件形状

顶层只允许 `schemaVersion` 和 `evidence`；`evidence` 只允许
`testRuns` 和 `evidenceRecords`：

```yaml
schemaVersion: "0.2"
evidence:
  testRuns: []
  evidenceRecords: []
```

未知 key、错误 schema version、非数组集合、重复 ID、错误字段类型和坏的
本地引用都必须返回机器可读诊断。Serializer 使用固定字段顺序、稳定数组顺序
并始终以换行结束。

Evidence 相关诊断使用独立的 `EVIDENCE_*` code 命名空间，至少覆盖：
`EVIDENCE_FILE_MALFORMED`、`EVIDENCE_UNKNOWN_KEY`、
`EVIDENCE_SCHEMA_UNSUPPORTED`、`EVIDENCE_REFERENCE_NOT_FOUND`、
`EVIDENCE_ARTIFACT_MISSING`、`EVIDENCE_ARTIFACT_SIZE_MISMATCH`、
`EVIDENCE_ARTIFACT_CHECKSUM_MISMATCH`、`EVIDENCE_ARTIFACT_ORPHAN`、
`EVIDENCE_INPUT_TOO_LARGE`、`EVIDENCE_FORMAT_UNSUPPORTED`、
`EVIDENCE_IMPORT_CONFLICT` 和 `EVIDENCE_REVISION_CONFLICT`。

### 3.3 Source of Truth

- `evidence.yaml` 保存 TestRun、Evidence、provenance 和 artifact metadata；
- `.ai-qa/evidence/` 保存原始 artifact 字节；
- SQLite 不保存 Evidence metadata，也不保存唯一的 TestRun 状态；
- 未被 `evidence.yaml` 引用的文件不算 Evidence，只能作为 orphan artifact 被
  verify 报告。

## 4. Domain 模型

### 4.1 TestRun 与 TestResult

`TestRun` 表示一次从外部测试结果导入的执行观察。`TestResult` 是嵌套值对象，
不是独立持久化集合：

```ts
export const EVIDENCE_SCHEMA_VERSION = "0.2" as const;

export type TestRunStatus = "passed" | "failed" | "skipped" | "error" | "incomplete";

export type TestResultStatus = "passed" | "failed" | "skipped" | "error" | "unknown";

export type EvidenceFormat = "junit" | "playwright-json" | "pytest-json";

export interface TestResult {
  name: string;
  status: TestResultStatus;
  durationMs?: number;
  testCaseId?: string;
}

export interface TestRun {
  id: string;
  format: EvidenceFormat;
  status: TestRunStatus;
  startedAt?: string;
  completedAt?: string;
  results: TestResult[];
}
```

约束：

- `id` 使用现有 locale-neutral kebab-case ID 规则；显式传入的 `runId` 也使用
  同一规则；
- `name` 必须是非空字符串，原始 Unicode 内容保留；
- `durationMs` 为非负整数；
- 时间字段存在时使用带时区的 RFC 3339 字符串，持久化时统一 UTC；
- 外部报告没有开始/完成时间时保持字段缺失，不用导入时间伪造执行时间；
- `completedAt` 与 `startedAt` 同时存在时，`completedAt` 不得早于 `startedAt`；
- `testCaseId` 可为空。存在时，Project Store 的跨文件校验必须确认它在
  `quality.yaml` 的 `testCases` 中存在；
- 适配器不得因为外部测试名称相似而自动设置 `testCaseId`；
- `status` 是导入器生成的规范化结果，不是 QualityGate 判断；其计算规则固定为：
  任一 `error` 得到 `error`，否则任一 `failed` 得到 `failed`，全部 `skipped`
  得到 `skipped`，存在 `unknown` 或没有结果得到 `incomplete`，其余得到 `passed`。

### 4.2 ArtifactReference

```ts
export interface ArtifactReference {
  id: string;
  relativePath: string;
  mediaType: string;
  sizeBytes: number;
  sha256: string;
}
```

约束：

- `relativePath` 必须相对于 `.ai-qa/evidence/`；
- 禁止绝对路径、空路径、`.`、`..`、路径穿越、NUL 字节和 symlink 逃逸；
- `sha256` 必须是 64 位小写十六进制字符串；
- `sizeBytes` 必须与实际 artifact 字节数一致；
- `ArtifactReference.id` 在 EvidenceSnapshot 内唯一，`relativePath` 也必须唯一；
- Artifact metadata 不声明签名，也不声称证明 provenance 真实。

### 4.3 Evidence 与 Provenance

```ts
export type EvidenceKind = "test-result";

export type EvidenceTrust = "unverified" | "trusted" | "human-recorded";

export interface EvidenceProvenance {
  sourceFormat: EvidenceFormat;
  sourceFileName: string;
  importedAt: string;
  trust: EvidenceTrust;
  runnerName?: string;
  runnerVersion?: string;
}

export interface Evidence {
  id: string;
  testRunId: string;
  kind: EvidenceKind;
  artifact: ArtifactReference;
  provenance: EvidenceProvenance;
}

export interface EvidenceSnapshot {
  schemaVersion: typeof EVIDENCE_SCHEMA_VERSION;
  testRuns: TestRun[];
  evidenceRecords: Evidence[];
}
```

语义边界：

- `trust` 是来源声明，不是 checksum 结果；
- v0.2 三种导入适配器默认生成 `unverified`；
- v0.2 没有 CLI `--trusted` 快捷开关，也没有自动 CI trust；
- `qaw evidence verify` 返回计算出的 artifact integrity，不修改 `trust`；
- AI 推理、模型输出、分析文本和 Proposal 不是执行 Evidence；
- `Evidence.provenance.sourceFormat` 必须与所引用 TestRun 的 `format` 一致；
- `sourceFileName` 只能是非空 basename，不得包含 `/`、`\\`、NUL 或绝对路径；
- `Evidence.testRunId` 必须在同一 EvidenceSnapshot 中解析到 TestRun；
- 同一 EvidenceSnapshot 内 `testRuns.id` 和 `evidenceRecords.id` 各自唯一，且
  `Evidence.artifact.id` 与 `relativePath` 也各自唯一。

## 5. 校验层次

### 5.1 Domain 校验

纯函数只检查 EvidenceSnapshot 内部结构：schema version、字段类型、ID、
时间、状态、重复 ID、TestRun 引用和 artifact metadata 形状。它不访问文件系统，
不读取 `quality.yaml`，不计算真实 checksum。

### 5.2 Evidence File 校验

Project Store 负责 YAML 解析、严格 key 检查、Domain 校验和稳定序列化。
Evidence 文件缺失视为空 snapshot；文件存在但 malformed 必须失败关闭。

### 5.3 Project 跨文件校验

`validateEvidence(rootDirectory)` 同时加载：

1. `quality.yaml` 的 `testCases`；
2. `evidence.yaml` 的 TestRun 和 Evidence；
3. `evidence/` 下被引用的 artifact metadata。

它校验引用存在、路径安全、artifact 文件存在和 manifest 中的元数据形状，
但不重新计算全部 artifact bytes。完整 size/checksum 检查由 `verifyEvidence`
完成；orphan 扫描也只由 verify 完成。

Evidence Store 对外提供以下最小边界：

```ts
interface EvidenceStore {
  readEvidence(rootDirectory: string): Promise<EvidenceValidationResult>;
  validateEvidence(rootDirectory: string): Promise<EvidenceValidationResult>;
  writeEvidence(
    rootDirectory: string,
    snapshot: EvidenceSnapshot,
    expectedRevision: string | null,
  ): Promise<EvidenceWriteResult>;
}
```

`readEvidence` 和 `validateEvidence` 在文件缺失时返回空 snapshot 与
`revision: null`；文件存在时 revision 是 manifest 原始 UTF-8 字节的 SHA-256。
创建操作重新检查时仍必须要求 revision 为 `null`，不能把“文件不存在”当成
无条件覆盖许可。

```ts
interface EvidenceValidationResult {
  valid: boolean;
  evidence?: EvidenceSnapshot;
  revision: string | null;
  diagnostics: readonly StoreDiagnostic[];
}

interface EvidenceWriteResult {
  written: boolean;
  evidencePath: string;
  revision?: string;
  diagnostics: readonly StoreDiagnostic[];
}
```

两个结果类型的诊断字段沿用现有 Project Store 的 `StoreDiagnostic` 形状。

## 6. Adapter 设计

### 6.1 适配器边界

`packages/evidence` 提供纯解析接口。适配器接收内存中的 UTF-8 文本或字节，
返回规范化 TestRun 和原始 artifact 描述；不接收 project root，不执行命令，
不访问网络，不调用 provider，不直接写 `.ai-qa/`。

其输出是非持久化的 application value：

```ts
export interface ParsedEvidenceImport {
  testRun: TestRun;
  artifact: {
    bytes: Uint8Array;
    sourceFileName: string;
    mediaType: string;
  };
}
```

Store 根据 `bytes` 重新计算 size/SHA-256 并生成 `ArtifactReference`，adapter
不能自行声明持久化 checksum。

单次导入的原始输入上限为 16 MiB；超过上限必须在解析前失败。这个限制只约束
v0.2 的 test-result import，不代表未来视频或大型 artifact 的上限。

格式必须由调用方显式指定，不根据文件名或内容猜测。

### 6.2 支持格式

| format            | 输入                          | v0.2 边界                                                      |
| ----------------- | ----------------------------- | -------------------------------------------------------------- |
| `junit`           | JUnit XML                     | 禁止外部实体；支持 suite/case、failure/error/skipped、duration |
| `playwright-json` | Playwright JSON Reporter 输出 | 读取 suite/spec/test/result 的名称、状态和 duration            |
| `pytest-json`     | Pytest JSON Report 输出       | 读取 nodeid、outcome、duration                                 |

超出支持子集的字段可被忽略，但核心字段缺失、类型错误、重复结构冲突和坏格式
必须失败，不得伪造 passed。

### 6.3 导入 ID 与幂等

- CLI 未提供 `runId` 时，使用 `run-${format}-${原始 artifact SHA-256}` 生成稳定 run ID；
- Store 使用 `evidence-${runId}-${sha256 前 16 位}` 生成 Evidence ID，使用
  `artifact-${完整 SHA-256}` 生成 Artifact ID，并为 artifact 生成不含用户路径的安全存储路径；
- 同一 ID、同一 artifact checksum 且规范化内容一致时，重复导入是幂等成功；
- 同一 ID 对应不同 checksum 或不同规范化 TestRun 时，返回冲突且不写文件；
- 外部测试名称保留原文，不把名称直接当作持久化 ID。

## 7. 写入、原子性与权限

### 7.1 用户 CLI 写入

`qaw evidence import` 是用户主动执行的 application command。适配器和 parser
本身没有写权限；只有 Evidence Store 能够写入 artifact 和 `evidence.yaml`。

v0.2 不把该能力暴露为 Agent Tool。若未来 Agent/Tool 使用该能力，必须增加
ChangeProposal、Validation、Human Review 和 Apply 边界；本版本不绕过既有规则。

### 7.2 安全写入顺序

1. 校验 Project、QualitySnapshot 和现有 EvidenceSnapshot；
2. 解析输入并构造规范化 TestRun；
3. 将 artifact 写入 `.ai-qa/evidence/.tmp/`；
4. 重新计算 SHA-256 和 size，生成 ArtifactReference；
5. 将临时 artifact 原子移动到生成的安全路径；
6. 在内存中追加 Evidence metadata 并执行全部校验；
7. 用同目录临时文件原子替换 `evidence.yaml`；
8. 重新加载 Evidence 文件并验证。

导入服务在读取 manifest 时计算当前 revision，并在替换前再次确认 revision
没有变化；发生并发修改时返回 `EVIDENCE_REVISION_CONFLICT`，不覆盖其他写入。

如果 metadata 写入失败，旧 manifest 保持有效，临时文件必须清理。进程在 artifact
移动后、manifest 提交前崩溃时可能留下未引用 artifact；它不构成 Evidence，verify
必须报告 orphan（排除 `.tmp/` 和当前导入的临时文件），而不是自动删除用户文件。

## 8. CLI 行为

```text
qaw evidence import <report-file> --format junit|playwright|pytest [--run-id <id>] [directory]
qaw evidence verify [directory]
```

- CLI 的 `playwright` 和 `pytest` 是 `playwright-json`、`pytest-json` 的简写；
  Domain 和 Evidence File Contract 只持久化 canonical format value；
- `import` 支持可选的 `--run-id <id>`；未提供时使用规范化原始 artifact SHA-256
  生成稳定 ID；
- `import` 成功返回新建或幂等复用的 run/evidence ID；
- `import` 失败返回非零退出码并且不修改旧 manifest；
- `verify` 只读并报告 metadata、missing artifact、size mismatch、checksum mismatch
  和 orphan artifact；
- `qaw validate` 检查项目、quality 和 evidence metadata；
- `qaw doctor` 在 validate 之后执行 checksum verify；
- CLI 不展示 Quality Score，不自动创建 QualityAssessment 或 QualityGate。

Evidence 命令的退出码固定为：`0` 表示成功，`1` 表示项目/数据/完整性/并发冲突
失败，`2` 表示命令语法或不支持的 format；现有 v0.1 命令的退出码保持不变。

## 9. 测试与验收

### 9.1 Domain 与 Contract

- 合法空 EvidenceSnapshot 和带结果 snapshot；
- malformed runtime input 不抛异常，返回有序 machine-readable diagnostics；
- ID、状态、时间、duration、checksum、路径和重复 ID 边界；
- Evidence 引用不存在 TestRun、跨文件不存在 TestCase；
- unknown key、坏 YAML、坏 schema version、非数组集合；
- serializer/parser round-trip 和稳定字段顺序。

### 9.2 Adapter

- 每种格式的最小 passed/failed/skipped/error fixture；
- malformed XML/JSON、缺失核心字段、冲突状态；
- JUnit 外部实体和危险 XML 输入；
- 超过输入大小上限；
- 结果名称、Unicode、duration 和空 suite；
- 显式 format，不做错误格式猜测；
- 相同 bytes 得到稳定 ID，重复导入幂等。

### 9.3 Store、完整性与 CLI

- artifact 写入和 manifest 写入均使用临时文件加原子 rename；
- checksum mismatch、size mismatch、missing artifact、orphan artifact；
- 路径穿越、绝对路径、NUL、symlink；
- metadata 写失败不损坏旧 manifest；
- stale/conflicting import 不产生部分 Evidence；
- `qaw evidence import` 与 `qaw evidence verify` 的退出码和诊断；
- 现有 v0.1 CLI、API、UI、Golden Path 回归不受影响。

### 9.4 完成门禁

- 受影响的 RED/GREEN 测试全部通过；
- `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test`、
  `pnpm check:architecture`、`pnpm check:docs` 通过；
- 受 UI/MVP flow 影响时运行 `pnpm test:e2e`；本版本不新增 UI flow，仍执行现有
  E2E 回归并单独报告结果；
- 英文 canonical Evidence Contract 与中文镜像一致；
- 不把 imported/unverified Evidence 描述为真实生产或外部业务验收证据。

## 10. 架构影响

预计新增或修改：

- `packages/domain`：Evidence 类型、校验器和 exports；
- `packages/evidence`：适配器和纯导入模型；
- `packages/project-store`：Evidence File Contract、跨文件校验和文件写入；
- `packages/application`：Evidence Import/Verify application service；
- `apps/cli`：两个 Evidence 命令；
- `tests/unit`、`tests/contract`、`tests/integration`、`tests/architecture`；
- `docs/en/contracts/EVIDENCE_CONTRACT.md`；
- `docs/zh-CN/contracts/EVIDENCE_CONTRACT.md`；
- `docs/adr/ADR-005-evidence-first-class-entity.md`；
- `docs/en/ROADMAP.md`、`docs/zh-CN/ROADMAP.md` 和开发记录。

不允许把文件系统、YAML、XML、Playwright、Pytest 或任何 provider 依赖引入
`packages/domain`。

## 11. 后续实现顺序

实现计划必须拆成可独立 RED/GREEN 的任务，顺序固定为：

1. Evidence Domain Contract 与纯校验器；
2. Evidence File Contract 与 Project Store 读写；
3. 纯 Adapter 接口及三种格式解析；
4. Import/Verify application service 与完整性边界；
5. CLI 命令和用户可见诊断；
6. 全量架构、回归、文档和双语契约门禁。

每个任务完成前必须观察到测试 RED，再实现最小行为并验证 GREEN。
