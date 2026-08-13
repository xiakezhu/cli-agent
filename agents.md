# CLI Agent Repository Guide

This file gives coding agents the context needed to work safely and consistently in this repository.

## Project Purpose

CLI Agent is an early-stage, terminal-based AI assistant built around the Pi coding-agent SDK. The agent, named Wall-E, uses a file-backed Pi AgentSession to hold a conversation, answer general questions, search the web through Tavily, report the current time, and read selected local file formats.

The project is currently a proof of concept. It is not yet a production-ready autonomous coding agent: it cannot write files, execute commands, manage Git repositories, or enforce a complete filesystem permission policy.

## Runtime and Commands

- Runtime: Bun
- Language: TypeScript
- Install dependencies: `bun install`
- Start the CLI: `bun run src/run.ts` (resumes the most recent session for this project)
- Start a new session: `bun run src/run.ts --new`
- List sessions: `bun run src/run.ts --list`
- Resume a session: `bun run src/run.ts --session <id-or-path>`
- Run tests: `bun test`
- Verify that the entry point bundles: `bun build src/run.ts --target=bun --outfile=/tmp/cli-agent.js`

`npm run dev`, `npm start`, and `npm test` delegate to Bun and are also available.

## Environment Configuration

The application reads configuration from environment variables in `src/config.ts`. Bun automatically loads a root `.env` file.

Required:

- `LLM_API_KEY`: API key for the configured OpenAI-compatible endpoint.
- `TAVILY_API_KEY`: API key for Tavily web search.

Optional:

- `OPENAI_BASE_URL`: defaults to `https://api.openai.com/v1`.
- `OPENAI_MODEL`: defaults to `gpt-4`.
- `LOG_LEVEL`: one of `DEBUG`, `INFO`, `WARN`, or `ERROR`.
- `WORKSPACE_ROOT`: comma-separated list of directories the file tools may access; defaults to the current working directory.
- `XAI_API_KEY`: enables the Grok web-search tool when set.

Never commit API keys or `.env` files.

## Current Architecture

| Path | Responsibility | Current status |
| --- | --- | --- |
| `src/run.ts` | Runs the Pi session CLI loop, streams output, and logs events | Active entry point |
| `src/cli/args.ts` | Parses `--new`, `--continue`, `--list`, and `--session` | Active |
| `src/pi/session.ts` | Configures the Pi AgentSession, OpenAI-compatible provider, and file-backed session | Active runtime |
| `src/pi/sessionManager.ts` | File-backed SessionManager helpers and session-id resolution | Active |
| `src/pi/tools.ts` | Adapts bounded project tools to Pi custom tool definitions | Active runtime |
| `src/config.ts` | Validates environment variables with Zod | Active |
| `src/tools/searchWeb.ts` | Searches the web through Tavily (15s timeout, error sanitization) | Active tool |
| `src/tools/grokWebSearch.ts` | Searches the web through Grok's x.ai (15s timeout, no body leak, error sanitization) | Active tool |
| `src/tools/time.ts` | Returns UTC or timezone-specific current time (throws ToolError on invalid timezone) | Active through Pi custom-tool adapter |
| `src/tools/pathGuard.ts` | Resolves and validates paths against configured workspace roots | Shared security guard |
| `src/tools/FileReadTool.ts` | Reads supported text files, PDFs, and images with size checks; PDF page text extraction | Active tool with comprehensive tests |
| `src/tools/FileSearchTool.ts` | Searches paths by glob or searches file content | Active tool with tests |
| `src/tools/toolError.ts` | Shared ToolError class, timeout helper, and error sanitization | Active |
| `src/tools/registry.ts` | Selects tools by capability (including time, grok gated by XAI_API_KEY) | Active CLI Agent registry |
| `src/tools/index.ts` | Exports tools and registry helpers used by the application | Active |
| `src/skills/` | Bounded skill utilities (discovery, parsing, explicit selection) | Wired into runtime via `$skill-name` |
| `src/utils/logger.ts` | Structured, colored in-process logging | Active |
| `src/tools/__tests__/FileReadTool.test.ts` | Tests text, image, and PDF page handling plus workspace restrictions | Eighteen passing tests |
| `src/tools/__tests__/FileSearchTool.test.ts` | Tests file pattern/content search behavior and workspace restrictions | Five passing tests |
| `src/tools/__tests__/toolError.test.ts` | Tests ToolError, withTimeout, sanitizeError | Seventeen passing tests |
| `src/tools/__tests__/registry.test.ts` | Tests capability-to-tool mapping | Five passing tests |
| `src/pi/__tests__/sessionManager.test.ts` | Tests file-backed session creation and id resolution | Active |
| `src/pi/__tests__/tools.test.ts` | Tests Pi tool adapter capability mapping | Four passing tests |
| `src/pi/__tests__/toolsError.test.ts` | Tests tool error handling and ToolError | Three passing tests |
| `src/cli/__tests__/args.test.ts` | Tests CLI flag parsing | Active |
| `src/cli/__tests__/stream.test.ts` | Tests streaming renderer | Two passing tests |
| `src/skills/__tests__/skills.test.ts` | Tests skill discovery, loading, explicit selection, and prompt injection | Active |

