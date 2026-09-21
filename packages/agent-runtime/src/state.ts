export type AgentState =
  "idle" | "running" | "waiting_for_approval" | "paused" | "completed" | "failed" | "cancelled";

export interface AgentEvent {
  type: "state" | "step" | "approval";
  state?: AgentState;
  step?: number;
  text?: string;
  action?: string;
}
