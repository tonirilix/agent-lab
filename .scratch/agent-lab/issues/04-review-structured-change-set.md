# 04: Propose and review a structured Change Set

**What to build:** Turn the preceding read-only discussion into a concrete, reviewable proposal only when the user makes a Proposal Request. Validate the model's structured create, modify, and delete operations, derive the authoritative diff on the server, and present the proposal without granting write permission.

**Blocked by:** 03: Inspect the Workspace through visible Tool Calls.

**Status:** ready-for-agent

- [ ] Ordinary messages and conversational agreement cannot make proposal or write Tools available.
- [ ] A visible Propose changes action creates a Proposal Request from the existing conversation.
- [ ] A Proposal Request permits preparation of one Change Set but grants no filesystem-write permission.
- [ ] Structured operations support creating, modifying, and deleting eligible UTF-8 text files.
- [ ] Existing-file operations carry the fingerprint of the content on which the proposal is based.
- [ ] The server validates operation shape, paths, fingerprints, content type, and configured bounds before accepting a pending Change Set.
- [ ] The server derives the review diff rather than trusting model-authored diff text.
- [ ] The transcript shows a compact Change Set card with summary and affected-file information.
- [ ] A shadcn Sheet shows the summary, warnings, affected files, per-file diffs, and Approval and rejection controls.
- [ ] An advanced disclosure shows the validated structured operations used to create the diff.
- [ ] Only one Change Set may be pending at a time.
- [ ] Rejection leaves the Workspace unchanged and accepts optional feedback for a later revision turn.
- [ ] Tests demonstrate that discussion, Proposal Request, review, and rejection leave every Workspace file unchanged.

