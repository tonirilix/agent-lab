import type { AppliedChangeSet } from "../shared/change-set-contracts.js";

type RejectedChangeSet = {
  id: string;
  status: "rejected";
  feedback?: string;
};

type ChangeSetDecisions = {
  approve: (id: string) => Promise<AppliedChangeSet>;
  reject: (id: string, feedback?: string) => Promise<RejectedChangeSet>;
};

export class AgentLifecycleBusyError extends Error {
  constructor(message = "Another Agent Turn or workflow is active.") {
    super(message);
    this.name = "AgentLifecycleBusyError";
  }
}

export class WorkflowApprovalBlockedError extends Error {
  constructor() {
    super("Workflow verification and review must complete before approval.");
    this.name = "WorkflowApprovalBlockedError";
  }
}

/** Owns admission and Change Set decisions shared by Chat and Workflow. */
export function createAgentLifecycle(decisions: ChangeSetDecisions) {
  let activeWork: "chat" | "workflow" | "decision" | null = null;
  let pendingChangeSetId: string | null = null;
  let workflowChangeSet: {
    id: string;
    ready: boolean;
    onDecision: (decision: "approved" | "rejected") => void;
  } | null = null;

  function beginWork(kind: "chat" | "workflow" | "decision") {
    if (activeWork === null) {
      activeWork = kind;
    } else {
      throw new AgentLifecycleBusyError();
    }
    let released = false;
    return () => {
      if (released === true) return;
      released = true;
      activeWork = null;
    };
  }

  function finishDecision(id: string, decision: "approved" | "rejected") {
    if (pendingChangeSetId === id) pendingChangeSetId = null;
    if (workflowChangeSet?.id === id) {
      const onDecision = workflowChangeSet.onDecision;
      workflowChangeSet = null;
      onDecision(decision);
    }
  }

  return {
    beginChatTurn: () => beginWork("chat"),

    beginWorkflow: () => {
      if (pendingChangeSetId && workflowChangeSet === null) {
        throw new AgentLifecycleBusyError(
          "Decide the pending Change Set before starting a workflow.",
        );
      }
      const release = beginWork("workflow");
      if (workflowChangeSet) workflowChangeSet.ready = false;
      return release;
    },

    registerChatChangeSet(id: string) {
      pendingChangeSetId = id;
    },

    registerWorkflowChangeSet(
      id: string,
      onDecision: (decision: "approved" | "rejected") => void,
    ) {
      if (activeWork === "chat" || activeWork === "decision" || activeWork === null) {
        throw new Error("A Workflow Change Set can only be registered during its run.");
      }
      if (workflowChangeSet?.id === id || workflowChangeSet === null) {
        pendingChangeSetId = id;
        workflowChangeSet = { id, ready: false, onDecision };
      } else {
        throw new Error("Decide the pending Workflow Change Set before registering another.");
      }
    },

    markWorkflowReady(id: string) {
      if (workflowChangeSet?.id === id) {
        workflowChangeSet.ready = true;
        return;
      }
      throw new Error("Workflow Change Set does not match the pending proposal.");
    },

    async approve(id: string) {
      if (workflowChangeSet?.id === id && workflowChangeSet.ready === false) {
        throw new WorkflowApprovalBlockedError();
      }
      const release = beginWork("decision");
      try {
        const result = await decisions.approve(id);
        finishDecision(result.id, "approved");
        return result;
      } finally {
        release();
      }
    },

    async reject(id: string, feedback?: string) {
      const release = beginWork("decision");
      try {
        const result = await decisions.reject(id, feedback);
        finishDecision(result.id, "rejected");
        return result;
      } finally {
        release();
      }
    },
  };
}

export type AgentLifecycle = ReturnType<typeof createAgentLifecycle>;
