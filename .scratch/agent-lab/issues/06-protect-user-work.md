# 06: Protect user work during conflicts and invalid proposals

**What to build:** Make conflicts and unsafe proposal failures visible and recoverable without sacrificing existing user work. Reject the complete Change Set when any operation is stale, malformed, unsafe, or cannot be applied, and allow the Coding Agent to correct proposal errors within its bounded Agent Turn.

**Blocked by:** 05: Approve and atomically apply a Change Set.

**Status:** ready-for-agent

- [ ] Changing an affected file after proposal causes Approval to reject the entire Change Set as stale.
- [ ] A stale Change Set never applies an otherwise unaffected subset.
- [ ] Existing uncommitted Workspace changes that are unrelated to the Change Set remain untouched.
- [ ] Malformed operations and unsafe paths become structured Tool errors rather than silent server corrections.
- [ ] Structured proposal errors appear in the Tool Trace with the exact bounded error returned to the model.
- [ ] The Coding Agent may submit a corrected proposal while the Agent Turn remains within its step limit.
- [ ] A forced failure partway through a multi-file application restores modified and deleted files and removes newly created files.
- [ ] Application and rollback failures are clearly surfaced without claiming successful verification.
- [ ] Tests cover stale create, modify, and delete assumptions, invalid operations, unsafe paths, correction, and forced multi-file rollback.

