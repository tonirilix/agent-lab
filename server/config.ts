import { execFile } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { promisify } from "node:util";
import {
  publicAgentConfigurationSchema,
  type PublicAgentConfiguration,
} from "../shared/contracts.js";

const execFileAsync = promisify(execFile);

export type GitState = {
  branch: string;
  dirty: boolean;
};

type ConfiguredAgent = {
  status: "ready" | "needs-api-key";
  workspace: string;
  provider: "OpenAI";
  model: string;
  openAiApiKey?: string;
  git: GitState | null;
};

type InvalidWorkspace = {
  status: "invalid-workspace";
  requestedWorkspace: string;
  provider: "OpenAI";
  model: string;
  openAiApiKey?: string;
  git: null;
  error: string;
};

export type AgentConfiguration = ConfiguredAgent | InvalidWorkspace;

type ConfigurationInput = {
  workspace: string;
  openAiApiKey?: string;
  openAiModel?: string;
};

async function readGitState(workspace: string): Promise<GitState | null> {
  try {
    const [{ stdout: branch }, { stdout: changes }] = await Promise.all([
      execFileAsync("git", ["-C", workspace, "branch", "--show-current"]),
      execFileAsync("git", ["-C", workspace, "status", "--porcelain"]),
    ]);

    return {
      branch: branch.trim() || "detached",
      dirty: changes.trim().length > 0,
    };
  } catch {
    return null;
  }
}

export async function resolveAgentConfiguration(
  input: ConfigurationInput,
): Promise<AgentConfiguration> {
  const model = input.openAiModel?.trim() || "gpt-5.6-sol";
  const apiKey = input.openAiApiKey?.trim() || undefined;
  let workspace: string;

  try {
    workspace = await realpath(input.workspace);
    const workspaceStat = await stat(workspace);
    if (!workspaceStat.isDirectory()) {
      throw new Error("not a directory");
    }
  } catch {
    return {
      status: "invalid-workspace",
      requestedWorkspace: input.workspace,
      provider: "OpenAI",
      model,
      openAiApiKey: apiKey,
      git: null,
      error: `Workspace does not exist or is not a directory: ${input.workspace}`,
    };
  }

  return {
    workspace,
    provider: "OpenAI",
    model,
    openAiApiKey: apiKey,
    status: apiKey ? "ready" : "needs-api-key",
    git: await readGitState(workspace),
  };
}

export function publicAgentConfiguration(
  config: AgentConfiguration,
): PublicAgentConfiguration {
  const candidate =
    config.status === "invalid-workspace"
      ? {
          status: config.status,
          requestedWorkspace: config.requestedWorkspace,
          provider: config.provider,
          model: config.model,
          git: config.git,
          error: config.error,
        }
      : {
          status: config.status,
          workspace: config.workspace,
          provider: config.provider,
          model: config.model,
          git: config.git,
        };

  return publicAgentConfigurationSchema.parse(candidate);
}
