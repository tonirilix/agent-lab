# 02: Stream a real OpenAI conversation

**What to build:** A complete conversational path from the Agent Lab composer through the local server to a real OpenAI model and back as a streamed assistant response. Present the exchange with polished shadcn chat components and Message Scroller behavior while keeping model credentials server-side.

**Blocked by:** 01: Launch Agent Lab against an Example Workspace.

**Status:** resolved

- [x] Production conversations use the configured real OpenAI model through the AI SDK provider boundary.
- [x] Automated tests can substitute a deterministic fake model without changing the production chat path.
- [x] The composer sends plain text with Enter, inserts a newline with Shift+Enter, and prevents duplicate submission while a turn is active.
- [x] Coding Agent content streams incrementally and renders Markdown, highlighted code, copy controls, and safe links.
- [x] Message Scroller follows live output only while the reader remains at the live edge and does not steal position after the reader scrolls away.
- [x] Stop aborts the active model request and prevents further work in that Agent Turn.
- [x] An interrupted or failed turn is visibly distinguished and can be retried without silently reconnecting.
- [x] Only one Agent Turn may be active at a time.
- [x] Chat controls and streaming status are keyboard accessible and announced without excessive live-region updates.
- [x] The client never receives or renders the OpenAI API key.
