# v0.2 Evidence Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**目标：** 在不破坏 v0.1 Project Store、Runtime Store、CLI、Server、UI 和 Golden Path 的前提下，交付 v0.2 Evidence Foundation：把本地 JUnit XML、Playwright JSON Reporter 和 Pytest JSON Report 导入为可校验、可追溯、可验证完整性的 .ai-qa/ 项目质量数据。

**架构：** packages/domain 保持纯 TypeScript，只定义 Evidence 模型、状态推导和快照内部校验；packages/evidence 只解析内存中的报告，不访问文件系统或执行写入；packages/project-store 负责 Evidence File Contract、质量文件跨引用、artifact 原子写入和完整性验证；packages/application 编排导入、幂等、冲突和校验流程；apps/cli 只负责参数解析、退出码和用户可见诊断。Evidence metadata 继续以 .ai-qa/evidence.yaml 为 Source of Truth，原始报告以相对路径保存在 .ai-qa/evidence/，SQLite 不新增 Evidence 表。

**技术栈：** TypeScript、Node.js 22、pnpm workspace、YAML、Zod、saxes、Vitest、现有 FileProjectStore 和 CLI。新增 XML 解析依赖只放在 packages/evidence，不得进入 Domain。

**规格：** docs/superpowers/specs/2026-09-22-v0-2-evidence-foundation-design.md

## 全局约束

- 按 Contract → Behavior → RED → Minimal Implementation → GREEN → REFACTOR → Architecture Check → Regression → Documentation 执行；每个任务都必须先观察到对应测试失败，再实现最小行为。
- 每个任务只修改任务文件清单中的路径，并在该任务末尾创建一个独立提交；不使用 git add .。
- packages/domain 不得导入 node:*、文件系统、SQLite、YAML、Zod、XML parser、Fastify、React、Provider SDK、MCP、GitHub、Jira、Playwright 或 Vitest。
- packages/evidence 接收 Uint8Array 和显式 canonical format，只返回内存值；不接受项目根目录，不读取报告文件，不执行命令，不访问网络，不写 .ai-qa/。
- .ai-qa/evidence.yaml 缺失时必须返回有效空快照；已存在但 malformed、unknown key、schemaVersion 错误或引用断裂时必须 fail closed。
- quality.yaml 继续使用 schemaVersion "0.1"；Evidence 使用 schemaVersion "0.2"；不引入迁移，不把 Evidence metadata 写入 SQLite。
- trust 与 checksum integrity 始终分离。三个适配器默认写入 unverified，CLI 不提供 --trusted，verify 不修改 trust。
- 不自动匹配 TestCase，不自动创建 TraceLink、QualityAssessment、QualityGate、HumanDecision、coverage、quality gap 或 Quality Score。
- 只有 application/store 层可以写入 .ai-qa/；适配器、parser、Domain 和未来 Agent Tool 都不得直接写入。本版本不暴露 Evidence Import Agent Tool。
- 所有相对 artifact 路径必须以 .ai-qa/evidence/ 为根进行安全解析；拒绝绝对路径、空路径、.、..、路径穿越、NUL 和 symlink 逃逸。实现阶段对 manifest 引用的 symlink 直接拒绝，以避免校验后替换的 TOCTOU 风险。
- 所有新诊断使用稳定的 EVIDENCE_* machine code；诊断顺序按校验阶段和集合顺序稳定输出，不能依赖对象枚举的偶然顺序。
- import 的 16 MiB 限制必须在 parser 运行前检查；解析失败、数据冲突、并发冲突或完整性失败都不得修改旧的 evidence.yaml。
- 现有 v0.1 命令、API、UI、.ai-qa/project.yaml、.ai-qa/quality.yaml 和 Golden Path 需要保留原行为；本版本不新增 UI Evidence 页面或 Server Evidence API。
- 任何无法运行的验证都必须在最终交付中单独标记为 NOT_RUN 或 BLOCKED，不能用静态检查替代真实流程证据。

## Review Focus

- Domain 是否只做结构校验，且不会把缺少结果误判为 passed；持久化的 TestRun.status 是否始终等于结果推导值。
- TestRun 状态优先级是否固定为 error > failed > skipped > incomplete > passed，其中 unknown 和空结果为 incomplete。
- Evidence File Contract 是否严格拒绝未知 key、坏 schema、错误类型、重复 ID 和坏引用，并保持稳定序列化。
- testCaseId 是否只做跨文件存在性校验，不做名称相似度推断。
- artifact 是否始终由 store 重新计算 byte size 和 SHA-256；manifest 声称的 checksum 不得直接信任。
- 相同 run ID 的相同 normalized content 是否幂等；相同 run ID 的不同 checksum 或不同 normalized TestRun 是否冲突且无部分写入。
- manifest revision 是否在写入前后检查；stale revision 是否返回 EVIDENCE_REVISION_CONFLICT，不覆盖其他修改。
- artifact 移动后 manifest 提交失败留下的未引用文件是否只被 verify 报告为 orphan，不被自动删除。
- verify 是否先执行 project/quality/evidence metadata 校验，再执行真实 artifact checksum/orphan 扫描。
- XML 外部实体、超大输入、绝对路径、NUL、路径穿越和 symlink 是否全部有回归测试。
- qaw validate 是否只做 metadata/cross-file 校验，qaw evidence verify 和 qaw doctor 是否才做真实 checksum/orphan 扫描。
- 是否没有把 imported/unverified Evidence 描述成生产验收或业务质量结论。

