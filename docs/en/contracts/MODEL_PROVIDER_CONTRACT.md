# Model Provider Contract

**Status:** Implemented v0.1 MVP slice.

```ts
interface ModelProvider {
  generate(request: ModelRequest): Promise<ModelResponse>;
}
```

`MockProvider` consumes a deterministic response sequence and is the default for
local tests, CI, CLI analysis, and the local server. `OpenAICompatibleProvider`
uses only injected `fetch`, base URL, model, and optional API key. The server opts
into it only when `QAW_MODEL_BASE_URL` and `QAW_MODEL` are both set.

Requirement Analysis carries `outputLocale` through the provider boundary and
turns it into an explicit model instruction. It remains independent from the
Workbench UI locale.

Provider output is an input to analysis; it is not execution evidence, a HumanDecision,
or permission to write `.ai-qa/`. Live LLM calls are never required by core CI.
