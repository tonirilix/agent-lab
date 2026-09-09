import { useState } from "react";
import {
  appliedChangeSetSchema,
  type AppliedChangeSet,
} from "../../shared/change-set-contracts";

export type ApprovalState = "proposed" | "approved" | "verified";

async function approveChangeSet(id: string) {
  const response = await fetch(`/api/change-sets/${id}/approve`, {
    method: "POST",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = body as { error?: string };
    throw new Error(error.error ?? "The Change Set could not be applied.");
  }
  return appliedChangeSetSchema.parse(body);
}

export function useChangeSetApproval({
  changeSetId,
  onApplied,
}: {
  changeSetId: string;
  onApplied: (result: AppliedChangeSet) => void;
}) {
  const [state, setState] = useState<ApprovalState>("proposed");
  const [result, setResult] = useState<AppliedChangeSet | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setState("approved");
    setError(null);
    try {
      const applied = await approveChangeSet(changeSetId);
      setResult(applied);
      setState("verified");
      onApplied(applied);
    } catch (reason) {
      setState("proposed");
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  return { approve, error, result, state };
}
