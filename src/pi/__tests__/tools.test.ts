import { describe, expect, test } from "bun:test";
import { getPiTools } from "../tools";

describe("Pi tool adapter", () => {
  test("maps enabled capabilities to Pi tools and always exposes time", () => {
    expect(getPiTools(["web-search", "filesystem-search"]).map(({ name }) => name)).toEqual([
      "searchWeb",
      "FileSearch",
      "currentTime",
    ]);
  });

  test("does not expose a filesystem reader unless enabled", () => {
    expect(getPiTools([]).map(({ name }) => name)).toEqual(["currentTime"]);
  });
});
