export type ToolPermission = "read" | "write" | "restricted";

export interface ToolDefinition<Input = unknown, Output = unknown> {
  name: string;
  permission: ToolPermission;
  execute(input: Input): Promise<Output>;
}

export interface ToolExecutionContext {
  approve?: (input: {
    toolName: string;
    permission: ToolPermission;
    input: unknown;
  }) => Promise<boolean>;
  audit?: (record: ToolAuditRecord) => unknown;
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

    const audit = async (status: ToolAuditRecord["status"], error?: string): Promise<void> => {
      await context.audit?.({
        toolName: tool.name,
        permission: tool.permission,
        status,
        ...(error ? { error } : {}),
      });
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
