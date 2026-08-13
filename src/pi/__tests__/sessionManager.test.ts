import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { createSessionManager, resolveSessionPath } from "../sessionManager";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "session-manager-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("sessionManager helper", () => {
  test("creates a persisted session with mode='new'", async () => {
    const cwd = await makeTempDir();
    const sessionDir = join(cwd, "sessions");
    const manager = createSessionManager({ mode: "new", cwd, sessionDir });
    expect(manager.isPersisted()).toBe(true);
    expect(manager.getCwd()).toBe(cwd);
    expect(manager.getSessionDir()).toBe(sessionDir);
  });

  test("continueRecent returns a persisted manager", async () => {
    const cwd = await makeTempDir();
    const sessionDir = join(cwd, "sessions");
    const manager = createSessionManager({ mode: "continue", cwd, sessionDir });
    expect(manager.isPersisted()).toBe(true);
    expect(manager.getSessionDir()).toBe(sessionDir);
  });

  test("mode='new' creates distinct session files per call", async () => {
    const cwd = await makeTempDir();
    const sessionDir = join(cwd, "sessions");
    const first = createSessionManager({ mode: "new", cwd, sessionDir });
    const second = createSessionManager({ mode: "new", cwd, sessionDir });
    expect(first.getSessionId()).not.toBe(second.getSessionId());
  });

  test("resolves a session by id after it has been written", async () => {
    const cwd = await makeTempDir();
    const sessionDir = join(cwd, "sessions");
    const created = createSessionManager({ mode: "new", cwd, sessionDir });
    created.appendMessage({
      role: "user",
      content: "hello from test",
      timestamp: Date.now(),
    });
    created.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "hi" }],
      api: "openai-completions",
      provider: "openai",
      model: "gpt-4",
      usage: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: Date.now(),
    });

    const listed = await SessionManager.list(cwd, sessionDir);
    expect(listed).toHaveLength(1);
    const resolved = await resolveSessionPath(listed[0].id.slice(0, 8), cwd, sessionDir);
    expect(resolved).toBe(listed[0].path);

    const opened = createSessionManager({
      mode: "continue",
      cwd,
      sessionDir,
      sessionPath: resolved,
    });
    expect(opened.getSessionId()).toBe(listed[0].id);
  });

  test("rejects unknown and ambiguous session ids", async () => {
    const cwd = await makeTempDir();
    const sessionDir = join(cwd, "sessions");
    await expect(resolveSessionPath("missing", cwd, sessionDir)).rejects.toThrow(
      "No session found",
    );

    await mkdir(sessionDir, { recursive: true });
    const first = join(sessionDir, "2026-01-01T00-00-00-000Z_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jsonl");
    const second = join(sessionDir, "2026-01-02T00-00-00-000Z_aaaaaaaa-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jsonl");
    await writeFile(first, JSON.stringify({
      type: "session",
      version: 3,
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      timestamp: "2026-01-01T00:00:00.000Z",
      cwd,
    }) + "\n");
    await writeFile(second, JSON.stringify({
      type: "session",
      version: 3,
      id: "aaaaaaaa-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      timestamp: "2026-01-02T00:00:00.000Z",
      cwd,
    }) + "\n");

    await expect(resolveSessionPath("aaaaaaaa", cwd, sessionDir)).rejects.toThrow(
      "Ambiguous session id",
    );
  });
});
