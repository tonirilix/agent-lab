# 07: Expose Agent Configuration and turn diagnostics

**What to build:** Give learners a compact, accurate view of the configuration and operational measurements behind each Agent Turn without cluttering the conversation or exposing private reasoning and credentials.

**Blocked by:** 03: Inspect the Workspace through visible Tool Calls.

**Status:** ready-for-agent

- [ ] A read-only Agent Configuration surface shows the provider, model, effective instructions, available Tools, and Safety Limits.
- [ ] Agent Configuration never reveals the OpenAI API key or other secret values.
- [ ] Each completed, stopped, or failed Agent Turn has an expandable diagnostics footer.
- [ ] Diagnostics include duration, step count, Tool Call count, model, and token usage when OpenAI supplies it.
- [ ] The UI clearly differentiates unavailable usage data from a zero value.
- [ ] Tool Calls and their bounded results remain visible, while private chain-of-thought is neither requested nor displayed.
- [ ] A visible warning appears before the complete bounded transcript becomes too large for another reliable Agent Turn.
- [ ] Context is not silently summarized or pruned in the first version.
- [ ] The Workspace header links to a concise disclosure that Tool-read source is sent to OpenAI.
- [ ] Agent Lab records no telemetry of its own.
- [ ] Tests cover credential redaction, diagnostic aggregation, configured limits, and context-warning behavior.

