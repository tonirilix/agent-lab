# Agent Lab

Status: ready-for-agent

## Problem Statement

Developers can use mature coding agents to discuss changes, inspect repositories, and modify local code, but those products conceal many of the mechanics that make an agent work. A learner who wants to understand the relationship between a chat interface, streamed model responses, Tool Calls, local filesystem access, safety boundaries, human Approval, and resulting code changes has no small, approachable system to study.

The desired project is not merely a chatbot and not a production IDE. It is a proper, working local Coding Agent backed by OpenAI, presented through a polished interface, with the important mechanics made visible and understandable.

## Solution

Build Agent Lab, a local-first application that connects a React chat interface to a local Node server and a real OpenAI model through the AI SDK. The Coding Agent can inspect one configured Workspace using bounded read-only Tools, show every Tool Call and result in an expandable Tool Trace, and discuss possible changes without modifying files.

When the user explicitly makes a Proposal Request, the Coding Agent may prepare one structured Change Set. Agent Lab validates the complete Change Set and presents a server-generated diff in a focused review sheet. Only Approval of that exact Change Set permits the local server to apply it. Application is atomic, rejects stale or unsafe operations, and returns the verified result to the real model so it can complete the Agent Turn with a useful summary.

The interface will use shadcn components and the Message Scroller to provide proven streaming-chat behavior. A bundled Example Workspace and explanatory documentation will let users observe the complete loop safely before targeting another local codebase.

## User Stories

