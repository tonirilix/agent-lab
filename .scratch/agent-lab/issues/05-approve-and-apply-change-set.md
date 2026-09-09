# 05: Approve and atomically apply a Change Set

**What to build:** Make Approval of the exact reviewed Change Set perform the corresponding create, modify, and delete operations as one atomic local transaction. Verify the resulting Workspace, show the actual result, and return it to OpenAI so the Coding Agent can finish with an accurate summary.

**Blocked by:** 04: Propose and review a structured Change Set.

**Status:** ready-for-agent

- [ ] Only explicit Approval of the currently pending validated Change Set can begin a filesystem mutation.
- [ ] Any revision to a Change Set invalidates its previous Approval and requires new review.
- [ ] All operations are revalidated immediately before application.
- [ ] Create, modify, and delete operations are applied as one atomic unit.
- [ ] If any operation fails, every affected path is restored to its pre-Approval state.
- [ ] Existing newline conventions and final-newline state are preserved where applicable.
- [ ] After application, all affected paths are reread and checked against the approved resulting state.
- [ ] Agent Lab generates and displays the actual applied diff and operation results.
- [ ] The verified application result is returned to the real OpenAI model for the final streamed response.
- [ ] The completed Agent Turn clearly distinguishes proposed, approved, applied, and verified states.
- [ ] Agent Lab never stages, commits, or otherwise mutates Git metadata.
- [ ] A session-level test covers the complete chat, inspection, Proposal Request, Approval, atomic application, verification, and final-response path.

