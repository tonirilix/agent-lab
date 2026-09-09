# 02: Stream a real OpenAI conversation

**What to build:** A complete conversational path from the Agent Lab composer through the local server to a real OpenAI model and back as a streamed assistant response. Present the exchange with polished shadcn chat components and Message Scroller behavior while keeping model credentials server-side.

**Blocked by:** 01: Launch Agent Lab against an Example Workspace.

**Status:** ready-for-agent

- [ ] Production conversations use the configured real OpenAI model through the AI SDK provider boundary.
- [ ] Automated tests can substitute a deterministic fake model without changing the production chat path.
- [ ] The composer sends plain text with Enter, inserts a newline with Shift+Enter, and prevents duplicate submission while a turn is active.
- [ ] Assistant content streams incrementally and renders Markdown, highlighted code, copy controls, and safe links.
- [ ] Message Scroller follows live output only while the reader remains at the live edge and does not steal position after the reader scrolls away.
- [ ] Stop aborts the active model request and prevents further work in that Agent Turn.
- [ ] An interrupted or failed turn is visibly distinguished and can be retried without silently reconnecting.
- [ ] Only one Agent Turn may be active at a time.
- [ ] Chat controls and streaming status are keyboard accessible and announced without excessive live-region updates.
- [ ] The client never receives or renders the OpenAI API key.

