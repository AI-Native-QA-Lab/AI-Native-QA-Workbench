export type ToolPermission = "read" | "write" | "restricted";

export interface ToolDefinition<Input = unknown, Output = unknown> {
  name: string;
  permission: ToolPermission;
  execute(input: Input): Promise<Output>;
}

export interface ToolExecutionContext {
  runId: string;
  runtimeStore: ToolRuntimeAuditStore;
  approve?: (input: {
    toolName: string;
    permission: ToolPermission;
    input: unknown;
  }) => Promise<boolean>;
  audit?: (record: ToolAuditRecord) => unknown;
}

export interface ToolRuntimeAuditStore {
  appendToolRun(input: {
    runId: string;
    toolName: string;
    permission: ToolPermission;
    status: ToolAuditRecord["status"];
  }): string;
}

export interface ToolAuditRecord {
  toolName: string;
  permission: ToolPermission;
  status: "completed" | "denied" | "failed";
  error?: string;
}

export interface ToolRegistryContract {
  register(tool: ToolDefinition): void;
  execute(name: string, input: unknown, context: ToolExecutionContext): Promise<unknown>;
}

export class ToolRegistry implements ToolRegistryContract {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (!tool.name.trim()) throw new Error("Tool name is required.");
    if (this.tools.has(tool.name)) throw new Error(`Tool already registered: ${tool.name}`);
    this.tools.set(tool.name, tool);
  }

  async execute(name: string, input: unknown, context: ToolExecutionContext): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    const runId = context?.runId;
    const runtimeStore = context?.runtimeStore;
    if (!runId || !runtimeStore) {
      throw new Error("runId and runtimeStore are required for tool audit.");
    }

    const audit = async (status: ToolAuditRecord["status"], error?: string): Promise<void> => {
      const record: ToolAuditRecord = {
        toolName: tool.name,
        permission: tool.permission,
        status,
        ...(error ? { error } : {}),
      };
      runtimeStore.appendToolRun({
        runId,
        toolName: record.toolName,
        permission: record.permission,
        status: record.status,
      });
      await context.audit?.(record);
    };

    if (tool.permission !== "read") {
      if (!context.approve) {
        await audit("denied", "approval callback is required");
        throw new Error(`Tool ${name} requires approval.`);
      }
      const approved = await context.approve({
        toolName: name,
        permission: tool.permission,
        input,
      });
      if (!approved) {
        await audit("denied", "approval rejected");
        throw new Error(`Tool ${name} execution was rejected.`);
      }
    }

    try {
      const output = await tool.execute(input);
      await audit("completed");
      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await audit("failed", message);
      throw error;
    }
  }
}
