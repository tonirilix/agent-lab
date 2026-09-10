import {
  MAX_CHANGE_OPERATIONS,
  MAX_CHANGE_SET_BYTES,
} from "./change-set-contracts.js";

export const MAX_AGENT_STEPS = 12;
export const MAX_FILE_BYTES = 256 * 1024;
export const MAX_SEARCH_MATCHES = 200;
export const CONTEXT_WARNING_CHARACTERS = 100_000;

export const BASE_AGENT_INSTRUCTIONS = [
  "You are the Coding Agent in Agent Lab.",
  "Use the read-only Workspace Tools to investigate code when needed.",
  "Discussion and Proposal Requests never grant write permission; only explicit Approval of an exact validated Change Set permits Workspace mutation.",
  "Be concise and explain conclusions using the evidence you inspected.",
] as const;

export const TURN_INSTRUCTION_POLICY = [
  "Every turn states whether filesystem writes are unavailable or a previously approved Change Set was already applied and verified.",
  "Only a Proposal Request enables proposeChangeSet; otherwise the turn explicitly says that no Change Set may be prepared.",
  "A completion turn receives the authoritative verified application result; other turns explicitly receive no application result.",
] as const;

export const PUBLIC_AGENT_POLICY = {
  instructions: BASE_AGENT_INSTRUCTIONS,
  turnInstructions: TURN_INSTRUCTION_POLICY,
  tools: [
    "listFiles",
    "readFile",
    "searchCode",
    "proposeChangeSet (Proposal Request only)",
  ],
  safetyLimits: {
    maxSteps: MAX_AGENT_STEPS,
    maxFileBytes: MAX_FILE_BYTES,
    maxSearchMatches: MAX_SEARCH_MATCHES,
    maxChangeOperations: MAX_CHANGE_OPERATIONS,
    maxChangeSetBytes: MAX_CHANGE_SET_BYTES,
    contextWarningCharacters: CONTEXT_WARNING_CHARACTERS,
  },
  telemetry: false,
} as const;
