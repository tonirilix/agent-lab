import { AlertCircle, Bot, FolderGit2, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import {
  publicAgentConfigurationSchema,
  type PublicAgentConfiguration,
} from "../shared/contracts";
import { Badge } from "./components/ui/badge";

function basename(path: string) {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

export function App() {
  const [config, setConfig] = useState<PublicAgentConfiguration | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Agent Lab could not load its configuration.");
        }
        return publicAgentConfigurationSchema.parse(await response.json());
      })
      .then(setConfig)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      );
  }, []);

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <section className="w-full max-w-lg rounded-3xl border border-danger/30 bg-surface p-8 shadow-xl shadow-black/5">
          <AlertCircle className="mb-5 size-8 text-danger" />
          <h1 className="text-xl font-semibold">Agent Lab could not start</h1>
          <p className="mt-2 text-sm leading-6 text-muted">{error}</p>
        </section>
      </main>
    );
  }

  if (!config) {
    return (
      <main className="grid min-h-screen place-items-center text-sm text-muted">
        Loading Agent Lab…
      </main>
    );
  }

  if (config.status === "invalid-workspace") {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <section className="w-full max-w-xl rounded-3xl border border-danger/30 bg-surface p-8 shadow-xl shadow-black/5">
          <AlertCircle className="mb-5 size-8 text-danger" />
          <h1 className="text-xl font-semibold">Workspace unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-muted">{config.error}</p>
          <p className="mt-5 text-sm leading-6 text-muted">
            Restart with{" "}
            <code className="break-all rounded bg-subtle px-1.5 py-0.5">
              pnpm dev -- --workspace /path/to/repository
            </code>
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 sm:p-8">
      <section className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-border bg-surface shadow-2xl shadow-black/5 sm:min-h-[calc(100vh-4rem)]">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-foreground text-background">
              <Bot className="size-5" />
            </span>
            <div className="min-w-0">
              <h1 className="font-semibold tracking-tight">Agent Lab</h1>
              <p className="truncate text-xs text-muted">
                See how a Coding Agent works
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>
              {config.provider} · {config.model}
            </Badge>
            {config.git ? (
              <Badge>
                {config.git.branch}
                {config.git.dirty ? " · modified" : " · clean"}
              </Badge>
            ) : null}
          </div>
        </header>

        <div className="flex flex-1 flex-col">
          <div className="border-b border-border bg-subtle px-5 py-3 sm:px-8">
            <div className="flex items-center gap-2 text-sm">
              <FolderGit2 className="size-4 shrink-0 text-muted" />
              <span className="font-medium">{basename(config.workspace)}</span>
              <span className="min-w-0 truncate text-muted">
                {config.workspace}
              </span>
            </div>
          </div>

          <div className="grid flex-1 place-items-center px-6 py-16 text-center">
            <div className="max-w-md">
              {config.status === "needs-api-key" ? (
                <>
                  <KeyRound className="mx-auto size-8 text-muted" />
                  <h2 className="mt-5 text-lg font-semibold">
                    Add your OpenAI API key
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    Set{" "}
                    <code className="rounded bg-subtle px-1.5 py-0.5">
                      OPENAI_API_KEY
                    </code>{" "}
                    in the server environment, then restart Agent Lab. The key
                    is never sent to this browser.
                  </p>
                </>
              ) : (
                <>
                  <Bot className="mx-auto size-8 text-muted" />
                  <h2 className="mt-5 text-lg font-semibold">
                    Workspace connected
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    The chat arrives in the next tracer bullet. For now, Agent
                    Lab has established its local Workspace boundary.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
