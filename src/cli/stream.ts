type TerminalOutput = {
  write(text: string): unknown;
};

type PiTextDeltaEvent = {
  type: "message_update";
  assistantMessageEvent: {
    type: "text_delta";
    delta: string;
  };
};

function isPiTextDeltaEvent(event: unknown): event is PiTextDeltaEvent {
  if (!event || typeof event !== "object") return false;
  const candidate = event as Partial<PiTextDeltaEvent>;
  return (
    candidate.type === "message_update" &&
    candidate.assistantMessageEvent?.type === "text_delta" &&
    typeof candidate.assistantMessageEvent.delta === "string"
  );
}

/** Writes Pi text deltas as they arrive, with a single stable response prefix. */
export function createStreamingRenderer(
  output: TerminalOutput,
  stopSpinner: () => void,
) {
  let started = false;

  return {
    handle(event: unknown): void {
      if (!isPiTextDeltaEvent(event) || event.assistantMessageEvent.delta.length === 0) {
        return;
      }
      if (!started) {
        stopSpinner();
        output.write("Agent: ");
        started = true;
      }
      output.write(event.assistantMessageEvent.delta);
    },
    finish(): void {
      if (!started) output.write("Agent: ");
      output.write("\n");
    },
    hasStarted(): boolean {
      return started;
    },
  };
}
