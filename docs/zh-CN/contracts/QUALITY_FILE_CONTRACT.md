# 质量文件 Contract

**状态：** 已实现 v0.1 MVP。

**规范实现：** `packages/project-store/src/quality-file.ts`

本 Contract 定义 `.ai-qa/quality.yaml` 项目质量文件。该文件是质量集合的文件级
Source of Truth；运行时操作状态不得复制进此文件。

## 稳定结构

```yaml
schemaVersion: "0.1"
quality:
  requirements: []
  acceptanceCriteria: []
  qualityRisks: []
  testObligations: []
  testCases: []
  traceLinks: []
```

顶层 key 必须且只能是 `schemaVersion` 与 `quality`。`quality` 下只能出现上面列出的
六个集合。未知 key 会被拒绝。

## Parser

`parseQualityFile(contents)` 解析 YAML，拒绝 malformed YAML 和非 mapping 文档，校验
严格 key 结构，然后把集合校验委托给纯 Domain 包中的 `validateQualitySnapshot`。

成功结果为：

```ts
{ valid: true, projectQuality: QualitySnapshot, diagnostics: [] }
```

失败结果为 `valid: false`，并包含机器可读的 `code`、`path`、`message` 与
`severity: "error"` diagnostics。集合诊断以 `quality.*` 为根；YAML 语法错误使用
`.ai-qa/quality.yaml` 作为 path。

## Serializer

`serializeQualitySnapshot(snapshot)` 会先校验 snapshot，再按规范字段顺序序列化，并始终
返回结尾换行。它不会加入运行时状态，也不会改写实体值。无效 snapshot 会抛出异常，
不会生成无法重新解析的文件。

文件写入由 Project Store 负责。Store 实现必须使用同目录临时文件加原子 rename，并在
写入失败时清理临时文件。

## 兼容性

字段名、集合顺序、诊断 code、诊断 path 或 schema version 的变化，都必须经过 Contract
审查，补充兼容性测试，并同步维护中英文文档。
