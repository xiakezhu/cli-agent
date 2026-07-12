import { describe, expect, test } from "bun:test";
import { getTools } from "../registry";

describe("tool registry", () => {
  test("returns only tools for requested capabilities", () => {
    const tools = getTools(["web-search", "filesystem-search"]);

    expect(tools.map(({ name }) => name)).toEqual([
      "searchWeb",
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
});
