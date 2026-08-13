# CLI Agent

CLI Agent is an early-stage AI assistant that runs in a terminal. The assistant, named Wall-E, uses the [Pi coding-agent SDK](https://github.com/earendil-works/pi) for its agent loop, streaming, model runtime, and file-backed conversation state, while retaining the project's bounded web, time, and filesystem tools.

The repository is currently a working proof of concept and a foundation for a future local repository assistant. It is suitable for development and evaluation, but it does not yet provide the security controls, test coverage, or action tools expected from a production product.

## Current Capabilities

- Multi-turn conversation that persists across CLI restarts.
- Incremental response streaming: text appears as Pi emits each token rather than waiting for the turn to finish.
- OpenAI-compatible model endpoints through Pi's provider runtime.
- Current web research through Tavily.
- Current web research through Grok's built-in search (x.ai) when `XAI_API_KEY` is set.
- Current time in UTC or an IANA timezone.
- Local file access restricted to configured workspace roots.
- Local text-file reading with line offset and limit controls.
- PDF text extraction with 1-indexed page-range selection.
- Local file discovery by glob pattern or text-content search.
- PDF and image loading (images as base64 data).
- Explicit `$skill-name` selection for the current turn.
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
- Optionally, an [x.ai](https://x.ai) API key for Grok's built-in web search

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
XAI_API_KEY=your-xai-api-key

# Optional: comma-separated list of directories the file tools may access.
# Defaults to the current working directory.
WORKSPACE_ROOT=$PWD
```

Do not commit `.env` or real credentials.

## Running the Agent

Start the interactive CLI (resumes the most recent session for this project, or creates one):

```bash
bun run src/run.ts
```

Session flags:

```bash
bun run src/run.ts --new                 # start a fresh session
bun run src/run.ts --continue            # resume the most recent session (default)
bun run src/run.ts --list                # print saved sessions and exit
bun run src/run.ts --session <id-or-path>
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

Enter `exit` or `quit` to close the process. Conversation history is stored as JSONL under `.cli-agent/sessions/` and is reused on the next `--continue` or `--session` start.

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
capability-based tool registration, tool error handling, session persistence,
CLI flags, and skill management. There is still no end-to-end test with a
mocked model and search backend.

## Architecture

```text
User terminal
    |
    v
Pi AgentSession (Wall-E)
    |-- OpenAI-compatible provider runtime
    |-- file-backed JSONL session
    |-- Tavily / optional Grok web search
    |-- bounded local file adapters
    `-- timezone-aware time adapter
```

| Path | Purpose |
| --- | --- |
| `src/run.ts` | Application entry point, CLI loop, streamed output, and event logging |
| `src/cli/args.ts` | Session flag parsing |
| `src/pi/session.ts` | Pi AgentSession, provider, and file-backed session configuration |
| `src/pi/tools.ts` | Adapts the project's structured bounded tools to Pi custom tools |
| `src/config.ts` | Environment validation and model/search/workspace configuration |
| `src/tools/searchWeb.ts` | Tavily-backed web search tool |
| `src/tools/grokWebSearch.ts` | Grok built-in (x.ai) web search tool |
| `src/tools/time.ts` | Current-time tool |
| `src/tools/toolError.ts` | Shared timeout and sanitized tool-error helpers |
| `src/tools/pathGuard.ts` | Workspace-root enforcement shared by the filesystem tools |
| `src/tools/FileReadTool.ts` | Text, PDF, and image reader |
| `src/tools/FileSearchTool.ts` | Glob and content search available to the CLI Agent |
| `src/tools/registry.ts` | Capability-based registration and selection of CLI Agent tools |
| `src/tools/index.ts` | Public tool exports used by the agent |
| `src/skills/` | Skill discovery and explicit `$skill-name` prompt injection |
| `src/utils/logger.ts` | Structured console logging |

## File Support

FileReadTool currently supports:

- Text and code: `txt`, `ts`, `js`, `json`, `md`, `py`, `java`, `cpp`, `h`, `c`, `css`, `html`, `xml`, `yaml`, `yml`, `log`, `csv`
- Documents: `pdf`
- Images: `png`, `jpg`, `jpeg`, `gif`, `webp`, `bmp`, `svg`

Text files can be read by line range. PDFs are parsed and their text is extracted; the `pages` option selects a 1-indexed page range such as `"10-50"` and clamps to the document page count. Images are returned as base64; the project does not yet perform guaranteed visual interpretation.

## Current Limitations

- No file writing, command execution, Git management, or process monitoring.
- Pi's built-in filesystem and shell tools are disabled. Workspace access applies to FileReadTool and FileSearchTool.
- Limited automated test coverage and no end-to-end test.
- Implicit skill selection and the `SkillResourceRead` tool are not wired into the Pi session.
- No in-REPL `/resume` or `/new` commands; use the CLI flags instead.
- No production authentication, audit storage, usage limits, or cost controls.
- PDFs with embedded images or scanned content yield no usable text.
- Large image base64 responses can consume substantial model context.

Use the agent only in a trusted local environment and avoid asking it to read sensitive paths.

## Skills

Repository skills live in `.agents/skills/<skill-name>/SKILL.md` or
`skills/<skill-name>/SKILL.md`. Wall-E initially sees only each skill's name and
description from bounded frontmatter. When a skill is selected with `$skill-name`,
its full instructions are prepended to that turn's user prompt. Implicit
model-based selection and the selected-skill resource reader are not wired yet.

Invoke a skill explicitly with `$skill-name`:

```text
$code-review inspect the current changes
```

Each `SKILL.md` uses this format:

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

Completed: filesystem access is restricted to configured workspace roots, FileReadTool has comprehensive tests plus real PDF page text extraction, conversations persist as JSONL under `.cli-agent/sessions/`, tools use shared timeouts and sanitized errors, and explicit `$skill-name` selection is wired into the Pi session.

Remaining near-term priorities are:

1. Add a safe FileWriteTool.
2. Add structured, allowlisted command execution.
3. Add Git workflows and end-to-end tests.
4. Add production observability and cost controls.

See `agents.md` for detailed implementation guidance and the definition of done for new tools.

## License

ISC