## 任务依赖与顺序

执行顺序固定为：

1. Contract 文档、ADR 和 Evidence Domain；
2. Evidence File Contract 和 manifest store；
3. 三种纯解析适配器；
4. artifact integrity、Import/Verify application service；
5. CLI 命令和 v0.1 命令兼容；
6. 架构回归、双语文档状态和全量 Gate。

任务 2 消费任务 1 导出的 Domain 类型，任务 3 消费任务 1 的 Domain 类型，任务 4 同时消费任务 2 和任务 3，任务 5 消费任务 4 的 application API。不能并行实现这些任务。

---

## Task 1：冻结 Evidence Contract、ADR 和纯 Domain 行为

### Files

- Create: docs/en/contracts/EVIDENCE_CONTRACT.md
- Create: docs/zh-CN/contracts/EVIDENCE_CONTRACT.md
- Create: docs/adr/ADR-005-evidence-first-class-entity.md
- Modify: docs/en/contracts/CORE_CONTRACT_INDEX.md
- Modify: docs/zh-CN/contracts/CORE_CONTRACT_INDEX.md
- Modify: packages/domain/src/project.ts
- Create: packages/domain/src/evidence-domain.ts
- Modify: packages/domain/src/index.ts
- Create: tests/unit/domain/evidence-domain.test.ts

### Interfaces consumed and produced

The task consumes the existing isValidKebabCaseId, Diagnostic, DiagnosticCode, and ValidationResult definitions from packages/domain/src/project.ts.

It produces these exact public exports from @ai-native-qa-workbench/domain:

```ts
export const EVIDENCE_SCHEMA_VERSION = "0.2" as const;

export type TestRunStatus = "passed" | "failed" | "skipped" | "error" | "incomplete";
export type TestResultStatus = "passed" | "failed" | "skipped" | "error" | "unknown";
export type EvidenceFormat = "junit" | "playwright-json" | "pytest-json";
export type EvidenceKind = "test-result";
export type EvidenceTrust = "unverified" | "trusted" | "human-recorded";

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

export interface ArtifactReference {
  id: string;
  relativePath: string;
  mediaType: string;
  sizeBytes: number;
  sha256: string;
}

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

export function deriveTestRunStatus(results: readonly TestResult[]): TestRunStatus;
export function validateEvidenceSnapshot(input: unknown): ValidationResult;
```

Extend DiagnosticCode with the Evidence codes used by Domain: EVIDENCE_SCHEMA_UNSUPPORTED, EVIDENCE_TEST_RUNS_INVALID, EVIDENCE_RECORDS_INVALID, EVIDENCE_TEST_RUN_ID_INVALID, EVIDENCE_FORMAT_INVALID, EVIDENCE_TEST_RESULT_NAME_EMPTY, EVIDENCE_TEST_RESULT_STATUS_INVALID, EVIDENCE_TEST_RESULT_DURATION_INVALID, EVIDENCE_TEST_RESULT_TEST_CASE_ID_INVALID, EVIDENCE_TEST_RUN_STATUS_INVALID, EVIDENCE_TEST_RUN_RESULTS_INVALID, EVIDENCE_TEST_RUN_TIME_INVALID, EVIDENCE_TEST_RUN_TIME_ORDER_INVALID, EVIDENCE_DUPLICATE_TEST_RUN_ID, EVIDENCE_DUPLICATE_RECORD_ID, EVIDENCE_REFERENCE_NOT_FOUND, EVIDENCE_ARTIFACT_ID_INVALID, EVIDENCE_ARTIFACT_PATH_INVALID, EVIDENCE_ARTIFACT_MEDIA_TYPE_INVALID, EVIDENCE_ARTIFACT_SIZE_INVALID, EVIDENCE_ARTIFACT_CHECKSUM_INVALID, EVIDENCE_DUPLICATE_ARTIFACT_ID, EVIDENCE_DUPLICATE_ARTIFACT_PATH, EVIDENCE_PROVENANCE_FORMAT_MISMATCH, EVIDENCE_PROVENANCE_FILE_NAME_INVALID, EVIDENCE_PROVENANCE_TIME_INVALID, EVIDENCE_PROVENANCE_TRUST_INVALID, and EVIDENCE_KIND_INVALID.

