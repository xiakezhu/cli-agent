# CLI Agent

## Description

A small CLI-based agent built on top of `@openai/agents` and the Tavily search API. It uses environment configuration to connect to OpenAI-compatible endpoints and to perform web searches through a custom tool.

## Setup

1. Install dependencies: `bun install` or, if you prefer npm: `npm install`

2. Create a `.env` file at the project root.

3. Add required environment variables (see below).

## Environment Variables

Required:

- `LLM_API_KEY` — API key used for the OpenAI-compatible endpoint.
- `TAVILY_API_KEY` — API key used to query the Tavily search service.

Optional:

- `OPENAI_BASE_URL` — base URL for the OpenAI-compatible API. Defaults to `https://api.openai.com/v1`.
- `OPENAI_MODEL` — model name to use for the agent. Defaults to `gpt-4`.

Example `.env`:

```dotenv
LLM_API_KEY=sk-...
TAVILY_API_KEY=tvly-...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4
```

## Run Commands

- Start the CLI agent:
  - `bun run src/run.ts`
  - or `npm run dev`

- Production-style start:
  - `bun run src/run.ts`
  - or `npm start`

- Run tests (placeholder):
  - `npm test`

## Architecture

- `src/config.ts`
  - Reads and validates environment variables with `zod`.
  - Exposes `config.llmApiKey`, `config.tavilyApiKey`, `config.openAIBaseURL`, and `config.openAIModel`.

- `src/run.ts`
  - Creates an OpenAI client using `openai`.
  - Configures the `@openai/agents` runtime and default client.
  - Defines the `Time Agent` and `CLI Agent`.
  - Uses `triageAgent` to decide whether to answer directly or route queries to tools.
  - Maintains conversation history and a simple readline loop.

- `src/tools/index.ts`
  - Re-exports available tools.

- `src/tools/searchWeb.ts`
  - Implements a `searchWeb` tool using Tavily search.
  - Passes queries to `tvly.search(...)` and returns formatted results.

- `src/tools/time.ts`
  - Implements a `currentTime` tool that returns the current time, optionally for a requested timezone.

## Known Limitations

- No persistent conversation storage beyond the current CLI session.
- Limited error handling for tool failures and API connectivity issues.
- `OPENAI_MODEL` fallback is hardcoded, so custom model selection requires env configuration.
- The agent’s behavior depends on tool handoff prompts and may sometimes call the wrong tool or search unnecessarily.

## Troubleshooting

- If the CLI fails at startup:
  - Verify `.env` exists and includes `LLM_API_KEY` and `TAVILY_API_KEY`.
  - Ensure the values are not empty and are exported into your shell.

- If model calls fail:
  - Confirm `OPENAI_BASE_URL` is correct and reachable.
  - Check your API key permissions.

- If search does not work:
  - Verify `TAVILY_API_KEY` is valid.
  - Confirm the call to `tavily({ apiKey: ... }).search(...)` is permitted by your account.

- If the CLI hangs or prints strange output:
  - Look for console debug lines from `agent_tool_start` and `agent_handoff`.
  - Run the process with a valid `.env` and retry.

## Notes

- The project uses `bun` as the default runtime, but the code is compatible with Node.js if the dependencies are installed.
- The `test` script is currently a placeholder and does not run real tests.

