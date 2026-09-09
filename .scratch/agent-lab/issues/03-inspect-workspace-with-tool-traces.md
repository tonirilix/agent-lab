# 03: Inspect the Workspace through visible Tool Calls

**What to build:** Allow the real Coding Agent to investigate the configured Workspace through bounded list, read, and search Tools. Preserve the chronological Tool Trace inside each Agent Turn so users can inspect the exact arguments and bounded results the model received.

**Blocked by:** 02: Stream a real OpenAI conversation.

**Status:** ready-for-agent

- [ ] The Coding Agent can list eligible files, read eligible UTF-8 files, and search code on demand during a multi-step Agent Turn.
- [ ] Read-only Tool Calls run without individual Approval after the Workspace is configured.
- [ ] The agent loop stops after at most 12 model steps.
- [ ] A single readable file is bounded to 256 KiB and search output is bounded to 200 matches.
- [ ] Truncated Tool results explicitly report that they are incomplete.
- [ ] Every Tool Call appears chronologically within its originating Agent Turn and is collapsed by default.
- [ ] Expanding a Tool Trace entry reveals the exact bounded arguments and result returned to the model.
- [ ] Canonical path checks prevent traversal and symlink escape beyond the Workspace.
- [ ] Git internals, installed dependencies, ignored content, binary or invalid-text files, oversized files, environment secrets, credentials, and private keys are not readable.
- [ ] Safe configuration templates such as environment examples remain eligible.
- [ ] Cancellation prevents any subsequent Tool Calls in the stopped Agent Turn.
- [ ] Session-level tests exercise successful inspection, bounds, truncation, secret filtering, traversal rejection, and symlink rejection against real temporary Workspaces.