1. As a learner, I want to chat with a real OpenAI model, so that Agent Lab demonstrates a genuine model integration rather than a scripted simulation.
2. As a learner, I want the model connection to stream responses, so that I can observe how an interactive agent responds over time.
3. As a developer, I want to configure a Workspace when starting Agent Lab, so that the Coding Agent has an explicit filesystem boundary.
4. As a developer, I want the active Workspace path displayed in the header, so that I always know which codebase is in scope.
5. As a developer, I want the active provider and model displayed in the header, so that I know which service is processing my conversation and code.
6. As a learner, I want to inspect the effective Agent Configuration, so that I can understand the model, instructions, Tools, and Safety Limits that govern an Agent Turn.
7. As a user, I want a clear error when the configured Workspace is invalid, so that I can correct startup configuration without debugging an opaque server failure.
8. As a user, I want a clear setup state when the OpenAI API key is missing, so that I know how to configure the server safely.
9. As a privacy-conscious developer, I want an explicit notice that inspected source is sent to OpenAI, so that the local-versus-remote boundary is unambiguous.
10. As a user, I want to enter plain-text prompts with familiar keyboard behavior, so that conversation feels natural.
11. As a user, I want Enter to send and Shift+Enter to insert a newline, so that composing messages is efficient.
12. As a user, I want to stop an active Agent Turn, so that I can interrupt unwanted or unproductive work.
13. As a user, I want stopping to abort the model request and prevent further Tool Calls in that turn, so that cancellation has real effect.
14. As a reader, I want streamed Markdown, highlighted code, copy controls, and safe links, so that technical answers are readable and useful.
15. As a reader, I want new turns and streamed content to scroll without stealing my position, so that I can read earlier content while work continues.
16. As a keyboard or assistive-technology user, I want accessible focus, controls, and status announcements, so that the chat is usable without relying on pointer interaction or excessive live-region noise.
17. As a user, I want system light and dark themes, so that Agent Lab follows my workstation preferences.
18. As a user, I want the interface to remain usable at narrow browser widths, so that it does not depend on one fixed desktop size.
19. As a developer, I want the Coding Agent to list eligible files in the Workspace, so that it can discover the repository structure.
20. As a developer, I want the Coding Agent to read eligible UTF-8 source files, including TypeScript and TSX, so that it can understand and modify real application code.
21. As a developer, I want the Coding Agent to search code on demand, so that it can locate relevant symbols without uploading the entire repository on every turn.
22. As a security-conscious user, I want reads restricted to the configured Workspace, so that path traversal and symlinks cannot escape the authorized root.
23. As a security-conscious user, I want secret-bearing files, repository internals, dependencies, binary files, oversized files, and ignored content excluded, so that unsafe or irrelevant data is not sent to the provider.
24. As a learner, I want every Tool Call shown in chronological order within the Agent Turn, so that I can follow how the Coding Agent reached its result.
25. As a learner, I want Tool Trace entries collapsed by default, so that detailed observability does not overwhelm the conversation.
26. As a learner, I want to expand a Tool Trace entry and see the exact bounded arguments and result returned to the model, so that the trace is honest about the model's context.
27. As a learner, I want truncated Tool results clearly marked, so that I do not mistake partial context for complete file or search output.
28. As a user, I want ordinary conversation to remain read-only, so that casual agreement cannot accidentally modify my files.
29. As a user, I want a visible Propose changes action, so that I explicitly decide when the preceding discussion should become a concrete proposal.
30. As a user, I want a Proposal Request to grant proposal capability but not write permission, so that preparing a Change Set remains distinct from approving it.
31. As a developer, I want a Change Set to support creating, modifying, and deleting UTF-8 text files, so that it can represent meaningful code changes.
32. As a reviewer, I want the Change Set summarized in the transcript, so that I can understand its intent before opening the detailed review.
33. As a reviewer, I want a review sheet with a summary, affected-file list, per-file diffs, warnings, and controls, so that Approval is informed.
34. As a learner, I want the structured operations behind a Change Set available through an advanced disclosure, so that I can compare model output with the generated diff.
35. As a reviewer, I want one Approval to apply the complete Change Set, so that related changes form one understandable unit.
36. As a reviewer, I want to reject a Change Set with optional feedback, so that the Coding Agent can revise its proposal through conversation.
37. As a user, I want rejection to leave all Workspace files unchanged, so that reviewing a proposal is safe.
38. As a user, I want application to be atomic, so that a failure cannot leave only part of an approved Change Set on disk.
39. As a user, I want the entire Change Set rejected if any affected file changed after inspection, so that the agent cannot overwrite newer work.
40. As a user, I want unsafe or malformed proposed operations returned to the model as visible Tool errors, so that correction is possible without silent server rewriting.
41. As a user, I want a successful application verified by rereading affected paths and comparing content, so that success represents actual filesystem state.
42. As a user, I want the verified application result returned to OpenAI, so that the Coding Agent can provide an accurate final summary.
43. As a user, I want existing uncommitted work preserved, so that Agent Lab does not assume it owns changes that predate the Agent Turn.
44. As a developer, I want Git branch and dirty state displayed when available, so that repository context is visible without making Git mandatory.
45. As a developer, I want Agent Lab never to stage or commit changes, so that Approval remains limited to the reviewed filesystem operations.
46. As a user, I want only one active Agent Turn and one pending Change Set, so that messages, approvals, and mutations cannot race each other.
47. As a learner, I want visible step, read-size, and search-result limits, so that bounded agent execution is part of the demonstrated design.
48. As a learner, I want turn duration, step count, Tool Call count, model, and available usage information in an expandable footer, so that I can inspect operational behavior without clutter.
49. As a user, I want an interrupted stream marked clearly with a retry option, so that failures are explicit rather than silently restarted.
50. As a learner, I want the complete bounded transcript used until a visible context warning appears, so that hidden summarization does not obscure context management.
51. As a learner, I want a disposable Example Workspace, so that I can exercise the Coding Agent without letting it modify Agent Lab itself.
52. As a TypeScript developer, I want the Example Workspace to contain a small understandable task-list library, so that searches and multi-file Change Sets are easy to follow.
53. As a new contributor, I want one command to start the client and local server in development, so that the split architecture does not create setup friction.
54. As a user, I want a built Agent Lab served by one local Node process, so that normal use does not require manually coordinating two servers.
55. As a learner, I want a README with an architecture diagram and guided exercise, so that I can relate the source modules to the behavior visible in the UI.
56. As a future maintainer, I want provider-specific behavior isolated behind a small boundary, so that another provider can be added without rewriting chat, Tool, or Approval behavior.

## Implementation Decisions

