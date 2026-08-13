import { describe, expect, test } from "bun:test";
import { getTools } from "../registry";

describe("tool registry", () => {
  test("returns only tools for requested capabilities", () => {
    const tools = getTools(["web-search", "web-search-grok", "filesystem-search"]);

    expect(tools.map(({ name }) => name)).toEqual([
      "searchWeb",
      "web_search",
      "FileSearch",
    ]);
  });

  test("does not duplicate tools when a capability is repeated", () => {
    const tools = getTools(["filesystem-read", "filesystem-read"]);

    expect(tools.map(({ name }) => name)).toEqual(["FileReadTool"]);
  });

  test("returns no tools when no capabilities are enabled", () => {
    expect(getTools([])).toEqual([]);
  });

  test("includes time tool when time capability is enabled", () => {
    const tools = getTools(["time"]);
    expect(tools.map(({ name }) => name)).toEqual(["currentTime"]);
  });

  test("includes time among other tools", () => {
    const tools = getTools(["web-search", "time", "filesystem-read"]);
    expect(tools.map(({ name }) => name)).toEqual([
      "searchWeb",
      "FileReadTool",
      "currentTime",
    ]);
  });
});
