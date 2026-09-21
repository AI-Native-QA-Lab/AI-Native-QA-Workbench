import { describe, expect, it } from "vitest";

import { ToolRegistry, type ToolAuditRecord } from "@ai-native-qa-workbench/tool-runtime";

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
        { audit: (record) => audits.push(record) },
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

    await expect(registry.execute("proposal.apply", {}, {})).rejects.toThrow("approval");
    await expect(
      registry.execute("proposal.apply", {}, { approve: async () => false }),
    ).rejects.toThrow("rejected");
    await expect(
      registry.execute("proposal.apply", {}, { approve: async () => true }),
    ).resolves.toBe("applied");
    await expect(registry.execute("missing", {}, {})).rejects.toThrow("Unknown tool");
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
        { approve: async () => false, audit: (record) => audits.push(record) },
      ),
    ).rejects.toThrow("rejected");
    await expect(
      registry.execute("quality.read", {}, { audit: (record) => audits.push(record) }),
    ).rejects.toThrow("read failed");
    expect(audits.map(({ status }) => status)).toEqual(["denied", "failed"]);
  });
});
