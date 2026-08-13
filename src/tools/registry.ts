import type { Tool } from "@openai/agents";
import { FileReadTool } from "./FileReadTool";
import { fileSearchTool } from "./FileSearchTool";
import { searchWebTool } from "./searchWeb";
import { grokWebSearchTool } from "./grokWebSearch";
import { currentTimeTool } from "./time";

export type ToolCapability =
  | "web-search"
  | "web-search-grok"
  | "filesystem-read"
  | "filesystem-search"
  | "time";

type RegisteredTool = {
  capability: ToolCapability;
  tool: Tool;
};

const toolRegistry: readonly RegisteredTool[] = [
  { capability: "web-search", tool: searchWebTool },
  { capability: "web-search-grok", tool: grokWebSearchTool },
  { capability: "filesystem-read", tool: FileReadTool },
  { capability: "filesystem-search", tool: fileSearchTool },
  { capability: "time", tool: currentTimeTool },
];

export function getTools(capabilities: readonly ToolCapability[]): Tool[] {
  const enabled = new Set(capabilities);
  return toolRegistry
    .filter(({ capability }) => enabled.has(capability))
    .map(({ tool }) => tool);
}
