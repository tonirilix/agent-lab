import { describe, expect, it, vi } from "vitest";
import type { AppliedChangeSet } from "../shared/change-set-contracts.js";
import { createAgentLifecycle } from "./agent-lifecycle.js";

const applied: AppliedChangeSet = {
  id: "proposal-1",
  summary: "Add priority",
  status: "verified",
  lifecycle: ["proposed", "approved", "applied", "verified"],
  files: [],
  actualDiff: "",
};

describe("Agent lifecycle", () => {
  it("waits for a Chat Change Set decision before starting Workflow", async () => {
    const lifecycle = createAgentLifecycle({
      approve: async () => applied,
      reject: async (id) => ({ id, status: "rejected" as const }),
    });
    const finishChat = lifecycle.beginChatTurn();
    lifecycle.registerChatChangeSet("proposal-1");
    finishChat();

    expect(() => lifecycle.beginWorkflow()).toThrow(
      "Decide the pending Change Set before starting a workflow.",
    );
    await lifecycle.reject("proposal-1");
    const finishWorkflow = lifecycle.beginWorkflow();
    finishWorkflow();
  });

  it("admits one active Chat turn or Workflow run and holds Approval for review", async () => {
    const approve = vi.fn(async () => applied);
    const reject = vi.fn(async (id: string, feedback?: string) => ({
      id, status: "rejected" as const, feedback,
    }));
    const onDecision = vi.fn();
    const lifecycle = createAgentLifecycle({ approve, reject });

    const finishChat = lifecycle.beginChatTurn();
    expect(() => lifecycle.beginWorkflow()).toThrow("Another Agent Turn or workflow is active.");
    await expect(lifecycle.approve("proposal-1")).rejects.toThrow("Another Agent Turn or workflow is active.");
    finishChat();

    const finishWorkflow = lifecycle.beginWorkflow();
    expect(() => lifecycle.beginChatTurn()).toThrow("Another Agent Turn or workflow is active.");
    lifecycle.registerWorkflowChangeSet("proposal-1", onDecision);
    await expect(lifecycle.approve("proposal-1")).rejects.toThrow("Workflow verification and review must complete before approval.");
    finishWorkflow();

    await expect(lifecycle.approve("proposal-1")).rejects.toThrow("Workflow verification and review must complete before approval.");
    expect(approve).not.toHaveBeenCalled();
    await expect(lifecycle.reject("proposal-1", "Tests failed")).resolves.toMatchObject({ status: "rejected" });
    expect(reject).toHaveBeenCalledWith("proposal-1", "Tests failed");
    expect(onDecision).toHaveBeenCalledExactlyOnceWith("rejected");
    expect(() => lifecycle.beginChatTurn()).not.toThrow();
  });

  it("blocks Approval during retry and advances the run only after a successful decision", async () => {
    const approve = vi.fn()
      .mockRejectedValueOnce(new Error("Workspace changed"))
      .mockResolvedValueOnce(applied);
    const onDecision = vi.fn();
    const lifecycle = createAgentLifecycle({
      approve,
      reject: async (id) => ({ id, status: "rejected" as const }),
    });

    const finishFirstRun = lifecycle.beginWorkflow();
    lifecycle.registerWorkflowChangeSet("proposal-1", onDecision);
    lifecycle.markWorkflowReady("proposal-1");
    finishFirstRun();

    const finishRetry = lifecycle.beginWorkflow();
    await expect(lifecycle.approve("proposal-1")).rejects.toThrow("Workflow verification and review must complete before approval.");
    lifecycle.markWorkflowReady("proposal-1");
    finishRetry();

    await expect(lifecycle.approve("proposal-1")).rejects.toThrow("Workspace changed");
    expect(onDecision).not.toHaveBeenCalled();
    await expect(lifecycle.approve("proposal-1")).resolves.toEqual(applied);
    expect(onDecision).toHaveBeenCalledExactlyOnceWith("approved");
  });
});
