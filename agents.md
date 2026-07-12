# CLI Agent Repository Guide

This file gives coding agents the context needed to work safely and consistently in this repository.

## Project Purpose

CLI Agent is an early-stage, terminal-based AI assistant built with the OpenAI Agents SDK. The agent, named Wall-E, can hold an in-memory conversation, answer general questions, search the web through Tavily, report the current time, and read selected local file formats.

The project is currently a proof of concept. It is not yet a production-ready autonomous coding agent: it cannot write files, execute commands, manage Git repositories, persist sessions, or enforce a complete filesystem permission policy.

## Runtime and Commands

- Runtime: Bun
- Language: TypeScript
- Install dependencies: `bun install`
- Start the CLI: `bun run src/run.ts`
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

Never commit API keys or `.env` files.

## Current Architecture

| Path | Responsibility | Current status |
| --- | --- | --- |
| `src/run.ts` | Configures the model client, agents, tools, CLI loop, session history, and event logging | Active entry point |
| `src/config.ts` | Validates environment variables with Zod | Active |
| `src/tools/searchWeb.ts` | Searches the web through Tavily | Active tool |
| `src/tools/time.ts` | Returns UTC or timezone-specific current time | Active through Time Agent handoff |
| `src/tools/FileReadTool.ts` | Reads supported text files, PDFs, and images with size checks | Active tool; needs more tests and security hardening |
| `src/tools/FileSearchTool.ts` | Searches paths by glob or searches file content | Implemented and tested, but not registered with the CLI agent |
| `src/tools/index.ts` | Exports tools used by the application | Does not currently export FileSearchTool |
| `src/utils/logger.ts` | Structured, colored in-process logging | Active |
| `src/utils/pdf.ts` | Encodes a PDF as base64 | Active helper; does not extract text or select pages |
| `src/tools/__tests__/FileSearchTool.test.ts` | Tests file pattern and content search behavior | Three passing tests |

## Agent Flow

1. `src/run.ts` validates configuration and creates an OpenAI-compatible client.
2. The CLI Agent receives user input and keeps the returned SDK history in memory.
3. It can answer directly or invoke web search and file reading.
4. Time-related requests may be handed off to the Time Agent.
5. The CLI logs token usage and the final response.
6. Entering `exit` or `quit` ends the process and discards the session history.

## Current Tool Contracts

### FileReadTool

- Requires an absolute `filePath`.
- Text formats support zero-based `offset` and optional `limit` in lines.
- Text files are limited to 10 MB.
- PDFs are limited to 10 MB.
- Images are limited to 5 MB.
- Supported formats are declared by the handler registry in `FileReadTool.ts`.
- The `pages` option currently validates a range but does not actually restrict PDF output.
- PDF and image content is returned as base64, not interpreted visual or extracted text content.

### FileSearchTool

- Accepts either a glob `pattern` or a content `searchTerm`.
- Searches under `path`, which defaults to the current directory.
- Returns at most 100 results.
- Content search skips files larger than 1 MB.
- This tool is not yet available to the running agent.

## Development Rules

- Follow the `@openai/agents` `tool(...)` pattern and use strict Zod schemas for tool inputs.
- Prefer structured inputs over shell command strings. Future command execution must use `execFile` or `spawn` with a command and argument array, never shell parsing.
- Treat filesystem access as security-sensitive. New file tools should enforce configured workspace roots and reject paths outside them.
- Add focused tests for normal behavior, invalid input, boundary sizes, permission failures, and security restrictions.
- Keep tool responses structured and bounded. Avoid returning unnecessarily large content to the model.
- Preserve the interactive CLI behavior and stop the spinner in every success or failure path.
- Update both this file and `readme.md` when capabilities or commands change.

## Known Gaps

- FileSearchTool is implemented but not registered.
- FileReadTool has no automated tests.
- PDF page selection is accepted but ignored.
- PDF text extraction and genuine image understanding are not implemented.
- File paths are not restricted to approved workspace roots.
- Conversations are not persisted.
- Tool retries, timeouts, cancellation, and consistent error schemas are incomplete.
- There is no end-to-end test with mocked model and search responses.
- The directly imported `openai` package should be declared as a direct dependency.

## Recommended Implementation Order

1. Register FileSearchTool and add agent-level tests.
2. Add workspace-root restrictions to all filesystem tools.
3. Test and harden FileReadTool, including real PDF page handling.
4. Implement FileWriteTool with explicit write/append behavior and path restrictions.
5. Implement a structured, allowlisted CommandExecTool with timeouts and output limits.
6. Add safe Git operations, separating read-only operations from mutations.
7. Add persistent session storage, better cost controls, and production observability.
8. Consider HTTP, process, calendar, database, and MCP/plugin integrations after the core repository-assistant workflow is reliable.

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