The English contract is canonical and must document the model, file shape, status derivation, trust boundary, path/checksum rules, missing-file compatibility, validation layers, and CLI boundaries. The Chinese file mirrors the same sections and machine values. ADR-005 records Evidence as a first-class project-quality entity, .ai-qa/evidence.yaml as metadata Source of Truth, file-first local storage, checksum/trust separation, and the rejected alternatives of SQLite metadata and automatic QualityGate conclusions.

### Steps

- [ ] Write the two contract files and ADR-005 before changing TypeScript. Keep the YAML example exactly as:

```yaml
schemaVersion: "0.2"
evidence:
  testRuns: []
  evidenceRecords: []
```

- [ ] Add the failing Domain tests for a valid empty snapshot, Unicode result names, all five status derivation branches, invalid duration/time/ID/checksum/path, duplicate IDs, broken TestRun references, provenance format mismatch, and runtime input null/array/scalar. The test must assert ordered diagnostic codes rather than only valid === false.

```ts
it("derives incomplete instead of passed for empty or unknown results", () => {
  expect(deriveTestRunStatus([])).toBe("incomplete");
  expect(deriveTestRunStatus([{ name: "x", status: "unknown" }])).toBe("incomplete");
});

it("returns machine diagnostics for malformed runtime input", () => {
  const result = validateEvidenceSnapshot({ schemaVersion: "0.2", testRuns: null });
  expect(result.valid).toBe(false);
  expect(result.diagnostics.map((item) => item.code)).toEqual(["EVIDENCE_TEST_RUNS_INVALID"]);
});
```

- [ ] Run pnpm test -- tests/unit/domain/evidence-domain.test.ts; confirm RED because the new exports and diagnostic behavior do not yet exist.

- [ ] Implement the types, fixed status precedence, RFC3339-with-timezone validation, UTC normalization at the application boundary, kebab-case IDs, lower-case 64-character SHA-256 validation, safe relative path validation, snapshot-local uniqueness/reference checks, and TestRun.status equality with deriveTestRunStatus(results) in packages/domain/src/evidence-domain.ts. Accept unknown at the validator boundary and never throw for malformed runtime data.

```ts
export function deriveTestRunStatus(results: readonly TestResult[]): TestRunStatus {
  if (results.some((result) => result.status === "error")) return "error";
  if (results.some((result) => result.status === "failed")) return "failed";
  if (results.length === 0 || results.some((result) => result.status === "unknown")) {
    return "incomplete";
  }
  if (results.every((result) => result.status === "skipped")) return "skipped";
  return "passed";
}
```

- [ ] Export the Domain module and add the Evidence diagnostic code union without importing any infrastructure module.

- [ ] Run pnpm test -- tests/unit/domain/evidence-domain.test.ts tests/unit/domain/quality-domain.test.ts tests/unit/domain/quality-snapshot.test.ts; expect all targeted Domain tests to pass.

- [ ] Run pnpm typecheck and pnpm test -- tests/architecture/domain-boundary.test.ts tests/architecture/mvp-boundaries.test.ts; expect no forbidden Domain import or token.

- [ ] Run pnpm format:check; then commit the exact files with feat: add evidence domain contract.

## Task 2：实现 Evidence File Contract 和 manifest Project Store

### Files

- Create: packages/project-store/src/evidence-file.ts
- Create: packages/project-store/src/evidence-store.ts
- Modify: packages/project-store/src/types.ts
- Modify: packages/project-store/src/index.ts
- Create: tests/contract/evidence-file.contract.test.ts
- Create: tests/integration/evidence-store.test.ts

### Interfaces consumed and produced

The task consumes EvidenceSnapshot, validateEvidenceSnapshot, EVIDENCE_SCHEMA_VERSION, QualitySnapshot, parseQualityFile, and the existing StoreDiagnostic shape.

Add these exact constants and interfaces to packages/project-store/src/types.ts:

```ts
export const EVIDENCE_FILE_RELATIVE_PATH = ".ai-qa/evidence.yaml";
export const EVIDENCE_ARTIFACT_DIRECTORY_RELATIVE_PATH = ".ai-qa/evidence";

export interface EvidenceFileParseResult {
  valid: boolean;
  evidence?: EvidenceSnapshot;
  diagnostics: readonly StoreDiagnostic[];
}

export interface EvidenceValidationResult {
  valid: boolean;
  evidence?: EvidenceSnapshot;
  revision: string | null;
  diagnostics: readonly StoreDiagnostic[];
}

export interface EvidenceWriteResult {
  written: boolean;
  evidencePath: string;
  revision?: string;
  diagnostics: readonly StoreDiagnostic[];
}

export interface EvidenceStore {
  readEvidence(rootDirectory: string): Promise<EvidenceValidationResult>;
  validateEvidence(rootDirectory: string): Promise<EvidenceValidationResult>;
  writeEvidence(
    rootDirectory: string,
    snapshot: EvidenceSnapshot,
    expectedRevision: string | null,
  ): Promise<EvidenceWriteResult>;
}
```

