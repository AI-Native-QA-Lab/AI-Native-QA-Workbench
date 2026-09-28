# Workbench UI

本地 React/Vite Workbench 使用紧凑的控制室布局，参考 dsh-qa 的信息架构，
但保留本仓库的本地优先和人工审核边界。

## 页面视图

- **总览（Dashboard）** 展示当前 `quality.yaml` 快照、六阶段质量流转、质量雷达和需求分析入口。
- **质量流转（Pipeline）** 将当前已有的需求、测试设计义务和测试用例展示为六阶段项目流转。执行、缺陷回归和发布在对应 Contract 与 API 完成前明确显示为“暂未接入”。
- **助手（Assistant）** 在同一个工作区保留项目上下文、需求分析、Proposal 审查和质量信号。

左侧主导航负责切换这三个页面。需求、测试用例和证据作为计划中的工作区显示，
但在专用的服务器/API 读模型完成前保持禁用状态。v0.2 已经通过本地 CLI 和项目文件
实现 Evidence Contract；Workbench 当前不会声称已经展示执行证据。

## 交互和边界

- UI 默认使用 English，并支持切换到 `zh-CN`；AI 输出语言是独立的分析设置。
- 需求分析会创建 ChangeProposal，项目质量文件发生变化前仍必须由人工审核者批准或拒绝。
- `.ai-qa/` 下的项目文件仍然是质量数据的唯一事实来源。
- 正式页面状态使用 `?view=dashboard|pipeline|assistant`。早期原型的
  `?variant=` 参数仍可被读取，以保持本地预览链接兼容。

## 本地预览

```bash
pnpm --filter @ai-native-qa-workbench/web dev
```

打开 `http://127.0.0.1:4173/` 查看 Dashboard，也可以通过左侧导航进入 Pipeline
和 Assistant，或直接使用 `?view=pipeline` 与 `?view=assistant`。
