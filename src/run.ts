import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { createStreamingRenderer } from "./cli/stream";
import { config } from "./config";
import { configureWorkspaceRoots } from "./tools/pathGuard";
import { logger } from "./utils/logger";
import { createWallESession } from "./pi/session";

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

configureWorkspaceRoots(config.workspaceRoots);
logger.info("Configured workspace roots", { roots: config.workspaceRoots });

const baseCapabilities = ["web-search", "filesystem-read", "filesystem-search"] as const;
const { session } = await createWallESession(baseCapabilities);

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
      await session.prompt(text);
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
