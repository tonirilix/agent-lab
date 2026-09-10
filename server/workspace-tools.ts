import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, opendir, readFile as readFileFromDisk, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import ignore, { type Ignore } from "ignore";
import type { WorkspaceRoot } from "./workspace-root.js";
import {
  MAX_FILE_BYTES,
  MAX_SEARCH_MATCHES,
} from "../shared/agent-policy.js";

const execFileAsync = promisify(execFile);

export { MAX_FILE_BYTES, MAX_SEARCH_MATCHES } from "../shared/agent-policy.js";
const MAX_LISTED_FILES = 1_000;
const MAX_CANDIDATE_FILES = 5_000;
const MAX_MATCH_TEXT_LENGTH = 500;

const BLOCKED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  ".pnpm",
  "dist",
  "build",
  "coverage",
]);
const BLOCKED_FILENAMES = [
  /^\.env(?:\..+)?$/i,
  /^credentials?(?:\..+)?$/i,
  /^secrets?(?:\..+)?$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/i,
  /^\.npmrc$/i,
  /^\.pypirc$/i,
  /^\.netrc$/i,
  /\.(?:pem|key|p12|pfx)$/i,
];
const SAFE_ENV_TEMPLATE = /^\.env\.(?:example|sample|template)$/i;

type InspectionOptions = { signal?: AbortSignal };
type IgnoreContext = { base: string; rules: Ignore };

export class WorkspaceAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceAccessError";
  }
}

function portablePath(path: string) {
  return path.split(sep).join("/");
}

/**
 * Accepts harmless spellings of the same relative path that models commonly
 * produce: a leading "./" and a trailing "/". Everything else, including any
 * ".." segment, must already be in normalized form and is checked strictly.
 */
function normalizeToolPath(path: string) {
  let normalized = path.trim();
  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }
  while (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized === "" ? "." : normalized;
}

function isInside(root: string, target: string) {
  const fromRoot = relative(root, target);
  return (
    fromRoot === "" ||
    (!fromRoot.startsWith(`..${sep}`) && fromRoot !== ".." && !isAbsolute(fromRoot))
  );
}

function isSafeEnvironmentTemplate(path: string) {
  return SAFE_ENV_TEMPLATE.test(basename(path));
}

function isBlockedName(path: string) {
  if (isSafeEnvironmentTemplate(path)) return false;
  return BLOCKED_FILENAMES.some((pattern) => pattern.test(basename(path)));
}

function assertSafeText(content: Buffer, path: string) {
  if (content.includes(0)) {
    throw new WorkspaceAccessError(`Binary file is not readable: ${path}`);
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    throw new WorkspaceAccessError(`File is not valid UTF-8 text: ${path}`);
  }

  const suspiciousControlBytes = content.reduce(
    (count, byte) =>
      byte < 32 && byte !== 9 && byte !== 10 && byte !== 12 && byte !== 13
        ? count + 1
        : count,
    0,
  );
  if (suspiciousControlBytes > Math.max(1, content.length * 0.01)) {
    throw new WorkspaceAccessError(`Binary file is not readable: ${path}`);
  }
  if (/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(text)) {
    throw new WorkspaceAccessError(`Private-key content is not readable: ${path}`);
  }
  return text;
}

async function loadIgnoreContext(
  root: string,
  relativeDirectory: string,
): Promise<IgnoreContext | null> {
  try {
    const rules = ignore().add(
      await readFileFromDisk(
        resolve(root, relativeDirectory, ".gitignore"),
        "utf8",
      ),
    );
    return { base: relativeDirectory, rules };
  } catch {
    return null;
  }
}

function ignoredByContexts(
  path: string,
  directory: boolean,
  contexts: IgnoreContext[],
) {
  if (isSafeEnvironmentTemplate(path)) return false;
  let ignored = false;
  for (const context of contexts) {
    const relativeToContext = context.base
      ? path.slice(context.base.length + 1)
      : path;
    if (
      context.base &&
      path !== context.base &&
      !path.startsWith(`${context.base}/`)
    ) {
      continue;
    }
    if (!relativeToContext) continue;
    const result = context.rules.test(
      directory ? `${relativeToContext}/` : relativeToContext,
    );
    if (result.ignored) ignored = true;
    if (result.unignored) ignored = false;
  }
  return ignored;
}

