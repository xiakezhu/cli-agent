import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { parseCliArgs } from "./cli/args";
import { createStreamingRenderer } from "./cli/stream";
import { defaultSessionDir, resolveSessionPath } from "./pi/sessionManager";
import {
  defaultSkillRoots,
  preparePromptWithSkills,
  SkillLoader,
  SkillRegistry,
} from "./skills";
import { configureWorkspaceRoots } from "./tools/pathGuard";
import { logger } from "./utils/logger";

function startSpinner(label = "Thinking") {
  if (!process.stdout.isTTY) return () => {};
  const frames = ["|", "/", "-", "\\"];
  let i = 0;
  const timer = setInterval(() => {
    process.stdout.write(`\r${frames[i++ % frames.length]} ${label}...`);
  }, 120);
  return () => {
    clearInterval(timer);
    process.stdout.write("\r");
    process.stdout.clearLine?.(0);
  };
}

const { sessionMode, sessionRef, listSessions } = parseCliArgs(process.argv.slice(2));
const sessionDir = defaultSessionDir();

if (listSessions) {
  const sessions = await SessionManager.list(process.cwd(), sessionDir);
  if (sessions.length === 0) {
    console.log("No sessions found for this project.");
  } else {
    console.log("Sessions:");
    for (const session of sessions) {
      console.log(
        `  ${session.id} — ${session.firstMessage || "(empty)"} (${session.modified.toLocaleString()})`,
      );
    }
  }
  process.exit(0);
}

const { config } = await import("./config");
const { createWallESession } = await import("./pi/session");
configureWorkspaceRoots(config.workspaceRoots);
logger.info("Configured workspace roots", { roots: config.workspaceRoots });

const skillRegistry = await SkillRegistry.discover(defaultSkillRoots());
const skillLoader = new SkillLoader(skillRegistry);
logger.info("Discovered skills", {
  count: skillRegistry.list().length,
  names: skillRegistry.list().map((skill) => skill.name),
});

const baseCapabilities = ["web-search", "filesystem-read", "filesystem-search", "time"] as const;
const capabilities = config.xaiApiKey
  ? ([...baseCapabilities, "web-search-grok"] as const)
  : baseCapabilities;

const sessionPath = sessionRef
  ? await resolveSessionPath(sessionRef, process.cwd(), sessionDir)
  : undefined;
const { session } = await createWallESession(capabilities, {
  sessionMode,
  sessionPath,
  sessionDir,
});

logger.info("Session active", { id: session.sessionId, file: session.sessionFile });

session.subscribe((event) => {
  if (event.type === "tool_execution_start") {
    logger.debug(`[Tool Start] ${event.toolName}`);
  }
  if (event.type === "tool_execution_end") {
    logger.debug(`[Tool End] ${event.toolName}`, { isError: event.isError });
  }
});

const rl = createInterface({ input, output });
try {
  while (true) {
    const text = (await rl.question("User: ")).trim();
    if (!text) continue;
    if (text.toLowerCase() === "exit" || text.toLowerCase() === "quit") break;

    const stopSpinner = startSpinner();
    const renderer = createStreamingRenderer(process.stdout, stopSpinner);
    const unsubscribe = session.subscribe(renderer.handle);
    try {
      const prompt = await preparePromptWithSkills(text, skillRegistry, skillLoader);
      await session.prompt(prompt);
      renderer.finish();
      logger.info("Session usage", session.getSessionStats().tokens);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Agent run failed: ${message}`);
    } finally {
      unsubscribe();
      stopSpinner();
    }
  }
} finally {
  rl.close();
  session.dispose();
}
