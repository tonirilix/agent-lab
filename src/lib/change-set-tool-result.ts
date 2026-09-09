import { getToolName } from "ai";
import {
  pendingChangeSetSchema,
  type PendingChangeSet,
} from "../../shared/change-set-contracts";

type VisibleToolPart = Parameters<typeof getToolName>[0];

export function changeSetReviewFromPart(
  part: VisibleToolPart,
): { changeSet: PendingChangeSet; toolInput: unknown; toolOutput: unknown } | null {
  if (getToolName(part) !== "proposeChangeSet") return null;
  if (part.state !== "output-available") return null;
  if (
    typeof part.output !== "object" ||
    part.output === null ||
    !("ok" in part.output) ||
    part.output.ok !== true ||
    !("changeSet" in part.output)
  ) {
    return null;
  }
  const parsed = pendingChangeSetSchema.safeParse(part.output.changeSet);
  return parsed.success
    ? { changeSet: parsed.data, toolInput: part.input, toolOutput: part.output }
    : null;
}
