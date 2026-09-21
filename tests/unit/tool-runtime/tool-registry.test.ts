import { describe, expect, it } from "vitest";

import {
  ToolRegistry,
  type ToolAuditRecord,
  type ToolExecutionContext,
} from "@ai-native-qa-workbench/tool-runtime";

const runtimeContext = (overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext => ({
  runId: "test-run",
  runtimeStore: { appendToolRun: () => "tool-run" },
  ...overrides,
});

describe("ToolRegistry", () => {
  it("executes read tools and audits every execution", async () => {
    const audits: ToolAuditRecord[] = [];
    const registry = new ToolRegistry();
    registry.register({
      name: "quality.read",
      permission: "read",
      execute: async (input: { id: string }) => ({ id: input.id, value: "ok" }),
    });

    await expect(
      registry.execute(
        "quality.read",
        { id: "checkout" },
        runtimeContext({ audit: (record) => audits.push(record) }),
      ),
    ).resolves.toEqual({ id: "checkout", value: "ok" });
    expect(audits).toMatchObject([
      { toolName: "quality.read", permission: "read", status: "completed" },
    ]);
  });

  it("requires approval for write and restricted tools and rejects unknown tools", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "proposal.apply",
      permission: "write",
      execute: async () => "applied",
    });
    registry.register({
      name: "project.delete",
      permission: "restricted",
      execute: async () => "deleted",
    });

    await expect(registry.execute("proposal.apply", {}, runtimeContext())).rejects.toThrow(
      "approval",
    );
    await expect(
      registry.execute("proposal.apply", {}, runtimeContext({ approve: async () => false })),
    ).rejects.toThrow("rejected");
    await expect(
      registry.execute("proposal.apply", {}, runtimeContext({ approve: async () => true })),
    ).resolves.toBe("applied");
    await expect(registry.execute("missing", {}, runtimeContext())).rejects.toThrow("Unknown tool");
  });

  it("records denied and failed tool runs through the audit callback", async () => {
    const audits: ToolAuditRecord[] = [];
    const registry = new ToolRegistry();
    registry.register({ name: "proposal.apply", permission: "write", execute: async () => "ok" });
    registry.register({
      name: "quality.read",
      permission: "read",
      execute: async () => {
        throw new Error("read failed");
      },
    });

    await expect(
      registry.execute(
        "proposal.apply",
        {},
        runtimeContext({ approve: async () => false, audit: (record) => audits.push(record) }),
      ),
    ).rejects.toThrow("rejected");
    await expect(
      registry.execute(
        "quality.read",
        {},
        runtimeContext({ audit: (record) => audits.push(record) }),
      ),
    ).rejects.toThrow("read failed");
    expect(audits.map(({ status }) => status)).toEqual(["denied", "failed"]);
  });

  it("requires runtime audit context for every execution", async () => {
    const registry = new ToolRegistry();
    registry.register({ name: "quality.read", permission: "read", execute: async () => "ok" });

    await expect(
      registry.execute("quality.read", {}, {
        audit: () => undefined,
      } as unknown as ToolExecutionContext),
    ).rejects.toThrow("runId and runtimeStore are required for tool audit");
  });
});
