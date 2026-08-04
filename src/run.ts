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
import {
  defaultSkillRoots,
  createSkillResourceReadTool,
  formatSkillInstructions,
  parseExplicitSkillSelection,
  resolveSkillCapabilities,
  selectSkillsImplicitly,
  SkillLoader,
  SkillRegistry,
} from "./skills";
import { currentTimeTool, getTools } from "./tools";
import type { ToolCapability } from "./tools";
import { configureWorkspaceRoots } from "./tools/pathGuard";
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

configureWorkspaceRoots(config.workspaceRoots);
logger.info("Configured workspace roots", {
  roots: config.workspaceRoots,
});

const timeAgent = new Agent({
  name: "Time Agent",
  handoffDescription:
    "Pass to Time Agent if the user query is about current time or timezones.",
  model: config.openAIModel,
  instructions:
    "You provide current time information. You can answer questions and call tools when useful.",
  tools: [currentTimeTool],
});

const baseInstructions = [
  "You are an LLM agent running on CLI and your name is Wall-E.",
  "Answer directly when no tool is needed.",
  "Use searchWeb for current or externally verifiable information.",
  "Use FileSearch to locate local files or search their text content.",
  "Use FileReadTool only when a specific local file needs to be inspected.",
  "After a tool returns, use its result to answer the user.",
  "Do not repeat a tool call with identical arguments.",
].join("\n");

const baseCapabilities: ToolCapability[] = [
  "web-search",
  "filesystem-read",
  "filesystem-search",
];

const triageAgent = new Agent({
  name: "CLI Agent",
  model: config.openAIModel,
  instructions: baseInstructions,
  handoffs: [timeAgent],
  tools: getTools(baseCapabilities),
  modelSettings: {
    toolChoice: "auto",
  },
  toolUseBehavior: "run_llm_again",
  resetToolChoice: true,
});

function attachAgentLogging(agent: Agent): void {
  agent.on("agent_tool_start", (_ctx, tool) => {
    logger.debug(`[Tool Start] ${tool.name}`);
  });
  agent.on("agent_handoff", (_ctx, nextAgent) => {
    logger.debug(`[Agent Handoff] Handing off to ${nextAgent.name}`);
  });
  agent.on("agent_tool_end", (_ctx, tool, result) => {
    logger.debug(`[Tool End] ${tool.name}`, {
      resultLength: String(result).length,
    });
  });
}

attachAgentLogging(triageAgent);

const skillRegistry = await SkillRegistry.discover(defaultSkillRoots());
const skillLoader = new SkillLoader(skillRegistry);
logger.info("Discovered skills", {
  skills: skillRegistry.list().map(({ name }) => name),
});

const rl = createInterface({ input, output });
let thread: AgentInputItem[] = [];

while (true) {
  const text = (await rl.question("User: ")).trim();
  if (!text) continue;
  if (text.toLowerCase() === "exit" || text.toLowerCase() === "quit") break;

  const stopSpinner = startSpinner();
  try {
    const explicit = parseExplicitSkillSelection(text, skillRegistry);
    const selectedSkillNames =
      explicit.skillNames.length > 0
        ? explicit.skillNames
        : await selectSkillsImplicitly({
            input: explicit.input,
            registry: skillRegistry,
            model: config.openAIModel,
          }).catch((error) => {
            logger.warn("Skill selection failed; continuing without a skill", {
              error: error instanceof Error ? error.message : String(error),
            });
            return [];
          });
    const loadedSkills = await Promise.all(
      selectedSkillNames.map((name) => skillLoader.load(name)),
    );
    const capabilities = [
      ...new Set([
        ...baseCapabilities,
        ...resolveSkillCapabilities(loadedSkills),
      ]),
    ];
    const skillInstructions = formatSkillInstructions(loadedSkills);
    const taskAgent =
      loadedSkills.length === 0
        ? triageAgent
        : triageAgent.clone({
            instructions: `${baseInstructions}\n\n${skillInstructions}`,
            tools: [
              ...getTools(capabilities),
              createSkillResourceReadTool(loadedSkills),
            ],
          });
    if (taskAgent !== triageAgent) attachAgentLogging(taskAgent);

    const result = await run(
      taskAgent,
      thread.concat({ role: "user", content: explicit.input }),
      { maxTurns: 8 },
    );
    stopSpinner();
    thread = result.history;
    logger.info("Total tokens:", result.runContext.usage.totalTokens);
    console.log(`Agent: ${result.finalOutput ?? ""}`);
  } catch (error) {
    stopSpinner();
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Agent run failed: ${message}`);
  }
}

rl.close();
