import type { Task } from "./tasks.js";

export function summarizeTasks(tasks: Task[]): string {
  const complete = tasks.filter((task) => task.completed).length;
  return `${complete} of ${tasks.length} tasks complete`;
}
