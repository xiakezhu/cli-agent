import type { Tool } from "@openai/agents";
import { FileReadTool } from "./FileReadTool";
import { fileSearchTool } from "./FileSearchTool";
import { searchWebTool } from "./searchWeb";

export type ToolCapability =
  | "web-search"
  | "filesystem-read"
  | "filesystem-search";

type RegisteredTool = {
  capability: ToolCapability;
  tool: Tool;
};

const toolRegistry: readonly RegisteredTool[] = [
  { capability: "web-search", tool: searchWebTool },
  { capability: "filesystem-read", tool: FileReadTool },
  { capability: "filesystem-search", tool: fileSearchTool },
];

export function getTools(capabilities: readonly ToolCapability[]): Tool[] {
  const enabled = new Set(capabilities);
  return toolRegistry
    .filter(({ capability }) => enabled.has(capability))
    .map(({ tool }) => tool);
}
