export type ToolTraceRecord = {
  id: string;
  name: string;
  status: "running" | "completed" | "failed";
  input: unknown;
  output?: unknown;
  error?: string;
};

export function isToolResultError(value: unknown): boolean {
  if (value === null) return false;
  return typeof value === "object" && "ok" in value && value.ok === false;
}
