import { tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  WorkspaceAccessError,
  type WorkspaceTools,
} from "./workspace-tools.js";

const MAX_TOOL_PATH_LENGTH = 4_096;
const MAX_SEARCH_QUERY_LENGTH = 1_000;

async function runWorkspaceTool<T>(
  operation: () => Promise<T>,
  abortSignal?: AbortSignal,
) {
  try {
    return { ok: true as const, result: await operation() };
  } catch (error) {
    if (abortSignal?.aborted) throw error;
    if (error instanceof WorkspaceAccessError) {
      return {
        ok: false as const,
        error: { code: "workspace_access_denied", message: error.message },
      };
    }
    throw error;
  }
}

export function createReadOnlyAgentTools(
  workspaceTools: WorkspaceTools,
  onUse?: (name: string) => void,
  onReadFile?: (file: { path: string; fingerprint: string }) => void,
): ToolSet {
  return {
    listFiles: tool({
      description:
        "List eligible UTF-8 text files in the Workspace, optionally below a relative directory.",
      inputSchema: z.object({
        path: z
          .string()
          .max(MAX_TOOL_PATH_LENGTH)
          .optional()
          .describe("Relative directory; defaults to ."),
      }),
      execute: (input, { abortSignal }) => {
        onUse?.("listFiles");
        return runWorkspaceTool(
          () => workspaceTools.listFiles(input, { signal: abortSignal }),
          abortSignal,
        );
      },
    }),
    readFile: tool({
      description:
        "Read one eligible UTF-8 text file from the Workspace, up to the visible file-size Safety Limit.",
      inputSchema: z.object({
        path: z
          .string()
          .max(MAX_TOOL_PATH_LENGTH)
          .describe("Relative file path in the Workspace"),
      }),
      execute: async (input, { abortSignal }) => {
        onUse?.("readFile");
        const output = await runWorkspaceTool(
          () => workspaceTools.readFile(input, { signal: abortSignal }),
          abortSignal,
        );
        if (output.ok) onReadFile?.(output.result);
        return output;
      },
    }),
    searchCode: tool({
      description:
        "Search eligible Workspace files for plain text and return bounded line matches. The optional path may be a file or directory.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .max(MAX_SEARCH_QUERY_LENGTH)
          .describe("Plain text to find"),
        path: z
          .string()
          .max(MAX_TOOL_PATH_LENGTH)
          .optional()
          .describe("Optional relative file or directory"),
        caseSensitive: z.boolean().optional(),
      }),
      execute: (input, { abortSignal }) => {
        onUse?.("searchCode");
        return runWorkspaceTool(
          () => workspaceTools.searchCode(input, { signal: abortSignal }),
          abortSignal,
        );
      },
    }),
  };
}
