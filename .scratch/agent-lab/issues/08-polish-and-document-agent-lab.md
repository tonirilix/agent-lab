# 08: Polish and document the complete local experience

**What to build:** Finish Agent Lab as a coherent local learning project: serve the built application through one secured local Node process, refine the responsive and accessible shadcn experience, and document a guided real-OpenAI exercise against the bundled Example Workspace.

**Blocked by:** 06: Protect user work during conflicts and invalid proposals; 07: Expose Agent Configuration and turn diagnostics.

**Status:** claimed

- [x] A production build is served by one Node process bound only to loopback.
- [x] The server validates the expected browser origin before accepting agent or filesystem requests.
- [x] The complete interface consistently uses shadcn components and follows the system light or dark theme.
- [x] The centered transcript, sticky composer, Tool Trace disclosures, and review Sheet remain usable at narrow browser widths.
- [x] Focus movement, button names, dialog behavior, status announcements, and reduced-motion behavior receive a manual accessibility smoke check.
- [x] Message Scroller preserves reader intent during streaming, navigation, and layout changes.
- [x] Setup, empty, loading, stopped, failed, proposal, rejected, applying, and completed states have clear presentation.
- [x] The README includes setup instructions, the client/server architecture, the model-and-Tool loop, the authorization boundary, and the filesystem safety model.
- [x] The README includes a guided exercise that uses a real configured OpenAI model to inspect and modify the disposable TypeScript Example Workspace.
- [x] The README identifies the deterministic fake model as test-only infrastructure.
- [x] The documented development and production commands work from a fresh dependency installation.
- [ ] The focused automated suite passes, and the full Example Workspace flow receives a manual smoke test.
