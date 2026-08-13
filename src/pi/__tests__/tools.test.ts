import { describe, expect, test } from "bun:test";
import { getPiTools } from "../tools";

describe("Pi tool adapter", () => {
  test("maps enabled capabilities to Pi tools", () => {
    expect(getPiTools(["web-search", "web-search-grok", "filesystem-search", "time"]).map(({ name }) => name)).toEqual([
      "searchWeb",
      "web_search",
      "FileSearch",
      "currentTime",
    ]);
  });

  test("exposes Grok web search only when enabled", () => {
    expect(getPiTools(["web-search", "time"]).map(({ name }) => name)).toEqual([
      "searchWeb",
      "currentTime",
    ]);
    expect(getPiTools(["web-search-grok", "time"]).map(({ name }) => name)).toEqual([
      "web_search",
      "currentTime",
    ]);
  });

  test("exposes time only when time capability is enabled", () => {
    expect(getPiTools(["web-search"]).map(({ name }) => name)).toEqual([
      "searchWeb",
    ]);
    expect(getPiTools(["time"]).map(({ name }) => name)).toEqual([
      "currentTime",
    ]);
    expect(getPiTools([]).map(({ name }) => name)).toEqual([]);
  });

  test("does not expose a filesystem tool unless enabled", () => {
    expect(getPiTools(["web-search", "time"]).map(({ name }) => name)).toEqual([
      "searchWeb",
      "currentTime",
    ]);
  });
});
