import { Settings2 } from "lucide-react";
import type { PublicAgentConfiguration } from "../../shared/contracts";
import { Button } from "./ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";

type ReadyConfiguration = Extract<
  PublicAgentConfiguration,
  { status: "ready" | "needs-api-key" }
>;

export function AgentConfigurationSheet({
  config,
}: {
  config: ReadyConfiguration;
}) {
  const limits = config.agent.safetyLimits;
  return (
    <Sheet>
      <SheetTrigger render={<Button size="sm" variant="outline" />}>
        <Settings2 /> Agent Configuration
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader className="border-b border-border pr-12">
          <SheetTitle>Agent Configuration</SheetTitle>
          <SheetDescription>
            Effective, read-only behavior for this local session.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-6 text-sm">
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Model
            </h3>
            <p className="mt-2">{config.provider} · {config.model}</p>
          </section>
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Effective instruction policy
            </h3>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-muted-foreground">
              {config.agent.instructions.map((instruction) => (
                <li key={instruction}>{instruction}</li>
              ))}
              {config.agent.turnInstructions.map((instruction) => (
                <li key={instruction}>{instruction}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Available Tools
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {config.agent.tools.map((tool) => (
                <code className="rounded-lg border border-border px-2 py-1 text-xs" key={tool}>
                  {tool}
                </code>
              ))}
            </div>
          </section>
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Safety Limits
            </h3>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-border p-3 text-xs">
              <dt className="text-muted-foreground">Steps per turn</dt><dd>{limits.maxSteps}</dd>
              <dt className="text-muted-foreground">Readable file</dt><dd>{limits.maxFileBytes.toLocaleString()} bytes</dd>
              <dt className="text-muted-foreground">Search matches</dt><dd>{limits.maxSearchMatches}</dd>
              <dt className="text-muted-foreground">Change operations</dt><dd>{limits.maxChangeOperations}</dd>
              <dt className="text-muted-foreground">Change Set content</dt><dd>{limits.maxChangeSetBytes.toLocaleString()} bytes</dd>
            </dl>
          </section>
          <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
            Agent Lab telemetry is off. Provider requests are governed by your OpenAI account.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