Extend StoreDiagnosticCode with EVIDENCE_FILE_MALFORMED, EVIDENCE_UNKNOWN_KEY, EVIDENCE_ARTIFACT_MISSING, EVIDENCE_ARTIFACT_PATH_UNSAFE, EVIDENCE_ARTIFACT_SIZE_MISMATCH, EVIDENCE_ARTIFACT_CHECKSUM_MISMATCH, EVIDENCE_ARTIFACT_ORPHAN, EVIDENCE_INPUT_TOO_LARGE, EVIDENCE_FORMAT_UNSUPPORTED, EVIDENCE_IMPORT_CONFLICT, and EVIDENCE_REVISION_CONFLICT. Export parseEvidenceFile(contents: string): EvidenceFileParseResult and serializeEvidenceSnapshot(snapshot: EvidenceSnapshot): string. parseEvidenceFile must parse only the YAML contract; it must not access quality.yaml or artifact bytes.

FileEvidenceStore must implement EvidenceStore. readEvidence must return a valid empty snapshot and revision null when evidence.yaml is absent. When the file exists, its revision is the SHA-256 of the raw UTF-8 bytes, including when parsing fails. validateEvidence additionally loads quality.yaml, validates testCaseId references, checks referenced artifact paths, rejects missing/symlink-escaped artifacts, and does not hash artifact contents. writeEvidence validates the snapshot, re-reads the current manifest revision immediately before rename, requires expectedRevision === null for creation, writes a same-directory temporary file, and atomically renames it.

### Steps

- [ ] Write contract RED tests for the exact YAML shape, stable field order, final newline, unknown top-level/nested keys, bad YAML, unsupported schema, scalar/non-array collections, missing-file empty snapshot, duplicate IDs, broken TestRun references, and parse/serialize round-trip.

- [ ] Write integration RED tests for quality TestCase cross-reference success/failure, missing referenced artifact, absolute/traversal/NUL/symlink path rejection, manifest revision calculation, expectedRevision === null creation, stale revision conflict, final-path symlink replacement rejection, and atomic manifest write without a leftover temporary file.

```ts
it("treats an absent evidence manifest as a valid empty snapshot", async () => {
  const result = await new FileEvidenceStore().validateEvidence(rootDirectory);
  expect(result.valid).toBe(true);
  expect(result.revision).toBeNull();
  expect(result.evidence).toEqual({
    schemaVersion: "0.2",
    testRuns: [],
    evidenceRecords: [],
  });
});
```

- [ ] Run pnpm test -- tests/contract/evidence-file.contract.test.ts tests/integration/evidence-store.test.ts; confirm RED because the new parser/store exports do not yet exist.

- [ ] Implement a strict Zod envelope for schemaVersion and evidence, map unknown keys to EVIDENCE_UNKNOWN_KEY, map YAML errors to EVIDENCE_FILE_MALFORMED, map the Domain result under evidence.*, and serialize with fixed schemaVersion, evidence.testRuns, then evidence.evidenceRecords order and a final newline.

- [ ] Implement FileEvidenceStore.readEvidence, validateEvidence, and writeEvidence using the existing project-store revision convention. Do not modify FileProjectStore.initProject; v0.1 initialization must continue creating only project.yaml and quality.yaml.

- [ ] Implement path containment with resolve(root, ".ai-qa/evidence", relativePath), reject any path whose normalized segments contain empty, dot, or dotdot, and compare real/lstat paths before opening a referenced file. Do not accept a symlink as a manifest artifact.

- [ ] Run the two targeted test files; expect GREEN, including a second read after write that returns the same revision and snapshot.

- [ ] Run pnpm test -- tests/integration/quality-store.test.ts tests/contract/quality-file.contract.test.ts tests/integration/evidence-store.test.ts; expect existing v0.1 quality behavior and new Evidence behavior to pass together.

- [ ] Run pnpm typecheck and pnpm format:check; then commit the exact files with feat: add evidence file contract and store.

## Task 3：实现三种纯 Evidence Adapter

### Files

- Create: packages/evidence/package.json
- Create: packages/evidence/tsconfig.json
- Create: packages/evidence/tsconfig.build.json
- Create: packages/evidence/src/contracts.ts
- Create: packages/evidence/src/errors.ts
- Create: packages/evidence/src/junit-adapter.ts
- Create: packages/evidence/src/playwright-adapter.ts
- Create: packages/evidence/src/pytest-adapter.ts
- Create: packages/evidence/src/index.ts
- Modify: tsconfig.json
- Modify: pnpm-lock.yaml
- Create: tests/unit/evidence/adapters.test.ts
- Create: tests/fixtures/evidence/junit-minimal.xml
- Create: tests/fixtures/evidence/junit-external-entity.xml
- Create: tests/fixtures/evidence/playwright-minimal.json
- Create: tests/fixtures/evidence/pytest-minimal.json

### Interfaces consumed and produced

The package consumes only @ai-native-qa-workbench/domain types and direct dependency saxes@^6.0.0.

Export these exact interfaces:

