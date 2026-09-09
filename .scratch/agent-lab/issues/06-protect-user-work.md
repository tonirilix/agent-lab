# 06: Protect user work during conflicts and invalid proposals

**What to build:** Make conflicts and unsafe proposal failures visible and recoverable without sacrificing existing user work. Reject the complete Change Set when any operation is stale, malformed, unsafe, or cannot be applied, and allow the Coding Agent to correct proposal errors within its bounded Agent Turn.

**Blocked by:** 05: Approve and atomically apply a Change Set.

**Status:** resolved

- [x] Changing an affected file after proposal causes Approval to reject the entire Change Set as stale.
- [x] A stale Change Set never applies an otherwise unaffected subset.
- [x] Existing uncommitted Workspace changes that are unrelated to the Change Set remain untouched.
- [x] Malformed operations and unsafe paths become structured Tool errors rather than silent server corrections.
- [x] Structured proposal errors appear in the Tool Trace with the exact bounded error returned to the model.
- [x] The Coding Agent may submit a corrected proposal while the Agent Turn remains within its step limit.
- [x] A forced failure partway through a multi-file application restores modified and deleted files and removes newly created files.
- [x] Application and rollback failures are clearly surfaced without claiming successful verification.
- [x] Tests cover stale create, modify, and delete assumptions, invalid operations, unsafe paths, correction, and forced multi-file rollback.

## Answer

Approval now rejects stale create, modify, and delete assumptions before committing any operation, while unrelated Workspace content remains untouched. Malformed and unsafe proposals stay visible as exact structured Tool errors and can be corrected in the same Agent Turn. Real-filesystem concurrency tests force partial application and rollback failures, proving recoverable paths are restored, agent-created paths are removed, and incomplete recovery is reported without a verified result.
