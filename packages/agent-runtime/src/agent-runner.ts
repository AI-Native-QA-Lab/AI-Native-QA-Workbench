import type { ModelProvider, ModelResponse } from "@ai-native-qa-workbench/model-providers";

import type { AgentEvent, AgentState } from "./state.js";

export interface AgentRunnerOptions {
  provider: ModelProvider;
}

export interface AgentRunInput {
  prompt: string;
  system?: string;
  outputLocale?: "en" | "zh-CN";
  maxSteps?: number;
  timeoutMs?: number;
  onEvent?: (event: AgentEvent) => void;
}

export interface AgentRunResult {
  state: Exclude<AgentState, "idle" | "running" | "paused" | "waiting_for_approval">;
  response?: ModelResponse;
  errorCode?: "AGENT_MAX_STEPS" | "AGENT_TIMEOUT" | "AGENT_APPROVAL_REJECTED";
}

export class AgentRunner {
  private readonly provider: ModelProvider;
  private currentState: AgentState = "idle";
  private cancelRequested = false;
  private pauseRequested = false;
  private resumeResolver: (() => void) | undefined;
  private approvalResolver: ((approved: boolean) => void) | undefined;

  constructor(options: AgentRunnerOptions) {
    this.provider = options.provider;
  }

  get state(): AgentState {
    return this.currentState;
  }

  pause(): void {
    if (this.currentState === "running") {
      this.pauseRequested = true;
      this.setState("paused");
    }
  }

  resume(): void {
    if (this.currentState === "paused") {
      this.pauseRequested = false;
      this.setState("running");
      this.resumeResolver?.();
      this.resumeResolver = undefined;
    }
  }

  cancel(): void {
    this.cancelRequested = true;
    this.resumeResolver?.();
    this.resumeResolver = undefined;
    this.approvalResolver?.(false);
    this.approvalResolver = undefined;
    if (
      this.currentState === "running" ||
      this.currentState === "paused" ||
      this.currentState === "waiting_for_approval"
    ) {
      this.setState("cancelled");
    }
  }

  approve(approved: boolean): void {
    this.approvalResolver?.(approved);
    this.approvalResolver = undefined;
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    if (
      this.currentState === "running" ||
      this.currentState === "paused" ||
      this.currentState === "waiting_for_approval"
    ) {
      throw new Error("Agent is already running.");
    }
    this.cancelRequested = false;
    this.pauseRequested = false;
    this.setState("running", input.onEvent);

    const maxSteps = input.maxSteps ?? 10;
    let prompt = input.prompt;
    let lastResponse: ModelResponse | undefined;

    for (let step = 1; step <= maxSteps; step += 1) {
      if (this.cancelRequested) return this.result("cancelled");
      await this.waitForResume(input.onEvent);
      if (this.cancelRequested) return this.result("cancelled");

      try {
        lastResponse = await this.generateWithTimeout(
          {
            prompt,
            ...(input.system ? { system: input.system } : {}),
            ...(input.outputLocale ? { outputLocale: input.outputLocale } : {}),
          },
          input.timeoutMs,
        );
      } catch (error) {
        const errorCode =
          error instanceof Error && error.message === "AGENT_TIMEOUT" ? "AGENT_TIMEOUT" : undefined;
        this.setState("failed", input.onEvent);
        return { state: "failed", ...(errorCode ? { errorCode } : {}) };
      }
      if (this.cancelRequested) return this.result("cancelled");

      input.onEvent?.({ type: "step", step, text: lastResponse.text });
      if (lastResponse.requiresApproval) {
        this.setState("waiting_for_approval", input.onEvent);
        input.onEvent?.({ type: "approval", action: lastResponse.requiresApproval });
        const approved = await new Promise<boolean>((resolve) => {
          this.approvalResolver = resolve;
        });
        if (this.cancelRequested) return this.result("cancelled");
        if (!approved) {
          this.setState("failed", input.onEvent);
          return { state: "failed", errorCode: "AGENT_APPROVAL_REJECTED" };
        }
        this.setState("running", input.onEvent);
      }
      if (this.pauseRequested) await this.waitForResume(input.onEvent);
      if (lastResponse.done) {
        this.setState("completed", input.onEvent);
        return { state: "completed", response: lastResponse };
      }
      prompt = `${input.prompt}\nPrevious model response:\n${lastResponse.text}`;
    }

    this.setState("failed", input.onEvent);
    return { state: "failed", errorCode: "AGENT_MAX_STEPS" };
  }

  private result(state: "cancelled"): AgentRunResult {
    this.setState(state);
    return { state };
  }

  private setState(state: AgentState, onEvent?: (event: AgentEvent) => void): void {
    this.currentState = state;
    onEvent?.({ type: "state", state });
  }

  private async waitForResume(onEvent?: (event: AgentEvent) => void): Promise<void> {
    if (!this.pauseRequested && this.currentState !== "paused") return;
    if (this.currentState !== "paused") this.setState("paused", onEvent);
    await new Promise<void>((resolve) => {
      this.resumeResolver = resolve;
    });
  }

  private async generateWithTimeout(
    request: { prompt: string; system?: string; outputLocale?: "en" | "zh-CN" },
    timeoutMs?: number,
  ): Promise<ModelResponse> {
    const generation = this.provider.generate(request);
    if (!timeoutMs) return generation;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        generation,
        new Promise<ModelResponse>((_, reject) => {
          timer = setTimeout(() => reject(new Error("AGENT_TIMEOUT")), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
