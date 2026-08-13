import type { SessionMode } from "../pi/sessionManager";

export type CliArgs = {
  sessionMode: SessionMode;
  sessionRef?: string;
  listSessions: boolean;
};

export function parseCliArgs(argv: readonly string[]): CliArgs {
  let sessionMode: SessionMode = "continue";
  let sessionRef: string | undefined;
  let listSessions = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--new") {
      sessionMode = "new";
      continue;
    }
    if (arg === "--continue") {
      sessionMode = "continue";
      continue;
    }
    if (arg === "--list") {
      listSessions = true;
      continue;
    }
    if (arg === "--session") {
      const value = argv[++i];
      if (!value || value.startsWith("-")) {
        throw new Error("Missing value for --session. Expected a session id or JSONL path.");
      }
      sessionRef = value;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }

  return { sessionMode, sessionRef, listSessions };
}
