# CLI Agent

CLI Agent is an early-stage AI assistant that runs in a terminal. The assistant, named Wall-E, uses the [Pi coding-agent SDK](https://github.com/earendil-works/pi) for its agent loop, streaming, model runtime, and in-memory conversation state, while retaining the project's bounded web, time, and filesystem tools.

The repository is currently a working proof of concept and a foundation for a future local repository assistant. It is suitable for development and evaluation, but it does not yet provide the security controls, persistence, test coverage, or action tools expected from a production product.

## Current Capabilities

- Multi-turn conversation during the current CLI session.
- Incremental response streaming: text appears as Pi emits each token rather than waiting for the turn to finish.
- OpenAI-compatible model endpoints through Pi's provider runtime.
- Current web research through Tavily.
- Current time in UTC or an IANA timezone.
- Local file access restricted to configured workspace roots.
- Local text-file reading with line offset and limit controls.
- PDF text extraction with 1-indexed page-range selection.
- Local file discovery by glob pattern or text-content search.
- PDF and image loading (images as base64 data).
- Pi agent lifecycle and tool event logging.
- Token-usage reporting after each agent run.

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

# Optional: comma-separated list of directories the file tools may access.
# Defaults to the current working directory.
WORKSPACE_ROOT=$PWD
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

Common tasks are also available through `make`:

```bash
make run      # Start the interactive agent
make test     # Run the test suite
make build    # Bundle the CLI into dist/
make check    # Run tests and build verification
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

Current automated coverage consists of tests for file reading, file searching,
capability-based tool registration, and skill management. Web search, time
handling, configuration, implicit model selection, and the complete agent flow
still need tests.

## Architecture

```text
User terminal
    |
    v
Pi AgentSession (Wall-E)
    |-- OpenAI-compatible provider runtime
    |-- Tavily web search adapter
    |-- bounded local file adapters
    `-- timezone-aware time adapter
```

| Path | Purpose |
| --- | --- |
| `src/run.ts` | Application entry point, CLI loop, streamed output, and event logging |
| `src/pi/session.ts` | Pi AgentSession, provider, memory-session, and safe resource-loader configuration |
| `src/pi/tools.ts` | Adapts the project's structured bounded tools to Pi custom tools |
| `src/config.ts` | Environment validation and model/search/workspace configuration |
| `src/tools/searchWeb.ts` | Tavily-backed web search tool |
| `src/tools/time.ts` | Current-time tool used by the Time Agent |
| `src/tools/pathGuard.ts` | Workspace-root enforcement shared by the filesystem tools |
| `src/tools/FileReadTool.ts` | Text, PDF, and image reader |
| `src/tools/FileSearchTool.ts` | Glob and content search available to the CLI Agent |
| `src/tools/registry.ts` | Capability-based registration and selection of CLI Agent tools |
| `src/tools/index.ts` | Public tool exports used by the agent |
| `src/skills/` | Legacy bounded skill discovery utilities retained for future Pi skill integration |
| `src/utils/logger.ts` | Structured console logging |

## File Support

FileReadTool currently supports:

- Text and code: `txt`, `ts`, `js`, `json`, `md`, `py`, `java`, `cpp`, `h`, `c`, `css`, `html`, `xml`, `yaml`, `yml`, `log`, `csv`
- Documents: `pdf`
- Images: `png`, `jpg`, `jpeg`, `gif`, `webp`, `bmp`, `svg`

Text files can be read by line range. PDFs are parsed and their text is extracted; the `pages` option selects a 1-indexed page range such as `"10-50"` and clamps to the document page count. Images are returned as base64; the project does not yet perform guaranteed visual interpretation.

## Current Limitations

- No persistent conversations or user preferences; Pi uses an in-memory session.
- No file writing, command execution, Git management, or process monitoring.
- Pi's built-in filesystem and shell tools are disabled. Workspace access applies to FileReadTool and FileSearchTool.
- Limited automated test coverage and no end-to-end test.
- No retry or cancellation strategy for model and search failures.
- No production authentication, audit storage, usage limits, or cost controls.
- PDFs with embedded images or scanned content yield no usable text.
- Large image base64 responses can consume substantial model context.

Use the agent only in a trusted local environment and avoid asking it to read sensitive paths.

## Skills

The previous custom skill-selection loop is not wired into the Pi session yet.
The bounded skill discovery utilities remain in the repository while the next
iteration maps them to Pi's resource-loader skill API.

Repository skills live in `.agents/skills/<skill-name>/SKILL.md` or
`skills/<skill-name>/SKILL.md`. Wall-E initially sees only each skill's name and
description from bounded frontmatter. When a skill is selected, its full
instructions are loaded into the task agent for that turn and are not added to
durable conversation history. Referenced text files are loaded only when needed
through a reader confined to the selected skill directory.

Invoke a skill explicitly with `$skill-name`:

```text
$code-review inspect the current changes
```

Without an explicit mention, a small selector chooses at most two matching
skills. Each `SKILL.md` uses this format:

```md
---
name: code-review
description: Review source changes for correctness, security, and regressions.
---

# Code Review

Follow the repository review workflow.
```

Keep `SKILL.md` frontmatter portable by using only `name` and `description`.
Optional CLI-specific configuration belongs in `skill.json` beside it:

```json
{
  "version": 1,
  "requiredCapabilities": ["filesystem-read", "filesystem-search"]
}
```

Skills may place detailed documentation under `references/`. Their `SKILL.md`
should state when to load each reference rather than duplicating that content in
the main instructions.

## Development Status and Roadmap

The current implementation is an early prototype, estimated at roughly 25–35% of the broader tool roadmap.

Completed: filesystem access is restricted to configured workspace roots, FileReadTool has comprehensive tests plus real PDF page text extraction, and the agent runtime is now Pi-based with Pi's built-in mutation and shell tools disabled.

Remaining near-term priorities are:

1. Add a safe FileWriteTool.
2. Add structured, allowlisted command execution.
3. Add Git workflows and end-to-end tests.
4. Add session persistence and production observability.

See `agents.md` for detailed implementation guidance and the definition of done for new tools.

## License

ISC
