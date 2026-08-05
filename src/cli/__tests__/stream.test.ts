import { describe, expect, test } from "bun:test";
import { createStreamingRenderer } from "../stream";

describe("Pi streaming renderer", () => {
  test("writes response text incrementally with one prefix", () => {
    let output = "";
    let spinnerStops = 0;
    const renderer = createStreamingRenderer(
      { write: (text) => { output += text; } },
      () => { spinnerStops += 1; },
    );

    renderer.handle({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Hello" } });
    renderer.handle({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: " world" } });
    renderer.finish();

    expect(output).toBe("Agent: Hello world\n");
    expect(spinnerStops).toBe(1);
  });

  test("ignores non-text events and still prints a completed empty response", () => {
    let output = "";
    const renderer = createStreamingRenderer({ write: (text) => { output += text; } }, () => {});

    renderer.handle({ type: "tool_execution_start", toolName: "FileReadTool" });
    renderer.handle({ type: "message_update", assistantMessageEvent: { type: "thinking_delta", delta: "..." } });
    renderer.finish();

    expect(output).toBe("Agent: \n");
    expect(renderer.hasStarted()).toBe(false);
  });
});
