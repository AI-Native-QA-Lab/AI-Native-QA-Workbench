export type WorkbenchView = "dashboard" | "pipeline" | "assistant";

export function readWorkbenchView(): WorkbenchView {
  if (typeof window === "undefined") return "dashboard";

  const params = new URLSearchParams(window.location.search);
  const value = params.get("view") ?? params.get("variant");
  return value === "pipeline" || value === "assistant" ? value : "dashboard";
}