- Agent Lab is a proper local Coding Agent. Its production runtime uses a real OpenAI model; simulated models are limited to automated tests.
- The application is educational first and intended for one trusted user on their own machine.
- The client uses Vite, React, and TypeScript. The local server uses Node.js, TypeScript, and Hono. Next.js and an initial desktop wrapper are intentionally avoided.
- One development command starts client and server. A production build is served locally by one Node process.
- pnpm is the package manager, and dependency versions are locked.
- The client uses shadcn consistently, favoring its Base UI components. The transcript uses Message Scroller, with a centered single-column layout and sticky composer.
- The Change Set review uses a compact transcript card that opens a shadcn Sheet. The Sheet presents summary, affected files, server-generated per-file diffs, warnings, Approval and rejection controls, and an advanced structured-operation view.
- AI SDK provides the provider abstraction, model transport, and streaming protocol. The React client uses its chat primitives, while the server uses its explicit streaming API with declared Tools and stopping conditions rather than hiding the first implementation behind a high-level autonomous agent abstraction.
- OpenAI is the only production provider in the first version. Provider selection, model ID, and credentials are server configuration. The UI shows the effective provider and model but does not edit them.
- The OpenAI API key remains server-side. Missing credentials produce a focused setup state.
- The Agent Configuration is inspectable but read-only in the UI.
- The server binds only to loopback and validates allowed browser origins.
- The Workspace is selected through a startup argument. It may be any accessible directory; Git is optional.
- When Git is present, branch and dirty state are informational. Agent Lab performs no Git mutations.
- Repository discovery is on demand. No full-repository prompt, embedding index, or background indexing is introduced.
- The read-only Tool vocabulary is intentionally limited to listing files, reading a file, and searching code.
- Read-only Tool Calls execute without individual Approval once the Workspace boundary is established.
- Tool paths are canonicalized and checked against the canonical Workspace root. Symlinks may not be used to escape it.
- Eligible content is non-ignored UTF-8 text. Repository internals, installed dependencies, binaries, oversized files, known credential files, private keys, and environment files are blocked. Safe templates such as environment examples remain eligible.
- Default Safety Limits are 12 model steps per Agent Turn, 256 KiB per readable file, and 200 search matches. Limits are visible in Agent Configuration, and truncation is explicit in Tool results.
- The Tool Trace is chronological and nested into the Agent Turn. Every Tool Call and its exact bounded result is retained in memory and expandable, but collapsed by default.
- Private chain-of-thought is not displayed or requested. Visible progress may use concise model-generated summaries.
- An Agent Turn begins from user input and ends in a final response, cancellation, failure, or one pending Change Set.
- Only one Agent Turn may be active, and only one Change Set may be pending.
- Conversation and repository inspection are read-only by default. Conversational phrases, including agreement, never grant write permission.
- Pressing Propose changes creates a Proposal Request. This makes the proposal Tool available for that Agent Turn but grants no filesystem-write permission.
- A Change Set is represented as structured create, modify, and delete operations. Each operation carries its path, operation kind, relevant original fingerprint, and resulting content where applicable.
- The server validates structured operations and derives the displayed diff. The model does not provide the authoritative review diff.
- Approval is attached to the exact validated Change Set. Any revision produces a different Change Set requiring its own Approval.
- Before application, the server validates every operation, path, fingerprint, content bound, and conflict. Any failure rejects the complete Change Set.
- Application is atomic. The server retains the pre-application state needed to restore every affected path if an operation fails.
- A stale affected file rejects the complete Change Set. The server does not merge automatically or apply unaffected subsets.
- Invalid proposal operations produce structured Tool errors that appear in the Tool Trace and may be corrected within the Agent Turn's step limit.
- Rejection leaves the Workspace unchanged and may include feedback that starts a subsequent revision turn.
- After application, the server rereads affected paths, verifies expected results, constructs the actual resulting diff, and returns the result to the model for its final response.
- Source editing supports UTF-8 text, including TypeScript and TSX. Binary editing is excluded. Existing newline conventions and final-newline state are preserved where possible.
- Stop aborts the active model request and prevents subsequent Tool Calls in that Agent Turn. No write begins before separate Approval, so streaming cancellation cannot interrupt an in-progress mutation.
- Conversations are ephemeral. Interrupted streams are marked and may be retried; they are not automatically reconnected or silently restarted.
- The complete bounded transcript is used without silent summarization or pruning. The UI warns when the conversation should be restarted because context is growing too large.
- Assistant content renders streaming Markdown with syntax-highlighted code, copy controls, safe link behavior, and accessible status announcements.
- The interface follows the system color theme, is desktop-first, and remains usable at narrow browser widths.
- The composer accepts plain text only, uses Enter to send and Shift+Enter for newline, and exposes Stop while an Agent Turn is active.
- The Workspace header links to a concise disclosure that repository content read by Tools is sent to the configured OpenAI service.
- Agent Lab has no telemetry of its own in the first version.
- The Example Workspace is a bundled disposable TypeScript task-list library with enough structure to demonstrate listing, reading, searching, multi-file creation, modification, and deletion.
- The README explains the client/server boundary, model/tool loop, Proposal Request and Approval distinction, filesystem safety model, Tool Trace, and a guided Example Workspace exercise.