```ts
export const MAX_EVIDENCE_IMPORT_BYTES = 16 * 1024 * 1024;

export interface EvidenceParseContext {
  runId: string;
  sourceFileName: string;
  importedAt: string;
}

export interface ParsedEvidenceImport {
  testRun: TestRun;
  artifact: {
    bytes: Uint8Array;
    sourceFileName: string;
    mediaType: string;
  };
}

export interface EvidenceAdapter {
  readonly format: EvidenceFormat;
  parse(input: Uint8Array, context: EvidenceParseContext): ParsedEvidenceImport;
}

export interface EvidenceAdapterRegistry {
  get(format: EvidenceFormat): EvidenceAdapter;
}

export function normalizeEvidenceFormat(value: string): EvidenceFormat | undefined;
export function createEvidenceAdapterRegistry(): EvidenceAdapterRegistry;
export function parseEvidenceImport(
  format: EvidenceFormat,
  input: Uint8Array,
  context: EvidenceParseContext,
): ParsedEvidenceImport;
```

EvidenceParseError must expose code, path, and message; its codes are EVIDENCE_INPUT_TOO_LARGE, EVIDENCE_FORMAT_UNSUPPORTED, EVIDENCE_REPORT_MALFORMED, EVIDENCE_REPORT_FIELD_INVALID, and EVIDENCE_REPORT_SECURITY_REJECTED. The adapters may ignore non-core source fields but must reject malformed core fields, absent required names, invalid durations, unsupported non-empty statuses, and conflicting status nodes.

Format behavior is fixed:

- junit: parse <testsuite> or <testsuites> recursively; use testcase name; map <failure> to failed, <error> to error, <skipped> to skipped, and a testcase with none of those children to passed; convert non-negative suite/case time seconds to rounded integer milliseconds; reject DOCTYPE/entity declarations and parser errors; empty suites produce no results and therefore incomplete.
- playwright-json: recursively visit suites[].specs[].tests[].results[]; use the nearest non-empty test.title, spec.title, or suite.title; map passed/expected to passed, failed/unexpected to failed, skipped to skipped, timedOut/interrupted to error, absent result status to unknown; sum result durations per test; no result is incomplete/unknown rather than passed.
- pytest-json: require a top-level tests array; use nodeid; map passed, failed, skipped, and error to the corresponding statuses; require a non-negative numeric duration when present; absent outcome is unknown, while an unsupported non-empty outcome raises EVIDENCE_REPORT_FIELD_INVALID.

All adapters preserve Unicode names and return the original input bytes in artifact.bytes. They set mediaType to application/xml for JUnit and application/json for the JSON formats, and always set provenance trust later in application code rather than inside the adapter.

### Steps

- [ ] Add the package manifest, TypeScript configs, workspace lock entry, and an architecture-neutral adapter test file without parser implementation.

- [ ] Write RED tests for the minimum passed/failed/skipped/error case of each format, empty suite, Unicode and duration conversion, malformed JSON/XML, missing core fields, wrong explicit format, oversize input, and JUnit external entity rejection.

```ts
it("does not guess a format from a JSON file", () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ tests: [] }));
  expect(() =>
    parseEvidenceImport("junit", bytes, {
      runId: "run-junit-input",
      sourceFileName: "report.json",
      importedAt: "2026-09-22T01:00:00Z",
    }),
  ).toThrowError(/XML|malformed|report/i);
});
```

- [ ] Run pnpm test -- tests/unit/evidence/adapters.test.ts; confirm RED because the package exports and adapters do not yet exist.

- [ ] Implement contracts.ts, errors.ts, and the explicit format alias function. normalizeEvidenceFormat("playwright") must return "playwright-json", normalizeEvidenceFormat("pytest") must return "pytest-json", and every other unsupported value must return undefined.

- [ ] Implement the JUnit adapter with saxes, rejecting doctype and entity-related parser events before reading any test result. Do not concatenate arbitrary XML into a DOM or enable external entity resolution.

- [ ] Implement the Playwright and Pytest JSON adapters with JSON.parse, runtime object/array guards, explicit status mappings, and deterministic traversal order. Do not use source filenames to infer format.

- [ ] Enforce input.byteLength <= MAX_EVIDENCE_IMPORT_BYTES before decoding or parsing, and run Domain-level validateEvidenceSnapshot on the single generated TestRun before returning.

- [ ] Run the targeted adapter tests; expect GREEN and assert that every returned TestRun uses the context run ID and derived status.

- [ ] Run pnpm --filter @ai-native-qa-workbench/evidence typecheck and pnpm --filter @ai-native-qa-workbench/evidence build; expect both to pass without filesystem/provider imports.

- [ ] Run pnpm format:check; then commit the exact files with feat: add evidence import adapters.

## Task 4：实现 artifact integrity、Import/Verify application service

### Files

