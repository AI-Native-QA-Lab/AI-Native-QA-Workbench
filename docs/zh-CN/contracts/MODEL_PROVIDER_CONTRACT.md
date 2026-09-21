# Model Provider Contract

**状态：** 已实现 v0.1 MVP 子切片。

```ts
interface ModelProvider {
  generate(request: ModelRequest): Promise<ModelResponse>;
}
```

`MockProvider` 消费确定性的 response sequence，是本地测试、CI、CLI 分析和本地 Server
的默认 Provider。`OpenAICompatibleProvider` 只使用注入的 `fetch`、base URL、model
和可选 API key。只有同时设置 `QAW_MODEL_BASE_URL` 与 `QAW_MODEL` 时，Server 才会启用它。

Requirement Analysis 会把 `outputLocale` 透传过 Provider 边界，并转换为明确的模型指令；
它与 Workbench 的 UI locale 保持独立。

Provider 输出只是分析输入，不是 execution evidence、HumanDecision，也不是写入
`.ai-qa/` 的权限。Core CI 不要求真实 LLM 调用。