## Testing Decisions

- Tests exercise externally observable behavior and durable safety guarantees rather than private helper functions, React implementation details, prompt wording, or provider internals.
- The primary automated test seam is the Agent session service driven by a deterministic fake model and a real temporary Workspace.
- The fake model is test infrastructure only. Production and manual operation use the configured OpenAI model.
- Tests observe streamed messages, Tool Traces, pending Change Sets, Approval outcomes, and final filesystem state through the same session-level interface used by the server transport.
- The focused suite covers:
  - successful chat, inspection, Proposal Request, Approval, atomic application, verification, and final response;
  - rejection leaving the Workspace unchanged;
  - path traversal and symlink escape rejection;
  - secret-bearing, ignored, binary, invalid-text, and oversized file rejection;
  - bounded reads and search results with explicit truncation;
  - malformed Change Set feedback and model correction;
  - stale-file rejection;
  - multi-file rollback after a forced application failure;
  - cancellation preventing further model steps and Tool Calls;
  - enforcement of one active Agent Turn and one pending Change Set.
- UI behavior receives a lightweight manual smoke check in the first version rather than a broad browser-automation or snapshot suite.
- Live OpenAI calls are excluded from the automated suite to keep tests deterministic, fast, and free of API cost.
- There is no existing test prior art in the repository. The new Agent session seam is the single preferred behavioral seam.

## Out of Scope

- Multiple production model providers or an in-app model selector
- Model training or fine-tuning
- Multiple users, authentication, accounts, or remote hosting
- Native desktop packaging or native folder pickers
- Multiple saved Workspaces
- Conversation persistence, recovery, branching, or cross-session history
- Concurrent Agent Turns or multiple pending Change Sets
- Autonomous implementation based solely on conversational agreement
- Arbitrary shell access, package-script execution, tests, linting, or automatic repair loops
- Git staging, commits, branches, worktrees, checkpoints, or built-in undo
- Automatic merge or partial application of stale Change Sets
- Rename and move operations
- Binary-file inspection or editing
- File attachments, image input, or rich-text prompt composition
- Web search, MCP integrations, or access to external services beyond OpenAI
- Repository indexing, embeddings, or retrieval infrastructure
- Silent transcript compaction or resumable generation streams
- A permanent IDE-style file tree, code editor, terminal, or preview panel
- A documentation website or comprehensive browser-test suite

## Further Notes

- The key authorization rule is: discussion informs a proposal; a Proposal Request permits preparation; only Approval of the exact Change Set permits writes.
- Tool Trace visibility covers the calls and bounded results that the model used. It does not attempt to expose private model reasoning.
- Product Refinement means adopting and adapting proven interaction components and patterns, particularly shadcn and Message Scroller. It does not mean model fine-tuning.
- The deliberately constrained first version should remain easy to inspect. Later capabilities should be added only after the complete OpenAI-backed loop is understandable and reliable.
