# Evidence Contract

**状态：** 已接受，用于 v0.2 Evidence Foundation。

**Canonical 实现：** packages/domain/src/evidence-domain.ts、
packages/project-store/src/evidence-file.ts 和 packages/evidence/src/index.ts。

本 Contract 定义本地测试结果导入后的 Evidence。它不定义 Quality Score、
QualityAssessment、QualityGate、HumanDecision、Coverage 或生产验收结论。

## Source of Truth 与文件布局

Evidence metadata 属于项目质量数据，保存在 .ai-qa/evidence.yaml。原始报告
字节保存在 .ai-qa/evidence/ 下。SQLite Runtime Store 不得成为 Evidence、
TestRun 或 TestResult 的 Source of Truth。

现有 v0.1 文件保持原 schema：

```text
.ai-qa/project.yaml       schemaVersion: "0.1"
.ai-qa/quality.yaml       schemaVersion: "0.1"
```

v0.2 新增：

```text
.ai-qa/evidence.yaml      schemaVersion: "0.2"
.ai-qa/evidence/          imported artifact root
```

evidence.yaml 是可选文件。文件缺失表示有效的空快照，因此 v0.1 项目不需要
迁移。文件存在但 malformed 时必须 fail closed。

## 稳定 YAML 形状

顶层只允许 schemaVersion 和 evidence；evidence 只允许 testRuns 和
evidenceRecords。

```yaml
schemaVersion: "0.2"
evidence:
  testRuns: []
  evidenceRecords: []
```

未知 key、坏 YAML、不支持的 schema、非数组集合、错误字段类型、重复 ID 和
断裂的本地引用都必须返回稳定的机器可读诊断。序列化固定使用上述字段顺序，
保留集合顺序，并以一个换行结束。

## Domain 类型

Domain package 导出：

```ts
export const EVIDENCE_SCHEMA_VERSION = "0.2" as const;

export type TestRunStatus = "passed" | "failed" | "skipped" | "error" | "incomplete";
export type TestResultStatus = "passed" | "failed" | "skipped" | "error" | "unknown";
export type EvidenceFormat = "junit" | "playwright-json" | "pytest-json";
export type EvidenceKind = "test-result";
export type EvidenceTrust = "unverified" | "trusted" | "human-recorded";
```

TestRun 包含 ID、canonical source format、由结果推导的 status、可选的带时区
RFC 3339 起止时间和嵌套的 TestResult。结果名称保留 Unicode；durationMs
必须是非负整数。可选的 testCaseId 在 Domain 只校验 ID 形状，由 Project
Store 在跨文件校验时解析到 quality.yaml。

Evidence 包含唯一 ID、TestRun 引用、kind test-result、ArtifactReference
和 EvidenceProvenance。Artifact reference 包含可移植的相对路径、media type、
字节大小和小写 64 位 SHA-256。

所有 TestRun ID、Evidence ID 和 artifact ID 使用小写 kebab-case。Domain
validator 不会 slugify、trim 或改写值。

## Status 推导

TestRun.status 必须等于 deriveTestRunStatus(results)。固定优先级是：

1. 任一 error 结果得到 error；
2. 否则任一 failed 结果得到 failed；
3. 否则空结果或任一 unknown 得到 incomplete；
4. 否则全部结果为 skipped 得到 skipped；
5. 其他情况得到 passed。

因此空报告永远是 incomplete，不是 passed。该 status 只描述导入的执行观察，
不是 QualityGate 结果。

## 时间、Provenance 与 Trust

startedAt、completedAt 和 importedAt 存在时必须是带明确时区的 RFC 3339
时间；application 持久化为 UTC。完成时间不能早于开始时间。报告缺少执行时间
时保持缺失，不能用导入时间伪造执行时间。

EvidenceProvenance.sourceFormat 必须等于所引用 TestRun 的 format。
sourceFileName 必须是非空 basename，不能含 slash、反斜杠、NUL 或绝对路径。
v0.2 适配器默认写入 trust: unverified。Trust 是来源声明，与 checksum
验证独立；qaw evidence verify 不修改 trust。AI 推理、模型输出、分析文本和
ChangeProposal 记录都不是执行 Evidence。

## Artifact 安全与完整性

ArtifactReference.relativePath 相对于 .ai-qa/evidence/。绝对路径、空路径、
点和点点 segment、路径穿越、NUL 和 symlink 逃逸都无效。文件 store 拒绝
manifest 中的 symlink，并且 orphan 扫描不跟随 symlink。

