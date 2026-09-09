# 05: Approve and atomically apply a Change Set

**What to build:** Make Approval of the exact reviewed Change Set perform the corresponding create, modify, and delete operations as one atomic local transaction. Verify the resulting Workspace, show the actual result, and return it to OpenAI so the Coding Agent can finish with an accurate summary.

**Blocked by:** 04: Propose and review a structured Change Set.

**Status:** resolved

- [x] Only explicit Approval of the currently pending validated Change Set can begin a filesystem mutation.
- [x] Any revision to a Change Set invalidates its previous Approval and requires new review.
- [x] All operations are revalidated immediately before application.
- [x] Create, modify, and delete operations are applied as one atomic unit.
- [x] If any operation fails, every affected path is restored to its pre-Approval state.
- [x] Existing newline conventions and final-newline state are preserved where applicable.
- [x] After application, all affected paths are reread and checked against the approved resulting state.
- [x] Agent Lab generates and displays the actual applied diff and operation results.
- [x] The verified application result is returned to the real OpenAI model for the final streamed response.
- [x] The completed Agent Turn clearly distinguishes proposed, approved, applied, and verified states.
- [x] Agent Lab never stages, commits, or otherwise mutates Git metadata.
- [x] A session-level test covers the complete chat, inspection, Proposal Request, Approval, atomic application, verification, and final-response path.

## Answer

Approval is bound to the exact pending Change Set ID. The server revalidates and stages every operation, applies the group with recoverable per-path backups, verifies the resulting Workspace, and only then records a verified result for the final OpenAI-backed Agent Turn. The review Sheet shows lifecycle states, per-file outcomes, and actual applied diffs. Session tests cover the complete successful flow, revision invalidation, newline preservation, and rollback during a real competing filesystem write.
