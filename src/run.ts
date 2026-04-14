import {
  Agent,
  run,
  setDefaultOpenAIClient,
  setOpenAIAPI,
  setTracingDisabled,
} from "@openai/agents";
import type { AgentInputItem } from "@openai/agents";
import { OpenAI } from "openai";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { config } from "./config";
import { currentTimeTool, searchWebTool } from "./tools";
import { logger } from "./utils/logger";

function startSpinner(label = "Thinking") {
  const frames = ["|", "/", "-", "\\"];
  let i = 0;
  const timer = setInterval(() => {
    const frame = frames[i++ % frames.length];
    process.stdout.write(`\r${frame} ${label}...`);
  }, 120);

  return () => {
    clearInterval(timer);
    process.stdout.write("\r");
    process.stdout.clearLine(0);
  };
}

const client = new OpenAI({
  baseURL: config.openAIBaseURL,
  apiKey: config.llmApiKey,
});

setTracingDisabled(true);
setDefaultOpenAIClient(client);
setOpenAIAPI("chat_completions");

const timeAgent = new Agent({
  name: "Time Agent",
  handoffDescription:
    "Pass to Time Agent if the user query is about current time or timezones.",
  model: config.openAIModel,
  instructions:
    "You provide current time information. You can answer questions and call tools when useful.",
  tools: [currentTimeTool],
});

const triageAgent = new Agent({
  name: "CLI Agent",
  model: config.openAIModel,
  instructions: [
    "You are an LLM agent running on CLI and your name is Wall-E. You can answer questions and call tools when useful.",
    "Decide whether web search is needed. If needed, call searchWeb with a concise query.",
  ].join("\n"),
  handoffs: [timeAgent],
  tools: [searchWebTool],
});

triageAgent.on("agent_tool_start", (ctx, tool, details) => {
  logger.debug(
    `[Tool Start] ${tool.name} with input: ${JSON.stringify(details.toolCall.providerData)}`,
  );
});

triageAgent.on("agent_handoff", (ctx, nextAgent) => {
  logger.debug(`[Agent Handoff] Handing off to ${nextAgent.name}`);
});

const rl = createInterface({ input, output });
let thread: AgentInputItem[] = [];

while (true) {
  const text = (await rl.question("User: ")).trim();
  if (!text) continue;
  if (text.toLowerCase() === "exit" || text.toLowerCase() === "quit") break;

  const stopSpinner = startSpinner();
  try {
    const result = await run(
      triageAgent,
      thread.concat({ role: "user", content: text }),
    );
    stopSpinner();
    thread = result.history;
    console.log(`Agent: ${result.finalOutput ?? ""}`);
  } catch (error) {
    stopSpinner();
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Agent run failed: ${message}`);
  }
}

rl.close();
