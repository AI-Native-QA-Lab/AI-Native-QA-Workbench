# Traceability Contract

**状态：** 已实现 v0.1 MVP。

Traceability 以 `QualitySnapshot` 实体和显式 `TraceLink` 记录存储在
`.ai-qa/quality.yaml`。SQLite 可以保存可重建的运行时记录，但不拥有质量实体或
TraceLink。

## 支持的链接

| From | Relation | To |
| ---- | -------- | -- |
| `requirement` | `satisfies` | `requirement` |
| `acceptance-criterion` | `satisfies` | `requirement` |
| `quality-risk` | `mitigates` | `requirement` |
| `test-obligation` | `verifies` | `quality-risk` |
| `test-case` | `verifies` | `test-obligation` |

Domain validator 会拒绝错误 endpoint、未支持的组合、自引用、重复 edge、集合内重复
ID 和断裂直接引用。ID 使用与语言无关的 kebab-case。

## Re-evaluate 边界

v0.1 的 rebuild 是确定性的：重新加载 YAML snapshot，校验集合和链接，再为 QA Task
CompletionResult 推导计数。不引入独立图数据库或远程索引。Evidence coverage 和图
完整性属于后续 v0.2/v0.7 能力。
