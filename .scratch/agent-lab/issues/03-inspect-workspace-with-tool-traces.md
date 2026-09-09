# 03: Inspect the Workspace through visible Tool Calls

**What to build:** Allow the real Coding Agent to investigate the configured Workspace through bounded list, read, and search Tools. Preserve the chronological Tool Trace inside each Agent Turn so users can inspect the exact arguments and bounded results the model received.

**Blocked by:** 02: Stream a real OpenAI conversation.

**Status:** resolved

- [x] The Coding Agent can list eligible files, read eligible UTF-8 files, and search code on demand during a multi-step Agent Turn.
- [x] Read-only Tool Calls run without individual Approval after the Workspace is configured.
- [x] The agent loop stops after at most 12 model steps.
- [x] A single readable file is bounded to 256 KiB and search output is bounded to 200 matches.
- [x] Truncated Tool results explicitly report that they are incomplete.
- [x] Every Tool Call appears chronologically within its originating Agent Turn and is collapsed by default.
- [x] Expanding a Tool Trace entry reveals the exact bounded arguments and result returned to the model.
- [x] Canonical path checks prevent traversal and symlink escape beyond the Workspace.
- [x] Git internals, installed dependencies, ignored content, binary or invalid-text files, oversized files, environment secrets, credentials, and private keys are not readable.
- [x] Safe configuration templates such as environment examples remain eligible.
- [x] Cancellation prevents any subsequent Tool Calls in the stopped Agent Turn.
- [x] Session-level tests exercise successful inspection, bounds, truncation, secret filtering, traversal rejection, and symlink rejection against real temporary Workspaces.
