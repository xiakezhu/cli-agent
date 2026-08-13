import { describe, expect, test } from "bun:test";
import { parseCliArgs } from "../args";

describe("parseCliArgs", () => {
  test("defaults to continue without listing", () => {
    expect(parseCliArgs([])).toEqual({
      sessionMode: "continue",
      sessionRef: undefined,
      listSessions: false,
    });
  });

  test("parses --new, --list, and --session", () => {
    expect(parseCliArgs(["--new", "--list", "--session", "abc123"])).toEqual({
      sessionMode: "new",
      sessionRef: "abc123",
      listSessions: true,
    });
  });

  test("rejects unknown flags and missing --session values", () => {
    expect(() => parseCliArgs(["--unknown"])).toThrow("Unknown flag: --unknown");
    expect(() => parseCliArgs(["--session"])).toThrow("Missing value for --session");
    expect(() => parseCliArgs(["prompt"])).toThrow("Unexpected argument: prompt");
  });
});
