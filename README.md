# Agent Lab

Agent Lab is a small, real local Coding Agent built to make the agent loop understandable. A React chat streams responses from an OpenAI model through a local Node server. The model can inspect one explicitly selected Workspace with bounded read-only Tools, but it cannot write during ordinary conversation. A file change requires a structured Change Set, review, and explicit Approval of that exact revision.

This is a learning project for one trusted user on their own machine, not a hosted IDE or a sandbox for untrusted repositories.

## Requirements

- Node.js 20 or newer
- pnpm 11.9.0 (Corepack can install the version declared in `package.json`)
- An OpenAI API key for real Agent Turns

## Run in development

From a fresh checkout:

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev -- --workspace examples/task-list
```

Put your key in `.env` as `OPENAI_API_KEY=...`. The server reads `.env` from the project root at startup and prints which variable names it loaded, never their values. Variables already exported in your shell take precedence over the file, so `export OPENAI_API_KEY="your-key"` still works without a `.env`. Restart the dev command after editing `.env`.

Open <http://127.0.0.1:5173> or <http://localhost:5173>. One command starts Vite and the local Hono server. If `OPENAI_API_KEY` is absent, the UI opens in a safe setup state and no Agent Turn can start.

The default model is `gpt-5.6-sol`. Set `OPENAI_MODEL` to another model available to your OpenAI account. To target a different Workspace, replace `examples/task-list` with its absolute or relative path.

## Run the production build

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start -- --workspace examples/task-list
```

The production server reads the same `.env` file. All supported variables are documented in `.env.example`.

Open <http://127.0.0.1:8787>. A single Node process serves both the built client and `/api` routes and binds only to loopback. Agent and Change Set requests must carry the expected browser origin. `AGENT_LAB_PORT` changes the production port; `AGENT_LAB_BROWSER_ORIGIN` can explicitly override the expected origin when needed.

Keep credentials in the server environment or in the Git-ignored `.env` file. Never put an API key in client code, a prompt, or the Workspace, and never give a secret a `VITE_` prefix, because Vite exposes those variables to the browser.

## How the pieces fit together

```text
React + AI SDK useChat
        │ streamed UI messages and visible Tool Traces
        ▼
Local Hono server ───────► OpenAI model
        │                    │
        │ bounded Tool Call  │ next model step
        ▼                    │
Workspace Tools ◄────────────┘
        │
        ├─ list/read/search: read-only, bounded, visible
        └─ proposal: validated Change Set, still read-only
                              │
                    explicit user Approval
                              ▼
                atomic apply → reread → verify
                              │
                              └─ verified result returns to OpenAI
```

Important modules:

- `src/` contains the React interface, shadcn components, Message Scroller transcript, Tool Trace, and Change Set review Sheet.
- `server/app.ts` is the HTTP and streaming boundary.
- `server/agent-session.ts` runs the explicit model-and-Tool loop through the AI SDK.
- `server/workspace-tools.ts` exposes bounded file listing, UTF-8 reads, and code search.
- `server/change-set.ts` owns proposal validation and Approval identity.
- `server/workspace-transaction.ts` applies and verifies the complete Change Set or rolls it back.
- `shared/` contains contracts and the public Agent policy used by both sides.

The production model adapter is OpenAI. The deterministic AI SDK mock used by the automated suite is test-only infrastructure; it is never selected by the application runtime.

## Authorization and filesystem safety

The authorization sequence is deliberately narrow:

1. Conversation and Workspace inspection are read-only.
2. **Propose changes** starts a Proposal Request and temporarily exposes the proposal Tool. It grants no write permission.
3. The server validates the operations and creates the review diff.
4. Only **Approve Change Set** authorizes that exact Change Set ID and content.
5. Before writing, the server rechecks every path, fingerprint, and content limit. One stale or invalid operation rejects the whole set.
6. Application uses recoverable staging and backups. It rereads every affected path and reports success only after verification. A partial failure triggers rollback.

Workspace paths are canonicalized beneath the selected root. Symlink escapes, ignored files, Git internals, dependencies, secret-bearing names, private keys, binary or invalid UTF-8 content, and oversized files are excluded. Agent Lab never runs shell commands for the model and never stages or commits Git changes. Unrelated existing work is left alone.

Tool-read source stays local until a Tool reads it; that bounded Tool result is then included in the conversation sent to OpenAI. Agent Lab records no telemetry of its own. Conversations are ephemeral and the complete bounded transcript remains in memory without hidden summarization; the UI warns before it becomes too large for another reliable turn.

## Guided real-OpenAI exercise

Use the bundled `examples/task-list` Workspace so every Change Set is disposable.

1. Start Agent Lab with the development command above and confirm the header shows `task-list`, OpenAI, and your configured model.
2. Open **Agent Configuration**. Inspect the effective instruction policy, four Tool capabilities, Safety Limits, and telemetry status.
3. Send: “Inspect this Workspace and explain its task model. Do not propose changes.” Expand each Tool Trace to compare the exact arguments and bounded result with the answer. No file should change.
4. Continue: “I want tasks to support an optional priority of low, normal, or high. Update the summary to mention how many high-priority tasks remain, and update the TypeScript test.” Discussion still cannot write files.
5. Select **Propose changes**. Review the affected `.ts` files, server-generated diffs, warnings, and exact structured Tool arguments. Reject once with feedback if you want to observe the revision loop.
6. Request a new proposal if needed, then approve the exact Change Set. Watch the applying and verified states, followed by the model’s summary of the authoritative application result.
7. Inspect the expandable turn diagnostics and run the Example Workspace test yourself:

   ```bash
   pnpm --dir examples/task-list test
   git diff -- examples/task-list
   ```

To discard only this exercise’s changes, first inspect the diff, then run `git restore -- examples/task-list`. That command intentionally removes uncommitted changes in the Example Workspace.

## Verification

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm --dir examples/task-list test
```

Automated tests use real temporary directories and the same Agent session boundary as the server while replacing only the paid OpenAI call with a deterministic fake model. Live OpenAI calls stay out of the test suite to keep it fast, deterministic, and free of API cost.
