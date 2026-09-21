import type { ModelProvider, ModelRequest, ModelResponse } from "./contracts.js";

export interface MockProviderOptions {
  delayMs?: number;
}

export class MockProvider implements ModelProvider {
  private readonly responses: ModelResponse[];
  private readonly delayMs: number;

  constructor(
    responses: readonly ModelResponse[] = [{ text: "", done: true }],
    options: MockProviderOptions = {},
  ) {
    this.responses = responses.map((response) => structuredClone(response));
    this.delayMs = options.delayMs ?? 0;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    void request;
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const response = this.responses.shift();
    if (!response) throw new Error("MockProvider sequence exhausted.");
    return structuredClone(response);
  }
}
