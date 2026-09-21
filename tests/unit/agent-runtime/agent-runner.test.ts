import { describe, expect, it } from "vitest";

import { AgentRunner, type AgentEvent } from "@ai-native-qa-workbench/agent-runtime";
import { MockProvider } from "@ai-native-qa-workbench/model-providers";

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe("AgentRunner", () => {
  it("transitions from idle to running to completed and emits step events", async () => {
    const events: AgentEvent[] = [];
    const runner = new AgentRunner({ provider: new MockProvider([{ text: "done", done: true }]) });

    const result = await runner.run({ prompt: "Run", onEvent: (event) => events.push(event) });

    expect(result.state).toBe("completed");
    expect(result.response?.text).toBe("done");
    expect(events.map((event) => event.type)).toEqual(["state", "step", "state"]);
  });

  it("fails deterministically at maxSteps and supports cancellation", async () => {
    const maxStepsRunner = new AgentRunner({
      provider: new MockProvider([
        { text: "continue", done: false },
        { text: "continue", done: false },
      ]),
    });
    await expect(maxStepsRunner.run({ prompt: "Run", maxSteps: 1 })).resolves.toMatchObject({
      state: "failed",
      errorCode: "AGENT_MAX_STEPS",
    });

    const cancelRunner = new AgentRunner({
      provider: new MockProvider([{ text: "slow", done: false }], { delayMs: 20 }),
    });
    const running = cancelRunner.run({ prompt: "Run", maxSteps: 3 });
    cancelRunner.cancel();
    await expect(running).resolves.toMatchObject({ state: "cancelled" });
  });

  it("supports pause/resume, timeout, and approval transitions", async () => {
    const pauseRunner = new AgentRunner({
      provider: new MockProvider([{ text: "done", done: true }], { delayMs: 20 }),
    });
    const pausedRun = pauseRunner.run({ prompt: "Run" });
    pauseRunner.pause();
    await wait(5);
    expect(pauseRunner.state).toBe("paused");
    pauseRunner.resume();
    await expect(pausedRun).resolves.toMatchObject({ state: "completed" });

    const timeoutRunner = new AgentRunner({
      provider: new MockProvider([{ text: "slow", done: true }], { delayMs: 30 }),
    });
    await expect(timeoutRunner.run({ prompt: "Run", timeoutMs: 5 })).resolves.toMatchObject({
      state: "failed",
      errorCode: "AGENT_TIMEOUT",
    });

    const approvalRunner = new AgentRunner({
      provider: new MockProvider([
        { text: "needs approval", done: true, requiresApproval: "apply" },
      ]),
    });
    const approvalRun = approvalRunner.run({ prompt: "Run" });
    await wait(5);
    expect(approvalRunner.state).toBe("waiting_for_approval");
    approvalRunner.approve(true);
    await expect(approvalRun).resolves.toMatchObject({ state: "completed" });
  });
});
