import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { config } from "../config";
import type { ToolCapability } from "../tools";
import { getPiTools } from "./tools";

const baseInstructions = [
  "You are Wall-E, an LLM agent running in a CLI.",
  "Answer directly when no tool is needed.",
  "Use searchWeb for current or externally verifiable information.",
  "Use FileSearch to locate local files or search their text content.",
  "Use FileReadTool only when a specific local file needs inspection.",
  "After a tool returns, use its result to answer the user.",
  "Do not repeat a tool call with identical arguments.",
  "You have no file-write, command-execution, or Git-mutation tools.",
].join("\n");

const providerId = "cli-agent-openai-compatible";

export async function createWallESession(capabilities: readonly ToolCapability[]) {
  const modelRuntime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
  });
  modelRuntime.registerProvider(providerId, {
    name: "CLI Agent OpenAI-compatible provider",
    baseUrl: config.openAIBaseURL,
    apiKey: config.llmApiKey,
    api: "openai-completions",
    models: [
      {
        id: config.openAIModel,
        name: config.openAIModel,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128_000,
        maxTokens: 4_096,
      },
    ],
  });
  const model = modelRuntime.getModel(providerId, config.openAIModel);
  if (!model) throw new Error(`Unable to configure model: ${config.openAIModel}`);

  const resourceLoader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: process.cwd(),
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPromptOverride: () => baseInstructions,
    appendSystemPromptOverride: () => [],
  });
  await resourceLoader.reload();

  const customTools = getPiTools(capabilities);
  return createAgentSession({
    cwd: process.cwd(),
    model,
    modelRuntime,
    resourceLoader,
    customTools,
    tools: customTools.map(({ name }) => name),
    noTools: "all",
    sessionManager: SessionManager.inMemory(process.cwd()),
  });
}