export async function createWorkspaceTools(workspace: WorkspaceRoot) {
  const root = workspace.canonicalPath;
  const rootIgnoreContext = await loadIgnoreContext(root, "");
  const baseContexts = rootIgnoreContext ? [rootIgnoreContext] : [];
  let gitAvailable = true;
  try {
    await execFileAsync("git", ["-C", root, "rev-parse", "--is-inside-work-tree"]);
  } catch {
    gitAvailable = false;
  }

  function assertEligiblePath(requestedPath: string) {
    const path = normalizeToolPath(requestedPath);
    if (!requestedPath.trim() || isAbsolute(path)) {
      throw new WorkspaceAccessError(
        `Path must be relative to the Workspace: ${requestedPath}`,
      );
    }
    const target = resolve(root, path);
    if (!isInside(root, target)) {
      throw new WorkspaceAccessError(`Path escapes the Workspace: ${requestedPath}`);
    }
    const relativePath = portablePath(relative(root, target));
    if (portablePath(path) !== relativePath) {
      throw new WorkspaceAccessError(
        `Path must be normalized relative to the Workspace: ${path}`,
      );
    }
    if (
      relativePath
        .split("/")
        .some((segment) => BLOCKED_DIRECTORIES.has(segment))
    ) {
      throw new WorkspaceAccessError(`Path is excluded from inspection: ${path}`);
    }
    if (isBlockedName(relativePath)) {
      throw new WorkspaceAccessError(`Sensitive file is not readable: ${path}`);
    }
    return { target, relativePath };
  }

  async function resolveCanonicalPath(path: string) {
    const candidate = assertEligiblePath(path);
    let canonical: string;
    try {
      canonical = await realpath(candidate.target);
    } catch {
      throw new WorkspaceAccessError(`Path does not exist: ${path}`);
    }
    if (!isInside(root, canonical)) {
      throw new WorkspaceAccessError(
        `Path escapes the Workspace through a symlink: ${path}`,
      );
    }
    return { ...candidate, canonical };
  }

  async function ignoreContextsFor(path: string) {
    const contexts = [...baseContexts];
    const parent = dirname(path);
    if (parent === ".") return contexts;
    const segments = parent.split("/");
    let current = "";
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      const context = await loadIgnoreContext(root, current);
      if (context) contexts.push(context);
    }
    return contexts;
  }

  async function ignoredByGit(path: string) {
    if (!gitAvailable || isSafeEnvironmentTemplate(path)) return false;
    try {
      await execFileAsync("git", [
        "-C",
        root,
        "check-ignore",
        "--quiet",
        "--no-index",
        "--",
        path,
      ]);
      return true;
    } catch {
      return false;
    }
  }

  async function assertNotIgnored(path: string) {
    const contexts = await ignoreContextsFor(path);
    if (
      ignoredByContexts(path, false, contexts) ||
      (await ignoredByGit(path))
    ) {
      throw new WorkspaceAccessError(`Ignored file is not readable: ${path}`);
    }
  }

  async function inspectTextFile(
    path: string,
    options: InspectionOptions = {},
    ignoreAlreadyChecked = false,
  ) {
    options.signal?.throwIfAborted();
    const resolved = await resolveCanonicalPath(path);
    if (!ignoreAlreadyChecked) await assertNotIgnored(resolved.relativePath);
    const fileStat = await lstat(resolved.target);
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
      throw new WorkspaceAccessError(`Path is not a regular file: ${path}`);
    }
    if (fileStat.size > MAX_FILE_BYTES) {
      throw new WorkspaceAccessError(
        `File exceeds the ${MAX_FILE_BYTES}-byte Safety Limit: ${path}`,
      );
    }
    const content = await readFileFromDisk(resolved.canonical);
    options.signal?.throwIfAborted();
    return {
      path: resolved.relativePath,
      content: assertSafeText(content, path),
      fingerprint: createHash("sha256").update(content).digest("hex"),
      sizeBytes: content.byteLength,
      truncated: false as const,
    };
  }

  async function eligibleFiles(
    requestedStartPath = ".",
    options: InspectionOptions = {},
  ) {
    const startPath = normalizeToolPath(requestedStartPath);
    const start =
      startPath === "."
        ? { target: root, canonical: root, relativePath: "" }
        : await resolveCanonicalPath(startPath);
    const startStat = await lstat(start.target);
    if (!startStat.isDirectory()) {
      throw new WorkspaceAccessError(`List path is not a directory: ${startPath}`);
    }
    if (start.relativePath && (await ignoredByGit(start.relativePath))) {
      throw new WorkspaceAccessError(`Ignored directory is not readable: ${startPath}`);
    }

    const candidates: string[] = [];
    let truncated = false;
    const initialContexts = await ignoreContextsFor(
      start.relativePath ? `${start.relativePath}/placeholder` : "placeholder",
    );

    async function walk(directory: string, inherited: IgnoreContext[]) {
      if (candidates.length >= MAX_CANDIDATE_FILES) {
        truncated = true;
        return;
      }
      options.signal?.throwIfAborted();
      const relativeDirectory = portablePath(relative(root, directory));
      const ownContext = await loadIgnoreContext(root, relativeDirectory);
      const contexts = ownContext
        ? [...inherited.filter((item) => item.base !== ownContext.base), ownContext]
        : inherited;
      const entries = [];
      for await (const entry of await opendir(directory)) entries.push(entry);
      entries.sort((left, right) => left.name.localeCompare(right.name));

      for (const entry of entries) {
        if (candidates.length >= MAX_CANDIDATE_FILES) {
          truncated = true;
          return;
        }
        options.signal?.throwIfAborted();
        const absolutePath = resolve(directory, entry.name);
        const relativePath = portablePath(relative(root, absolutePath));
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          if (
            BLOCKED_DIRECTORIES.has(entry.name) ||
            ignoredByContexts(relativePath, true, contexts)
          ) {
            continue;
          }
          await walk(absolutePath, contexts);
          continue;
        }
        if (!entry.isFile() || isBlockedName(relativePath)) continue;
        if (ignoredByContexts(relativePath, false, contexts)) continue;
        candidates.push(relativePath);
      }
    }

    await walk(start.canonical, initialContexts);
    const files: string[] = [];
    for (const path of candidates) {
      options.signal?.throwIfAborted();
      if (await ignoredByGit(path)) continue;
      try {
        await inspectTextFile(path, options, true);
      } catch (error) {
        if (error instanceof WorkspaceAccessError) continue;
        throw error;
      }
      if (files.length === MAX_LISTED_FILES) {
        truncated = true;
        break;
      }
      files.push(path);
    }
    return { files, truncated, limit: MAX_LISTED_FILES };
  }

  return {
    async listFiles(input: { path?: string }, options: InspectionOptions = {}) {
      return eligibleFiles(input.path ?? ".", options);
    },

    async readFile(input: { path: string }, options: InspectionOptions = {}) {
      return inspectTextFile(input.path, options);
    },

    validateProposedContent(input: { path: string; content: string }) {
      const content = Buffer.from(input.content, "utf8");
      if (content.byteLength > MAX_FILE_BYTES) {
        throw new WorkspaceAccessError(
          `Proposed content exceeds the ${MAX_FILE_BYTES}-byte Safety Limit: ${input.path}`,
        );
      }
      assertSafeText(content, input.path);
      return { sizeBytes: content.byteLength };
    },

    async validateCreatePath(input: { path: string }) {
      const proposed = assertEligiblePath(input.path);
      await assertNotIgnored(proposed.relativePath);
      let canonicalParent: string;
      try {
        canonicalParent = await realpath(dirname(proposed.target));
      } catch {
        throw new WorkspaceAccessError(
          `Parent directory does not exist: ${input.path}`,
        );
      }
      if (!isInside(root, canonicalParent)) {
        throw new WorkspaceAccessError(
          `Path escapes the Workspace through a symlink: ${input.path}`,
        );
      }
      try {
        await lstat(proposed.target);
        throw new WorkspaceAccessError(`Create path already exists: ${input.path}`);
      } catch (error) {
        if (
          error instanceof WorkspaceAccessError ||
          !(error instanceof Error && "code" in error && error.code === "ENOENT")
        ) {
          throw error;
        }
      }
      return { path: proposed.relativePath };
    },

    async searchCode(
      input: { query: string; path?: string; caseSensitive?: boolean },
      options: InspectionOptions = {},
    ) {
      if (!input.query) {
        throw new WorkspaceAccessError("Search query must not be empty.");
      }
      const listing = await eligibleFiles(input.path ?? ".", options);
      const matches: Array<{
        path: string;
        line: number;
        column: number;
        text: string;
        lineTruncated: boolean;
      }> = [];
      let totalMatches = 0;
      let outputTruncated = listing.truncated;
      const query = input.caseSensitive
        ? input.query
        : input.query.toLocaleLowerCase();

      for (const path of listing.files) {
        options.signal?.throwIfAborted();
        const file = await inspectTextFile(path, options, true);
        for (const [lineIndex, line] of file.content.split(/\r?\n/).entries()) {
          const searchableLine = input.caseSensitive
            ? line
            : line.toLocaleLowerCase();
          let from = 0;
          while (from <= searchableLine.length) {
            const column = searchableLine.indexOf(query, from);
            if (column === -1) break;
            totalMatches += 1;
            if (matches.length < MAX_SEARCH_MATCHES) {
              const lineTruncated = line.length > MAX_MATCH_TEXT_LENGTH;
              matches.push({
                path,
                line: lineIndex + 1,
                column: column + 1,
                text: line.slice(0, MAX_MATCH_TEXT_LENGTH),
                lineTruncated,
              });
              outputTruncated ||= lineTruncated;
            } else {
              outputTruncated = true;
            }
            from = column + input.query.length;
          }
        }
      }

      return {
        query: input.query,
        matches,
        totalMatches,
        truncated: outputTruncated,
        limit: MAX_SEARCH_MATCHES,
      };
    },
  };
}

export type WorkspaceTools = Awaited<ReturnType<typeof createWorkspaceTools>>;