Store 从实际写入字节计算 sizeBytes 和 sha256，不能把 manifest 值当成完整性
证明。validateEvidence 校验 metadata、引用、路径安全和 artifact 存在性，
不重新 hash 所有字节；verifyEvidence 重新计算每个引用 artifact 的大小和
SHA-256，并报告 EVIDENCE_ARTIFACT_MISSING、
EVIDENCE_ARTIFACT_SIZE_MISMATCH、EVIDENCE_ARTIFACT_CHECKSUM_MISMATCH、
EVIDENCE_ARTIFACT_PATH_UNSAFE 和 EVIDENCE_ARTIFACT_ORPHAN。Orphan 只报告，
不自动删除。

## 校验层次

纯 Domain validator 只检查快照内部结构、类型、ID、时间、status 推导、重复
ID、TestRun 引用和 artifact metadata 形状；不执行文件系统、YAML、checksum
或 quality.yaml I/O。

Project Store 解析和序列化严格 YAML envelope。它的
validateEvidence(rootDirectory) 还会加载 quality snapshot，解析可选的
testCaseId 引用，检查 artifact 路径和引用文件是否存在。readEvidence 和
validateEvidence 返回 manifest 原始 UTF-8 字节的 SHA-256 revision；文件缺失
时返回 null。

Manifest 写入需要 expected revision。创建必须使用 expectedRevision === null；
更新必须使用当前 revision。Store 在同目录 atomic rename 前再次检查 revision；
并发修改时返回 EVIDENCE_REVISION_CONFLICT，不得覆盖其他修改。

## Adapter 与 Import 边界

packages/evidence 接收内存中的 UTF-8 bytes 和显式 format，返回规范化 TestRun
以及原始 artifact bytes。它不读文件、不执行命令、不访问网络、不调用 model
provider，也不写 Project Store。

支持格式：

| Format          | 核心字段                                            |
| --------------- | --------------------------------------------------- |
| junit           | XML suite/case、failure、error、skipped 和 duration |
| playwright-json | suite/spec/test/result 名称、status 和 duration     |
| pytest-json     | tests[].nodeid、outcome 和 duration                 |

Parser 输入上限为 16 MiB，必须在解析前检查。Format 必须显式指定，CLI 的
playwright 和 pytest 只是 canonical Domain value 的别名，不能按文件名猜测。
JUnit 外部 entity 和 DOCTYPE 必须拒绝。核心字段 malformed 时 fail closed，
不能伪造为 passed。

Application 负责导入顺序：校验项目和当前 metadata，解析报告，将 bytes 写入
.tmp，重新计算 artifact metadata，atomic 移动 artifact，追加并校验 metadata，
atomic 替换 manifest，重新加载验证。metadata 提交失败时旧 manifest 保持有效；
artifact 移动后崩溃可能留下未引用文件，由 verify 报告 orphan。

未提供 run ID 时生成 run-<format>-<rawArtifactSha256>；Evidence ID 使用
evidence-<runId>-<sha256-prefix>；artifact ID 使用完整 checksum。相同 run ID、
checksum 和 normalized content 是幂等成功；相同 run ID 但 checksum 或 normalized
TestRun 不同则返回 EVIDENCE_IMPORT_CONFLICT。

## CLI 边界

```text
qaw evidence import <report-file> --format junit|playwright|pytest [--run-id <id>] [directory]
qaw evidence verify [directory]
```

qaw validate 校验 project、quality 和 Evidence metadata。qaw evidence verify
与 qaw doctor 先校验这些 metadata，再重新计算 artifact 完整性并报告 orphan。
它们不打印 Quality Score，也不创建 QualityAssessment、QualityGate 或
HumanDecision。

Evidence 命令退出码：

| Code | 含义                                      |
| ---- | ----------------------------------------- |
| 0    | import 成功、幂等复用成功或 verify 无问题 |
| 1    | project/data/integrity/concurrency 失败   |
| 2    | Evidence 命令语法或不支持的 format        |

现有 v0.1 命令退出码保持不变。

## 兼容性与 Human Boundary

v0.2 的 Evidence import 是用户主动执行的 CLI action，不是 Agent Tool。未来若
Agent 或 Tool 调用它，必须增加 ChangeProposal、Validation、Human Review 和
Apply 边界。AI 输出不得冒充 Human Decision，也不得成为确定性执行 Evidence。
