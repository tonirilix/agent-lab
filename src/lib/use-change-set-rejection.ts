import { useState } from "react";

export type RejectionState = "pending" | "rejecting" | "rejected";

async function rejectChangeSet(id: string, feedback: string) {
  const response = await fetch(`/api/change-sets/${id}/reject`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ feedback: feedback || undefined }),
  });
  const result = (await response.json()) as { error?: string };
  if (!response.ok) {
    throw new Error(result.error ?? "The Change Set could not be rejected.");
  }
}

export function useChangeSetRejection({
  changeSetId,
  onRejected,
}: {
  changeSetId: string;
  onRejected: (id: string, feedback: string) => void;
}) {
  const [feedback, setFeedback] = useState("");
  const [state, setState] = useState<RejectionState>("pending");
  const [error, setError] = useState<string | null>(null);

  async function reject() {
    const trimmedFeedback = feedback.trim();
    setState("rejecting");
    setError(null);
    try {
      await rejectChangeSet(changeSetId, trimmedFeedback);
      setState("rejected");
      onRejected(changeSetId, trimmedFeedback);
    } catch (reason) {
      setState("pending");
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  return { error, feedback, reject, setFeedback, state };
}
