import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import type { Tool } from "@openai/agents";
import { FileReadTool, currentTimeTool, fileSearchTool, searchWebTool, grokWebSearchTool } from "../tools";
import type { ToolCapability } from "../tools";
import { sanitizeError } from "../tools/toolError";
import { logger } from "../utils/logger";

type LegacyTool = Pick<Tool, "invoke">;

function serialize(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function adaptLegacyTool(
  name: string,
  label: string,
  description: string,
  parameters: ReturnType<typeof Type.Object>,
  legacyTool: LegacyTool,
) {
  return defineTool({
    name,
    label,
    description,
    parameters,
    execute: async (_toolCallId, args) => {
      try {
        const result = await legacyTool.invoke(undefined as never, JSON.stringify(args));
        return {
          content: [{ type: "text" as const, text: serialize(result) }],
          details: {},
        };
      } catch (err) {
        const sanitized = sanitizeError(err, name);
        logger.warn(`Tool "${name}" failed`, { code: sanitized.code, message: sanitized.message });
        throw sanitized; // Pi catches and converts to isError: true
      }
    },
  });
}

const piTools = {
  "web-search": adaptLegacyTool(
    "searchWeb",
    "Web search",
    "Search the web for up-to-date information. Use a short, specific query.",
    Type.Object({ query: Type.String({ minLength: 2 }) }),
    searchWebTool,
  ),
  "web-search-grok": adaptLegacyTool(
    "web_search",
    "Grok web search",
    "Search the web using Grok's built-in search. Use a short, specific query.",
    Type.Object({ query: Type.String({ minLength: 2 }) }),
    grokWebSearchTool,
  ),
  "filesystem-read": adaptLegacyTool(
    "FileReadTool",
    "Read file",
    "Read a supported local file. Access is restricted to configured workspace roots.",
    Type.Object({
      filePath: Type.String(),
      offset: Type.Optional(Type.Integer({ minimum: 0 })),
      limit: Type.Optional(Type.Integer({ minimum: 1 })),
      pages: Type.Optional(Type.String()),
    }),
    FileReadTool,
  ),
  "filesystem-search": adaptLegacyTool(
    "FileSearch",
    "Search files",
    "Search workspace files by glob pattern or text content. Access is restricted to configured workspace roots.",
    Type.Object({
      pattern: Type.Optional(Type.String()),
      searchTerm: Type.Optional(Type.String()),
      path: Type.Optional(Type.String()),
      maxResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
      includeLines: Type.Optional(Type.Boolean()),
    }),
    fileSearchTool,
  ),
  time: adaptLegacyTool(
    "currentTime",
    "Current time",
    "Get the current time in UTC or a specified IANA timezone.",
    Type.Object({ timezone: Type.Optional(Type.String()) }),
    currentTimeTool,
  ),
} as const;

export function getPiTools(capabilities: readonly ToolCapability[]) {
  const selected = new Set(capabilities);
  return [
    ...(selected.has("web-search") ? [piTools["web-search"]] : []),
    ...(selected.has("web-search-grok") ? [piTools["web-search-grok"]] : []),
    ...(selected.has("filesystem-read") ? [piTools["filesystem-read"]] : []),
    ...(selected.has("filesystem-search") ? [piTools["filesystem-search"]] : []),
    ...(selected.has("time") ? [piTools.time] : []),
  ];
}
