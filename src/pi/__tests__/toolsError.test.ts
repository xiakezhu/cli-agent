import { describe, expect, test } from "bun:test";
import { ToolError } from "../../tools/toolError";

// Import the actual tools
import * as timeToolModule from "../../tools/time";

describe("Tool error handling (sanitization & ToolError)", () => {
  test("time tool throws ToolError on invalid timezone", async () => {
    const timeTool = timeToolModule.currentTimeTool;

    try {
      await timeTool.invoke(undefined as never, JSON.stringify({ timezone: "Invalid/Timezone" }));
    } catch (err) {
      expect(err).toBeInstanceOf(ToolError);
      const toolErr = err as ToolError;
      expect(toolErr.toolName).toBe("currentTime");
      expect(toolErr.code).toBe("INVALID_TIMEZONE");
      expect(toolErr.message).toContain("Invalid timezone");
      expect(toolErr.message).toContain("Invalid/Timezone");
    }
  });

  test("time tool succeeds with valid timezone", async () => {
    const timeTool = timeToolModule.currentTimeTool;
    const result = await timeTool.invoke(undefined as never, JSON.stringify({ timezone: "UTC" }));
    expect(result).toContain("Current time in UTC is");
  });

  test("ToolError preserves toolName and code", () => {
    const err = new ToolError("testTool", "Something failed", "TEST_CODE");
    expect(err.toolName).toBe("testTool");
    expect(err.code).toBe("TEST_CODE");
    expect(err.message).toBe("Something failed");
  });
});