import { describe, expect, it } from "vitest";

import {
  MockProvider,
  OpenAICompatibleProvider,
  type ModelRequest,
} from "@ai-native-qa-workbench/model-providers";

const request: ModelRequest = {
  system: "You are a QA assistant.",
  prompt: "Analyze checkout.",
  outputLocale: "zh-CN",
};

describe("model provider contract", () => {
  it("returns a deterministic MockProvider sequence and fails when exhausted", async () => {
    const provider = new MockProvider([
      { text: "first", done: false },
      { text: "second", done: true },
    ]);

    await expect(provider.generate(request)).resolves.toEqual({ text: "first", done: false });
    await expect(provider.generate(request)).resolves.toEqual({ text: "second", done: true });
    await expect(provider.generate(request)).rejects.toThrow("sequence exhausted");
  });

  it("maps OpenAI-compatible requests and responses through injected fetch", async () => {
    let receivedUrl = "";
    let receivedInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (input, init) => {
      receivedUrl = String(input);
      receivedInit = init;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "mapped response" }, finish_reason: "stop" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const provider = new OpenAICompatibleProvider({
      baseUrl: "https://example.test/v1",
      apiKey: "secret",
      model: "qa-model",
      fetchImpl,
    });

    await expect(provider.generate(request)).resolves.toEqual({
      text: "mapped response",
      finishReason: "stop",
      done: true,
    });
    expect(receivedUrl).toBe("https://example.test/v1/chat/completions");
    expect(receivedInit?.method).toBe("POST");
    expect(receivedInit?.headers).toMatchObject({ authorization: "Bearer secret" });
    expect(JSON.parse(String(receivedInit?.body))).toMatchObject({
      model: "qa-model",
      messages: [
        { role: "system", content: "You are a QA assistant." },
        { role: "user", content: "Analyze checkout." },
      ],
    });
  });

  it("surfaces provider HTTP and malformed-response errors", async () => {
    const errorProvider = new OpenAICompatibleProvider({
      baseUrl: "https://example.test",
      model: "qa-model",
      fetchImpl: async () => new Response("upstream down", { status: 503 }),
    });
    const malformedProvider = new OpenAICompatibleProvider({
      baseUrl: "https://example.test",
      model: "qa-model",
      fetchImpl: async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    });

    await expect(errorProvider.generate(request)).rejects.toThrow("503");
    await expect(malformedProvider.generate(request)).rejects.toThrow("malformed");
  });
});
