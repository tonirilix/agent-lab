# 07: Expose Agent Configuration and turn diagnostics

**What to build:** Give learners a compact, accurate view of the configuration and operational measurements behind each Agent Turn without cluttering the conversation or exposing private reasoning and credentials.

**Blocked by:** 03: Inspect the Workspace through visible Tool Calls.

**Status:** resolved

- [x] A read-only Agent Configuration surface shows the provider, model, effective instructions, available Tools, and Safety Limits.
- [x] Agent Configuration never reveals the OpenAI API key or other secret values.
- [x] Each completed, stopped, or failed Agent Turn has an expandable diagnostics footer.
- [x] Diagnostics include duration, step count, Tool Call count, model, and token usage when OpenAI supplies it.
- [x] The UI clearly differentiates unavailable usage data from a zero value.
- [x] Tool Calls and their bounded results remain visible, while private chain-of-thought is neither requested nor displayed.
- [x] A visible warning appears before the complete bounded transcript becomes too large for another reliable Agent Turn.
- [x] Context is not silently summarized or pruned in the first version.
- [x] The Workspace header links to a concise disclosure that Tool-read source is sent to OpenAI.
- [x] Agent Lab records no telemetry of its own.
- [x] Tests cover credential redaction, diagnostic aggregation, configured limits, and context-warning behavior.

## Answer

Agent Lab now exposes its effective public configuration without credentials and adds collapsed diagnostics for completed, stopped, and failed Agent Turns. Diagnostics retain zero-valued usage separately from unavailable data, private reasoning is excluded from the UI stream, and a visible warning appears before the complete unpruned transcript reaches the configured context threshold. Tests cover public configuration redaction, configured limits, usage aggregation, context preservation, and reasoning redaction.
