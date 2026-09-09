# Local Coding Agent

A learning-focused application that makes the relationship between conversational models, local tools, user approval, and source-code changes visible.

## Language

**Coding Agent**:
A conversational system that can inspect a Workspace and use tools to prepare and apply a Change Set.
_Avoid_: Chatbot, assistant

**Workspace**:
The single local code repository that a Coding Agent is permitted to inspect and modify during a session.
_Avoid_: Project folder, working directory

**Change Set**:
One reviewable group of proposed file modifications that is either approved or rejected as a whole.
_Avoid_: Edit, response

**Approval**:
Explicit user authorization to apply a complete Change Set to the Workspace.
_Avoid_: Confirmation, plan approval

**Proposal Request**:
An explicit user action that allows the Coding Agent to prepare a Change Set from the preceding conversation. It does not authorize filesystem writes.
_Avoid_: Approval, implementation mode

**Product Refinement**:
An improvement to interaction behavior, presentation, or usability, often built from proven interface components and patterns.
_Avoid_: Fine-tuning, model tuning

**Tool Call**:
A request from the Coding Agent to inspect the Workspace or prepare an action using one named capability.
_Avoid_: Command, function call

**Tool Trace**:
The complete chronological record of Tool Calls and their results. The interface presents each entry compactly while preserving expandable arguments and output.
_Avoid_: Activity feed, logs

**Agent Turn**:
One ordered exchange that begins with user input and ends with a final response, cancellation, failure, or a pending Change Set.
_Avoid_: Request, run

**Example Workspace**:
A bundled, disposable TypeScript project used to demonstrate and test Agent Lab without modifying Agent Lab itself.
_Avoid_: Fixture, sandbox, sample repository

**Agent Configuration**:
The effective model, provider, instructions, Tool definitions, and Safety Limits governing an Agent Turn.
_Avoid_: Settings, system prompt

**Safety Limit**:
A visible bound on an Agent Turn, Tool result, or Change Set that prevents uncontrolled resource use.
_Avoid_: Quota, guardrail
