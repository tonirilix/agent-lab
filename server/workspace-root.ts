import { realpath, stat } from "node:fs/promises";

declare const workspaceRootBrand: unique symbol;

export type WorkspaceRoot = Readonly<{
  canonicalPath: string;
  [workspaceRootBrand]: true;
}>;

export async function resolveWorkspaceRoot(path: string): Promise<WorkspaceRoot> {
  const canonicalPath = await realpath(path);
  const workspaceStat = await stat(canonicalPath);
  if (!workspaceStat.isDirectory()) throw new Error("not a directory");
  return Object.freeze({ canonicalPath }) as WorkspaceRoot;
}
