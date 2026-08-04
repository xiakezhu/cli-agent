import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

let allowedRoots: readonly string[] = [];

export function configureWorkspaceRoots(roots: readonly string[]): void {
  const normalized = roots
    .map((root) => resolve(root.trim()))
    .filter((root) => root.length > 0);
  allowedRoots = [...new Set(normalized)];
}

export function getWorkspaceRoots(): string[] {
  return [...allowedRoots];
}

export function isWorkspaceConfigured(): boolean {
  return allowedRoots.length > 0;
}

/**
 * Returns the resolved absolute path for `requestedPath` after verifying it is
 * contained within a configured workspace root. Symlinks are resolved so a
 * path that escapes a root through a link is rejected. Fails closed when no
 * workspace roots are configured.
 */
export async function assertPathWithinWorkspace(
  requestedPath: string,
): Promise<string> {
  if (allowedRoots.length === 0) {
    throw new Error(
      "Filesystem access denied: no workspace roots configured",
    );
  }
  if (typeof requestedPath !== "string" || requestedPath.trim() === "") {
    throw new Error("invalid path: must be a non-empty string");
  }

  const absolute = resolve(requestedPath);
  const resolvedPath = await resolveExistingOrClosest(absolute);

  for (const root of allowedRoots) {
    const resolvedRoot = await resolveExistingOrClosest(root);
    if (isWithin(resolvedRoot, resolvedPath)) {
      return absolute;
    }
  }

  throw new Error(
    `path is outside the allowed workspace roots: ${requestedPath}`,
  );
}

/**
 * Resolve the real path of `path`, walking up to the closest existing ancestor
 * when the target does not exist yet. Useful for paths that will be created.
 */
async function resolveExistingOrClosest(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    const parent = dirname(path);
    if (parent === path) return path;
    const resolvedParent = await resolveExistingOrClosest(parent);
    return resolve(resolvedParent, path.slice(parent.length + 1));
  }
}

function isWithin(root: string, candidate: string): boolean {
  if (root === candidate) return true;
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot !== ".." &&
    !pathFromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromRoot)
  );
}
