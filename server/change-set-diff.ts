import { createTwoFilesPatch } from "diff";
import type { ChangeOperation } from "../shared/change-set-contracts.js";

export function createChangeSetDiff(
  operation: ChangeOperation,
  originalContent: string,
) {
  const resultingContent = operation.kind === "delete" ? "" : operation.content;
  const beforePath =
    operation.kind === "create" ? "/dev/null" : `a/${operation.path}`;
  const afterPath =
    operation.kind === "delete" ? "/dev/null" : `b/${operation.path}`;
  return createTwoFilesPatch(
    beforePath,
    afterPath,
    originalContent,
    resultingContent,
    "",
    "",
    { context: 3 },
  );
}
