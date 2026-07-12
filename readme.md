# CLI Agent

CLI Agent is an early-stage AI assistant that runs in a terminal. The assistant, named Wall-E, uses the OpenAI Agents SDK to combine a conversational model with web search, timezone support, and local file reading.

The repository is currently a working proof of concept and a foundation for a future local repository assistant. It is suitable for development and evaluation, but it does not yet provide the security controls, persistence, test coverage, or action tools expected from a production product.

## Current Capabilities

- Multi-turn conversation during the current CLI session.
- OpenAI or OpenAI-compatible model endpoints.
- Current web research through Tavily.
- Current time in UTC or an IANA timezone.
- Local text-file reading with line offset and limit controls.
- PDF and image loading as base64 data.
- Tool and handoff event logging.
- Token-usage reporting after each agent run.

A file-search tool is also implemented and covered by three tests, but it is not yet connected to the running CLI agent.

## Customer Value

In its current form, CLI Agent provides a lightweight terminal interface for:

- Asking general questions without leaving the command line.
- Researching fresh information from the web.
- Inspecting and summarizing local source code and documents.
- Getting timezone-aware time information.
- Experimenting with specialized agents and custom tools.
- Connecting to alternative providers that expose an OpenAI-compatible API.

The intended direction is a secure local repository assistant that can find relevant code, explain a project, propose changes, safely edit files, run approved commands, and verify its work.

## Requirements

- [Bun](https://bun.sh/)
- An API key for an OpenAI-compatible model endpoint
- A [Tavily](https://tavily.com/) API key for web search

## Setup

Install dependencies:

```bash
bun install
```

Copy the example configuration:

```bash
cp .env.example .env
```

Then replace the placeholder keys in `.env`:

```dotenv
LLM_API_KEY=your-model-api-key
TAVILY_API_KEY=your-tavily-api-key

# Optional
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4
LOG_LEVEL=INFO
```

Do not commit `.env` or real credentials.

## Running the Agent

Start the interactive CLI:

```bash
bun run src/run.ts
```

The equivalent package scripts are:

```bash
npm run dev
npm start
```

Enter `exit` or `quit` to close the session. Conversation history is kept only in memory and is discarded when the process exits.

## Testing and Verification

Run the test suite:

```bash
bun test
```

Verify that the CLI entry point bundles successfully:

```bash
bun build src/run.ts --target=bun --outfile=/tmp/cli-agent.js
```

Current automated coverage consists of three FileSearchTool tests. Web search, time handling, file reading, configuration, and the complete agent flow still need tests.

## Architecture

```text
User terminal
    |
    v
CLI Agent (Wall-E)
    |-- direct model response
    |-- Tavily web search
    |-- local file reader
    `-- Time Agent handoff
            `-- timezone-aware current time
```

| Path | Purpose |
| --- | --- |
| `src/run.ts` | Application entry point, agent configuration, CLI loop, and session history |
| `src/config.ts` | Environment validation and model/search configuration |
| `src/tools/searchWeb.ts` | Tavily-backed web search tool |
| `src/tools/time.ts` | Current-time tool used by the Time Agent |
| `src/tools/FileReadTool.ts` | Text, PDF, and image reader |
| `src/tools/FileSearchTool.ts` | Glob and content search; implemented but not yet registered |
| `src/tools/index.ts` | Public tool exports used by the agent |
| `src/utils/logger.ts` | Structured console logging |
| `src/utils/pdf.ts` | PDF-to-base64 helper |

## File Support

FileReadTool currently supports:

- Text and code: `txt`, `ts`, `js`, `json`, `md`, `py`, `java`, `cpp`, `h`, `c`, `css`, `html`, `xml`, `yaml`, `yml`, `log`, `csv`
- Documents: `pdf`
- Images: `png`, `jpg`, `jpeg`, `gif`, `webp`, `bmp`, `svg`

Text files can be read by line range. PDF and image files are returned as base64; the project does not yet perform PDF text extraction or guaranteed visual interpretation. The PDF `pages` argument is validated but currently does not filter the returned document.

## Current Limitations

- No persistent conversations or user preferences.
- No file writing, command execution, Git management, or process monitoring.
- File access is not yet restricted to configured workspace roots.
- FileSearchTool is not exposed to the CLI agent.
- Limited automated test coverage and no end-to-end test.
- No retry or cancellation strategy for model and search failures.
- No production authentication, audit storage, usage limits, or cost controls.
- Large PDF and image base64 responses can consume substantial model context.

Use the agent only in a trusted local environment and avoid asking it to read sensitive paths.

## Development Status and Roadmap

The current implementation is an early prototype, estimated at roughly 25–35% of the broader tool roadmap.

Near-term priorities are:

1. Register and expose FileSearchTool.
2. Restrict filesystem access to configured workspace roots.
3. Add comprehensive FileReadTool tests and real PDF page support.
4. Add a safe FileWriteTool.
5. Add structured, allowlisted command execution.
6. Add Git workflows and end-to-end tests.
7. Add session persistence and production observability.

See `agents.md` for detailed implementation guidance and the definition of done for new tools.

## License

ISC
