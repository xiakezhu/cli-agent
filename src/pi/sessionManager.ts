import { existsSync } from "node:fs";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";

export type SessionMode = "continue" | "new";

export type CreateSessionManagerOptions = {
  mode: SessionMode;
  cwd: string;
  sessionDir?: string;
  sessionPath?: string;
};

export function defaultSessionDir(cwd = process.cwd()): string {
  return join(cwd, ".cli-agent", "sessions");
}

/**
 * Creates a SessionManager for the given mode and cwd.
 * - "continue" → resume most recent session for this cwd, or create new if none.
 * - "new" → create a new session file.
 * - sessionPath → open a specific JSONL session file.
 */
export function createSessionManager({
  mode,
  cwd,
  sessionDir = defaultSessionDir(cwd),
  sessionPath,
}: CreateSessionManagerOptions): SessionManager {
  if (sessionPath) {
    return SessionManager.open(sessionPath, sessionDir, cwd);
  }

  switch (mode) {
    case "continue":
      return SessionManager.continueRecent(cwd, sessionDir);
    case "new":
      return SessionManager.create(cwd, sessionDir);
  }
}

export async function resolveSessionPath(
  sessionRef: string,
  cwd = process.cwd(),
  sessionDir = defaultSessionDir(cwd),
): Promise<string> {
  if (existsSync(sessionRef)) return sessionRef;

  const sessions = await SessionManager.list(cwd, sessionDir);
  const matches = sessions.filter(
    (session) => session.id === sessionRef || session.id.startsWith(sessionRef),
  );
  if (matches.length === 1) return matches[0].path;
  if (matches.length === 0) {
    throw new Error(`No session found for: ${sessionRef}`);
  }
  throw new Error(
    `Ambiguous session id "${sessionRef}". Matches: ${matches.map((session) => session.id).join(", ")}`,
  );
}