## Agent Flow

1. `src/run.ts` validates configuration, discovers local skills, and creates a file-backed Pi AgentSession.
2. The session uses a project-local OpenAI-compatible provider configured from `LLM_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL`.
3. Explicit `$skill-name` mentions load that skill's instructions into the current user turn only.
4. It can answer directly or invoke bounded web, time, and filesystem custom tools.
5. Pi streams response text incrementally as `text_delta` events and appends the conversation to `.cli-agent/sessions/`.
6. The CLI logs tool events and session token usage.
7. Entering `exit` or `quit` ends the process. The JSONL session file remains for later `--continue` or `--session` use.

## Current Tool Contracts

### FileReadTool

- Requires a path that resolves inside a configured workspace root (defaults to the working directory).
- Text formats support zero-based `offset` and optional `limit` in lines.
- Text files are limited to 10 MB.
- PDFs are limited to 10 MB and return extracted text, not base64.
- The `pages` option selects a 1-indexed page range such as `"10-50"`, clamped to the document page count.
- Images are limited to 5 MB and returned as base64.
- Supported formats are declared by the handler registry in `FileReadTool.ts`.
- PDF and image content is bounded; image content is base64, not interpreted visual content.

### FileSearchTool

- Accepts either a glob `pattern` or a content `searchTerm`.
- Searches under `path`, which must resolve inside a configured workspace root and defaults to the current directory.
- Returns at most 100 results.
- Content search skips files larger than 1 MB.
- The CLI Agent receives this tool through the capability registry.

## Development Rules

- Add Pi custom tools through `defineTool(...)` with strict TypeBox schemas. Keep the existing bounded tool implementations and their Zod validation until they are deliberately migrated.
- Prefer structured inputs over shell command strings. Future command execution must use `execFile` or `spawn` with a command and argument array, never shell parsing.
- Treat filesystem access as security-sensitive. New file tools should enforce configured workspace roots and reject paths outside them.
- Add focused tests for normal behavior, invalid input, boundary sizes, permission failures, and security restrictions.
- Keep tool responses structured and bounded. Avoid returning unnecessarily large content to the model.
- Keep skill discovery metadata bounded; full skill instructions must be loaded only for the selected turn.
- Treat skill files as trusted instructions and restrict loading to configured skill roots.
- Keep portable `SKILL.md` frontmatter limited to `name` and `description`; place CLI capability metadata in `skill.json`.
- Load bundled skill references only through the selected-skill resource reader.
- Preserve the interactive CLI behavior and stop the spinner in every success or failure path.
- Do not enable Pi's built-in `bash`, `edit`, or `write` tools without an explicit security design and tests. The current runtime uses only bounded custom tools.
- Update both this file and `readme.md` when capabilities or commands change.

## Known Gaps

- Scanned PDFs and PDFs with embedded images yield no usable text.
- Image understanding is limited to passing base64 to the model.
- There is no end-to-end test with mocked model and search responses.
- Implicit skill selection (model-based) and `SkillResourceRead` tool are not wired; only explicit `$skill-name` selection is active.
- In-REPL `/resume` / `/new` / `/sessions` commands require `AgentSessionRuntime` mid-run switching (deferred).

## Recommended Implementation Order

1. Add workspace-root restrictions to all filesystem tools. (Completed)
2. Test and harden FileReadTool, including real PDF page handling. (Completed)
3. Implement FileWriteTool with explicit write/append behavior and path restrictions.
4. Implement a structured, allowlisted CommandExecTool with timeouts and output limits.
5. Add safe Git operations, separating read-only operations from mutations.
6. Add persistent session storage, better cost controls, and production observability. (Session persistence completed; cost controls and observability remain.)
7. Consider HTTP, process, calendar, database, and MCP/plugin integrations after the core repository-assistant workflow is reliable.

## Definition of Done for a New Tool

A tool is complete only when it:

- Has a strict Zod input schema and a documented structured response.
- Enforces relevant path, command, timeout, and output limits.
- Produces useful errors without leaking secrets.
- Has unit tests for success, invalid input, limits, and security cases.
- Is exported from `src/tools/index.ts`.
- Is registered with the appropriate agent when intended for customer use.
- Is documented in `readme.md` and in this repository guide.
- Passes `bun test` and the bundle verification command.