- Modify: packages/project-store/src/types.ts
- Modify: packages/project-store/src/evidence-store.ts
- Modify: packages/project-store/src/index.ts
- Modify: packages/application/package.json
- Modify: packages/application/tsconfig.json
- Modify: packages/application/tsconfig.build.json
- Create: packages/application/src/evidence-import.ts
- Create: packages/application/src/evidence-verify.ts
- Modify: packages/application/src/index.ts
- Create: tests/integration/evidence-import.test.ts
- Create: tests/integration/evidence-verify.test.ts

### Interfaces consumed and produced

Add these exact store-side types:

```ts
export interface StagedEvidenceArtifact {
  reference: ArtifactReference;
  temporaryPath: string;
  finalPath: string;
}

export interface EvidenceVerificationResult {
  valid: boolean;
  revision: string | null;
  diagnostics: readonly StoreDiagnostic[];
}

export interface EvidenceArtifactStore {
  stageArtifact(rootDirectory: string, bytes: Uint8Array): Promise<StagedEvidenceArtifact>;
  commitArtifact(stage: StagedEvidenceArtifact): Promise<void>;
  discardArtifact(stage: StagedEvidenceArtifact): Promise<void>;
  verifyEvidence(rootDirectory: string): Promise<EvidenceVerificationResult>;
}
```

FileEvidenceStore must implement both EvidenceStore and EvidenceArtifactStore. stageArtifact computes SHA-256 and byte length from the provided bytes, creates artifact-<fullSha256>.bin under the Evidence artifact root, writes a random temporary file under .ai-qa/evidence/.tmp/, and returns a manifest reference with relativePath under .ai-qa/evidence/. commitArtifact atomically renames the temporary file into the generated path and treats an existing same-checksum regular file as idempotent, but rejects an existing symlink target with EVIDENCE_ARTIFACT_PATH_UNSAFE. discardArtifact only removes a staged temporary file. verifyEvidence loads the manifest, checks all referenced files’ lstat/size/SHA-256, reports symlink entries without following them, recursively scans non-temporary Evidence files for unreferenced orphans, and never changes the manifest or trust.

Add these exact application interfaces:

```ts
export interface EvidenceImportInput {
  rootDirectory: string;
  reportPath: string;
  format: EvidenceFormat;
  runId?: string;
  now?: string;
}

export interface EvidenceImportResult {
  imported: boolean;
  idempotent: boolean;
  testRunId?: string;
  evidenceId?: string;
  diagnostics: readonly StoreDiagnostic[];
}

export interface EvidenceImporter {
  import(input: EvidenceImportInput): Promise<EvidenceImportResult>;
}

export class EvidenceImportService implements EvidenceImporter {
  constructor(dependencies: {
    projectStore: ProjectStore;
    evidenceStore: EvidenceStore & EvidenceArtifactStore;
    adapters: EvidenceAdapterRegistry;
    now?: () => string;
  });
  import(input: EvidenceImportInput): Promise<EvidenceImportResult>;
}

export interface EvidenceVerifier {
  verify(rootDirectory: string): Promise<EvidenceVerificationResult>;
}

export class EvidenceVerifyService implements EvidenceVerifier {
  constructor(dependencies: { evidenceStore: EvidenceArtifactStore });
  verify(rootDirectory: string): Promise<EvidenceVerificationResult>;
}
```

EvidenceImportService derives a missing run ID as run-<format>-<rawArtifactSha256>, uses evidence-<runId>-<sha256.slice(0, 16)>, and takes the artifact ID from the store reference. Normalized idempotency comparison ignores only the new invocation’s provenance.importedAt; it compares the TestRun, source format/name, trust, artifact media type/size/checksum/path, and all other provenance fields. A matching existing record returns success with idempotent: true without replacing the manifest. A same-run ID with a different checksum or normalized TestRun returns EVIDENCE_IMPORT_CONFLICT.

### Steps

- [ ] Write RED integration tests using real temporary project roots for: successful import, default run ID, explicit run ID, Unicode report names, UTC-normalized importedAt, artifact bytes/metadata, unverified provenance, TestCase reference success/failure, repeated idempotent import, same-run conflict, malformed report no-write, oversize no-write, stale revision conflict, metadata failure preserving the old manifest, and cleanup of temporary files.

- [ ] Write RED verify tests for missing artifact, size mismatch, checksum mismatch, orphan artifact, path escape, symlink reference, valid empty Evidence, and trust remaining unchanged after verification.

```ts
it("returns idempotent success without changing importedAt", async () => {
  const first = await importer.import({
    rootDirectory,
    reportPath,
    format: "junit",
    now: "2026-09-22T01:00:00Z",
  });
  const second = await importer.import({
    rootDirectory,
    reportPath,
    format: "junit",
    now: "2026-09-22T02:00:00Z",
  });

  expect(first.imported).toBe(true);
  expect(second).toMatchObject({
    imported: true,
    idempotent: true,
    testRunId: first.testRunId,
    evidenceId: first.evidenceId,
  });
  const before = await evidenceStore.readEvidence(rootDirectory);
  await importer.import({
    rootDirectory,
    reportPath,
    format: "junit",
    now: "2026-09-22T03:00:00Z",
  });
  const after = await evidenceStore.readEvidence(rootDirectory);
  expect(after.revision).toBe(before.revision);
});
```

