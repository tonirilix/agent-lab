# 01: Launch Agent Lab against an Example Workspace

**What to build:** A runnable local Agent Lab shell that starts its React client and Hono server with one development command, accepts an explicit Workspace, and makes the effective local configuration visible before any model interaction. Include a disposable TypeScript task-list Example Workspace so the application can be explored without targeting its own source.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] One pnpm command starts the Vite client and local Hono server for development.
- [ ] Startup accepts a Workspace path and resolves it to an accessible canonical directory.
- [ ] The server binds to loopback rather than exposing itself to the local network.
- [ ] The browser shows the Workspace path, configured OpenAI provider, and configured model.
- [ ] When the Workspace is a Git repository, the browser shows its branch and dirty state without mutating Git.
- [ ] A missing or invalid Workspace produces a focused setup error with a corrective action.
- [ ] A missing OpenAI API key produces a focused setup state without exposing credentials to browser code.
- [ ] A small disposable TypeScript task-list Example Workspace is available for demonstrations.
- [ ] The initial shell uses shadcn components and follows the system light or dark theme.
- [ ] Automated checks cover valid and invalid startup configuration through an externally visible server boundary.

