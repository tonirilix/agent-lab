import { describe, expect, it } from "vitest";
import { addTask, completeTask } from "../src/tasks.js";
import { summarizeTasks } from "../src/summary.js";

describe("task list", () => {
  it("tracks completion", () => {
    const tasks = addTask([], {
      id: "learn-agent-loop",
      title: "Learn the agent loop",
      completed: false,
    });

    expect(summarizeTasks(completeTask(tasks, "learn-agent-loop"))).toBe(
      "1 of 1 tasks complete",
    );
  });
});