- [ ] Run pnpm test -- tests/integration/evidence-import.test.ts tests/integration/evidence-verify.test.ts; confirm RED before adding artifact/application implementation.

- [ ] Extend the store with staged artifact and verification methods. Use byte-based createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.byteLength, and a generated path that never contains the user-supplied report filename. Keep temporary files below .ai-qa/evidence/.tmp/ and exclude that directory from orphan scans.

- [ ] Implement the import sequence in this order: validate project and quality; validate current Evidence; read report bytes; reject over-limit input before adapter parse; compute raw checksum for default run ID; normalize input.now or the injected clock result with new Date(value).toISOString(); call the explicit adapter; stage and recompute artifact metadata; build Evidence with kind: "test-result", trust: "unverified", and adapter format; validate merged snapshot and cross-file TestCase references; commit artifact; write manifest with the captured revision; reload and validate.

- [ ] On every unsuccessful branch before artifact commit, call discardArtifact. On stale revision or manifest failure after artifact commit, leave the old manifest untouched and return the diagnostic without deleting the final artifact; the subsequent verify command must report it as orphan.

- [ ] Implement EvidenceVerifier as a thin application wrapper over EvidenceArtifactStore.verifyEvidence; it must not mutate files or transform integrity diagnostics into quality scores.

- [ ] Run the two targeted integration files; expect GREEN, including no old manifest mutation for parser, conflict, and stale-revision failures.

- [ ] Run pnpm --filter @ai-native-qa-workbench/application typecheck, pnpm --filter @ai-native-qa-workbench/project-store typecheck, and pnpm build; expect all workspace dependencies to build.

- [ ] Run pnpm format:check; then commit the exact files with feat: add evidence import and integrity services.

## Task 5：接入 CLI，同时保持 v0.1 命令兼容

### Files

- Modify: apps/cli/src/cli.ts
- Modify: apps/cli/src/main.ts
- Modify: apps/cli/package.json
- Modify: tsconfig.json
- Create: tests/integration/cli-evidence.test.ts
- Modify: tests/integration/cli.test.ts

### Interfaces consumed and produced

Add workspace dependencies on @ai-native-qa-workbench/evidence and the application/project-store APIs. Extend CliDependencies without changing existing fields:

```ts
export interface CliDependencies {
  cwd?: string;
  store?: ProjectStore;
  evidenceStore?: EvidenceStore & EvidenceArtifactStore;
  evidenceImporter?: EvidenceImporter;
  evidenceVerifier?: EvidenceVerifier;
  stdout?: Output;
  stderr?: Output;
}
```

Parse these exact commands:

```text
qaw evidence import <report-file> --format junit|playwright|pytest [--run-id <id>] [directory]
qaw evidence verify [directory]
```

playwright maps to playwright-json, pytest maps to pytest-json, and only canonical values reach Domain/application. The parser must require one report file and one format for import, allow at most one directory, reject --trusted, reject unknown options, and preserve existing v0.1 parse behavior. New Evidence syntax/unsupported-format errors return exit code 2; existing v0.1 parse failures keep their current exit code 1.

### Steps

- [ ] Write RED CLI tests for usage text, missing subcommand/report/format, unsupported format exit 2, --trusted rejection, successful import output, idempotent output, verify success, verify failure exit 1, validate including Evidence metadata, doctor including checksum verification, and all existing init/validate/doctor/open/analyze tests.

- [ ] Run pnpm test -- tests/integration/cli-evidence.test.ts tests/integration/cli.test.ts; confirm RED because the nested evidence parser and dependencies do not exist.

- [ ] Implement a typed CliArgumentError carrying an explicit exit code while leaving v0.1 command branches unchanged. Add evidence import and evidence verify parsing without guessing a report format from extension or content.

- [ ] Instantiate FileEvidenceStore and the application services only when Evidence dependencies are not supplied by tests. Keep ProjectStore as the existing dependency for project/quality validation.

- [ ] Extend qaw validate to call validateEvidence after project and quality validation. Make qaw evidence verify and qaw doctor call project validation, quality validation, evidence metadata validation, and then verifyEvidence; do not run checksum/orphan verification when metadata validation already failed. Keep qaw open and qaw analyze output unchanged.

- [ ] Print stable machine diagnostics to stderr using the existing writeDiagnostics shape. On import success print the canonical run/evidence IDs; on idempotent success state that the existing record was reused; do not print a Quality Score.

- [ ] Run pnpm test -- tests/integration/cli-evidence.test.ts tests/integration/cli.test.ts; expect GREEN. Run pnpm test -- tests/e2e/golden-path.spec.ts to verify the existing browser path remains unaffected.

- [ ] Run pnpm typecheck, pnpm --filter @ai-native-qa-workbench/cli build, and pnpm format:check; then commit the exact files with feat: add evidence cli commands.

