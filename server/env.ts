import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

export type EnvironmentFileResult = {
  /** Absolute path that was checked. */
  path: string;
  /** Whether a file existed at that path. */
  found: boolean;
  /** Sorted variable names taken from the file. Values are never reported. */
  loaded: string[];
  /** Sorted variable names present in the file but already set in the environment. */
  kept: string[];
};

type LoadOptions = {
  /** File to read. Defaults to `.env` in the current working directory. */
  path?: string;
  /** Target environment. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
};

/**
 * Loads a dotenv-style file into the environment without overriding
 * variables that are already set. A missing file is not an error, so a
 * plain `export OPENAI_API_KEY=...` shell setup keeps working unchanged.
 */
export function loadEnvironmentFile(
  options: LoadOptions = {},
): EnvironmentFileResult {
  const path = resolve(options.path ?? ".env");
  const env = options.env ?? process.env;
  const result: EnvironmentFileResult = {
    path,
    found: false,
    loaded: [],
    kept: [],
  };

  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return result;
    }
    throw error;
  }

  result.found = true;
  for (const [name, value] of Object.entries(parseEnv(content))) {
    if (env[name] !== undefined) {
      result.kept.push(name);
      continue;
    }
    env[name] = value;
    result.loaded.push(name);
  }
  result.loaded.sort();
  result.kept.sort();

  return result;
}

/** One-line summary safe to print at startup: names only, never values. */
export function describeEnvironmentFile(result: EnvironmentFileResult): string {
  if (!result.found) {
    return `No ${result.path} file; using the process environment only.`;
  }
  const parts = [`Loaded ${result.loaded.length} variable(s) from ${result.path}`];
  if (result.loaded.length > 0) {
    parts.push(`(${result.loaded.join(", ")})`);
  }
  if (result.kept.length > 0) {
    parts.push(`; kept existing ${result.kept.join(", ")}`);
  }
  return parts.join(" ") + ".";
}
