import type { ModelProvider, ModelRequest, ModelResponse } from "./contracts.js";

export interface OpenAICompatibleProviderOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

interface OpenAICompatiblePayload {
  choices?: Array<{
    message?: { content?: unknown };
    finish_reason?: unknown;
  }>;
}

export class OpenAICompatibleProvider implements ModelProvider {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const messages = [
      ...(request.system ? [{ role: "system", content: request.system }] : []),
      { role: "user", content: request.prompt },
    ];
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: this.model, messages }),
    });

    if (!response.ok) {
      throw new Error(
        `Model provider request failed with HTTP ${response.status}: ${await response.text()}`,
      );
    }
    const payload = (await response.json()) as OpenAICompatiblePayload;
    const choice = payload.choices?.[0];
    const text = choice?.message?.content;
    if (typeof text !== "string") throw new Error("Model provider response is malformed.");
    const finishReason =
      typeof choice?.finish_reason === "string" ? choice.finish_reason : undefined;
    return {
      text,
      ...(finishReason ? { finishReason } : {}),
      done: finishReason === "stop",
    };
  }
}
