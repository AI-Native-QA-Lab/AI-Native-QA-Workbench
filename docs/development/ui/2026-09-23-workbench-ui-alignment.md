# Workbench UI 对齐记录

## 决策

用户已确认当前 dsh-qa 参考原型的 Dashboard 结构可接受，因此将原型收敛为正式
Workbench UI。正式入口保留三类核心视图：Dashboard、Pipeline、Assistant。

## 收敛范围

- 删除仅用于开发预览的底部 UI preview 浮层和键盘切换逻辑。
- 使用 `?view=` 表达正式页面状态，并兼容读取旧的 `?variant=` 链接。
- 保留顶部项目上下文、左侧工作区导航、质量快照、质量雷达、六阶段流转和人工审核入口。
- Requirements、Test cases、Evidence 目前没有对应的 Workbench API 读模型，因此在导航中显示为禁用状态，不把它们错误映射到其他页面。
- Evidence 继续遵守 v0.2 边界：CLI 和 `.ai-qa/evidence.yaml` 已实现，但 UI 不虚构执行证据或质量门禁。

## 验收

- Dashboard 作为默认页面。
- Pipeline 和 Assistant 可从左侧导航切换。
- UI 默认 English，支持 `zh-CN`； AI output locale 与 UI locale 独立。
- 分析仍通过 ChangeProposal 和人工审查完成。
- 单元测试、静态检查、构建和 Golden Path E2E 需要重新执行。