## Task 6：架构检查、回归 Gate、双语文档和实现状态

### Files

- Create: tests/architecture/evidence-boundary.test.ts
- Modify: tests/architecture/domain-boundary.test.ts
- Modify: docs/en/ROADMAP.md
- Modify: docs/zh-CN/ROADMAP.md
- Modify: docs/development/RELEASE_PLAN.md
- Modify: docs/development/GITHUB_MILESTONES_AND_EPICS.md
- Create: docs/superpowers/records/2026-09-22-v0-2-evidence-verification.md

### Interfaces consumed and produced

The architecture test consumes the source roots packages/domain/src and packages/evidence/src. It produces no runtime API. It must assert that Domain has no forbidden imports/tokens, and that the adapter package has no node:fs, node:child_process, network, provider, Fastify, React, MCP, GitHub, Jira, Playwright runtime, or direct .ai-qa/ access. saxes and JSON parsing are allowed in the adapter package.

The verification record must keep separate statuses for local static checks, package build, unit/contract/integration tests, architecture checks, docs checks, Golden Path E2E, external CI, GitHub Release/tag, registry publication, production deployment, browser/runtime model evaluation, and business acceptance. Unrun external statuses must remain NOT_RUN, not be inferred from local green tests.

### Steps

- [ ] Add the architecture boundary test after the Domain and adapter implementations exist; run pnpm test -- tests/architecture/evidence-boundary.test.ts tests/architecture/domain-boundary.test.ts and require a green result before the full gate.

- [ ] Update the architecture assertions to include the new Domain file and verify the adapter source tree has no filesystem or integration imports.

- [ ] Run the affected test suites in order: pnpm test -- tests/unit/domain/evidence-domain.test.ts tests/contract/evidence-file.contract.test.ts tests/unit/evidence/adapters.test.ts, then pnpm test -- tests/integration/evidence-store.test.ts tests/integration/evidence-import.test.ts tests/integration/evidence-verify.test.ts tests/integration/cli-evidence.test.ts, then pnpm test -- tests/integration/cli.test.ts tests/integration/quality-store.test.ts tests/integration/runtime-store.test.ts tests/integration/server.test.ts.

- [ ] Run the full local gate commands exactly: pnpm format:check, pnpm lint, pnpm typecheck, pnpm build, pnpm test, pnpm check:architecture, pnpm check:docs, pnpm test:e2e, and git diff --check. Record each command and result in the verification record.

- [ ] Update both Roadmaps and the Release Plan to state that v0.2 Evidence Foundation is implemented in the current checkout only after all local gates pass; state explicitly that no GitHub tag/Release, external CI, registry publication, production deployment, or business acceptance is claimed.

- [ ] Update the local Milestone/Epic registry with the v0.2 implementation boundary and keep remote GitHub objects unclaimed.

- [ ] Verify English/Chinese Evidence Contract structural parity with pnpm check:docs, inspect all changed implementation and public-document paths for unresolved placeholder markers, and remove every such match from the v0.2 change set.

- [ ] Review git status --short, git diff --stat, and git diff --check; stage only Task 6’s intended paths and commit docs: record v0.2 evidence verification.

## 计划自审结论

- Contract coverage: Domain model, Evidence YAML, missing-file compatibility, cross-file TestCase references, three adapters, IDs, idempotency, atomicity, integrity, CLI grammar, exit codes, and non-goals each have an implementation task and a test task.
- Boundary coverage: Domain purity, adapter purity, Project Store ownership of .ai-qa/ writes, SQLite exclusion, trust/integrity separation, and no Agent Tool mutation path are explicit in the global constraints and architecture task.
- Failure coverage: malformed YAML/XML/JSON, unknown keys, unsupported format, oversize input, invalid statuses, invalid time/duration, path traversal, NUL, symlink, missing/changed artifacts, stale revision, same-ID conflict, orphan artifacts, and metadata failure each have a named diagnostic or test case.
- Interface consistency: Task 2 defines EvidenceStore; Task 4 extends the same store with EvidenceArtifactStore; Task 5 consumes EvidenceImporter and EvidenceVerifier; Domain and adapter format values use the same canonical union.
- Regression coverage: Existing v0.1 Store, CLI, Server, Runtime Store, architecture tests, docs checks, and Golden Path E2E are explicitly rerun.
- Placeholder check: this plan contains no implementation placeholder or unresolved decision marker.

## Execution Handoff

The implementation must not start until this plan is reviewed. Recommended execution method is Native execution with superpowers:executing-plans: the tasks are sequential and share exact package interfaces, and the current harness does not expose a callable subagent dispatch tool. Native execution will implement every task in this branch, preserve the per-task commits, and perform one whole-branch review before the final verification record.

After reviewing this file, choose one:

1. Native execution: implement every task in this branch and perform the final whole-branch review.
2. Subagent-driven execution: use a fresh implementer/reviewer cycle for each task and a final whole-branch review, if a subagent dispatch tool is available.

No production code should be changed before the execution method is selected.
