import { useChat } from "@ai-sdk/react";
import {
  AlertCircle,
  Bot,
  GitPullRequestArrow,
  RotateCcw,
  Send,
  Square,
  User,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { DefaultChatTransport, isToolUIPart } from "ai";
import type { AppliedChangeSet } from "../../shared/change-set-contracts";
import {
  turnDiagnosticsSchema,
  type AgentUIMessage,
} from "../../shared/agent-messages";
import { useTurnDiagnostics } from "../hooks/use-turn-diagnostics";
import { MessageMarkdown } from "./message-markdown";
import { changeSetReviewFromPart } from "../lib/change-set-tool-result";
import { ChangeSetCard } from "./change-set-card";
import { ToolTraceEntry } from "./tool-trace-entry";
import { Button } from "./ui/button";
import { Message, MessageAvatar, MessageContent } from "./ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "./ui/message-scroller";
import { Textarea } from "./ui/textarea";
import { TurnDiagnosticsFooter } from "./turn-diagnostics-footer";

function TurnNotice({
  children,
  destructive = false,
  onRetry,
}: {
  children: ReactNode;
  destructive?: boolean;
  onRetry: () => void;
}) {
  return (
    <div
      className={
        destructive
          ? "rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          : "rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-foreground"
      }
      role={destructive ? "alert" : "status"}
    >
      <p>{children}</p>
      <Button className="mt-3" variant="outline" size="sm" onClick={onRetry}>
        <RotateCcw /> Retry
      </Button>
    </div>
  );
}

function diagnosticsFromMetadata(metadata: unknown) {
  const parsed = turnDiagnosticsSchema.safeParse(metadata);
  return parsed.success ? parsed.data : null;
}

export function ChatWorkspace({
  model,
  contextWarningCharacters,
}: {
  model: string;
  contextWarningCharacters: number;
}) {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat" }),
    [],
  );
  const { messages, sendMessage, status, stop, regenerate, error } = useChat<AgentUIMessage>({
    transport,
  });
  const [input, setInput] = useState("");
  const [interrupted, setInterrupted] = useState(false);
  const [rejectedChangeSets, setRejectedChangeSets] = useState<Set<string>>(
    () => new Set(),
  );
  const [appliedChangeSets, setAppliedChangeSets] = useState<Set<string>>(
    () => new Set(),
  );
  const active = status === "submitted" || status === "streaming";
  const {
    beginTurn,
    contextWarning,
    finishLocally,
    terminalDiagnostics,
  } = useTurnDiagnostics({ contextWarningCharacters, error, messages, model });
  const hasPendingChangeSet = messages.some((message) =>
    message.parts.some((part) => {
      if (!isToolUIPart(part)) return false;
      const review = changeSetReviewFromPart(part);
      return review
        ? !rejectedChangeSets.has(review.changeSet.id) &&
            !appliedChangeSets.has(review.changeSet.id)
        : false;
    }),
  );

  function submit() {
    const text = input.trim();
    if (!text || active) return;
    setInterrupted(false);
    beginTurn();
    setInput("");
    void sendMessage({ text });
  }

  function retry() {
    setInterrupted(false);
    beginTurn("regenerate");
    void regenerate();
  }

  function requestProposal() {
    if (active || hasPendingChangeSet || messages.length === 0) return;
    setInterrupted(false);
    beginTurn();
    void sendMessage(
      {
        text: "Proposal Request: Prepare one Change Set from our discussion for review.",
      },
      { body: { proposalRequested: true } },
    );
  }

  function handleRejectedChangeSet(id: string, feedback: string) {
    setRejectedChangeSets((current) => new Set(current).add(id));
    if (feedback) {
      setInput(`I rejected the Change Set. Feedback: ${feedback}`);
    }
  }

  function handleAppliedChangeSet(result: AppliedChangeSet) {
    setAppliedChangeSets((current) => new Set(current).add(result.id));
    setInterrupted(false);
    beginTurn();
    void sendMessage(
      { text: "Application Result: Summarize the verified Change Set." },
      { body: { completedChangeSetId: result.id } },
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy={active}>
      {messages.length === 0 ? (
        <div className="grid flex-1 place-items-center px-5 py-8 text-center">
          <div className="max-w-md">
            <Bot className="mx-auto size-9 text-muted-foreground" />
            <h2 className="mt-5 text-xl font-semibold">
              What are we learning today?
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Ask the Coding Agent to inspect the Example Workspace, or discuss
              a change before making a proposal.
            </p>
          </div>
        </div>
      ) : (
      <MessageScrollerProvider defaultScrollPosition="last-anchor">
        <MessageScroller className="flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent
              aria-busy={active}
              className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8"
            >
              {messages.map((message) => {
                const diagnostics = diagnosticsFromMetadata(message.metadata);
                return (
                <MessageScrollerItem
                  key={message.id}
                  messageId={message.id}
                  scrollAnchor={message.role === "user"}
                >
                  <Message align={message.role === "user" ? "end" : "start"}>
                    <MessageAvatar className="size-8 border border-border">
                      {message.role === "user" ? (
                        <User className="size-4" />
                      ) : (
                        <Bot className="size-4" />
                      )}
                    </MessageAvatar>
                    <MessageContent
                      className={
                        message.role === "user"
                          ? "max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-primary-foreground"
                          : "min-w-0 max-w-[min(100%,42rem)] rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3"
                      }
                    >
                      {message.parts.map((part, index) => {
                        const key = `${message.id}-${index}`;
                        if (part.type === "text") {
                          return (
                            <div className="message-markdown" key={key}>
                              <MessageMarkdown>{part.text}</MessageMarkdown>
                            </div>
                          );
                        }
                        if (isToolUIPart(part)) {
                          const review = changeSetReviewFromPart(part);
                          if (review) {
                            return (
                              <ChangeSetCard
                                key={key}
                                changeSet={review.changeSet}
                                toolInput={review.toolInput}
                                toolOutput={review.toolOutput}
                                onRejected={handleRejectedChangeSet}
                                onApplied={handleAppliedChangeSet}
                              />
                            );
                          }
                          return <ToolTraceEntry key={key} part={part} />;
                        }
                        return null;
                      })}
                      {message.role === "assistant" && diagnostics ? (
                        <TurnDiagnosticsFooter
                          diagnostics={diagnostics}
                        />
                      ) : null}
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
                );
              })}
              {status === "submitted" ? (
                <MessageScrollerItem messageId="status-thinking">
                  <div
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                    role="status"
                  >
                    <span className="size-2 animate-pulse rounded-full bg-muted-foreground" />
                    OpenAI is thinking…
                  </div>
                </MessageScrollerItem>
              ) : null}
              {interrupted ? (
                <MessageScrollerItem messageId="status-interrupted">
                  <TurnNotice onRetry={retry}>
                    The turn was stopped. Any partial response is preserved.
                  </TurnNotice>
                </MessageScrollerItem>
              ) : null}
              {error ? (
                <MessageScrollerItem messageId="status-error">
                  <TurnNotice destructive onRetry={retry}>
                    <span className="inline-flex items-center gap-2">
                      <AlertCircle className="size-4" /> {error.message}
                    </span>
                  </TurnNotice>
                </MessageScrollerItem>
              ) : null}
              {terminalDiagnostics ? (
                <MessageScrollerItem messageId="status-diagnostics">
                  <TurnDiagnosticsFooter diagnostics={terminalDiagnostics} />
                </MessageScrollerItem>
              ) : null}
              {contextWarning ? (
                <MessageScrollerItem messageId="status-context-warning">
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm" role="status">
                    This transcript is becoming large. Consider starting a new session before another complex Agent Turn.
                  </div>
                </MessageScrollerItem>
              ) : null}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
      )}

      <form
        className="border-t border-border bg-background/90 p-4 backdrop-blur sm:px-8"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-input bg-card p-2 shadow-sm focus-within:ring-3 focus-within:ring-ring/20">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            disabled={active}
            placeholder="Message Agent Lab…"
            aria-label="Message Agent Lab"
            className="max-h-40 min-h-11 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={requestProposal}
            disabled={active || hasPendingChangeSet || messages.length === 0}
            aria-label={
              hasPendingChangeSet ? "Change Set pending" : "Propose changes"
            }
          >
            <GitPullRequestArrow />
            <span className="hidden sm:inline">
              {hasPendingChangeSet ? "Change Set pending" : "Propose changes"}
            </span>
          </Button>
          {active ? (
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => {
                setInterrupted(true);
                finishLocally("stopped");
                void stop();
              }}
              aria-label="Stop Agent Turn"
            >
              <Square className="fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim()}
              aria-label="Send message"
            >
              <Send />
            </Button>
          )}
        </div>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted-foreground">
          Enter to send · Shift+Enter for a new line
        </p>
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {status === "submitted"
            ? "Message sent. Waiting for OpenAI."
            : status === "streaming"
              ? "OpenAI response started."
              : status === "error"
                ? "The turn failed."
                : interrupted
                  ? "The turn was stopped."
                  : "Ready for a message."}
        </p>
      </form>
    </div>
  );
}
