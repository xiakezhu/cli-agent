import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { fileSearchTool } from "../FileSearchTool";
import { configureWorkspaceRoots } from "../pathGuard";

const tempDirs: string[] = [];

afterEach(async () => {
  configureWorkspaceRoots([]);
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "file-search-tool-test-"));
  tempDirs.push(dir);
  return dir;
}

async function createWorkspace(): Promise<string> {
  const dir = await createTempDir();
  configureWorkspaceRoots([dir]);
  return dir;
}

async function invokeFileSearch(input: Record<string, unknown>) {
  return (await fileSearchTool.invoke(
    undefined as any,
    JSON.stringify(input),
  )) as {
    query: string;
    searchType: "pattern" | "content";
    totalFound: number;
    matches: Array<{
      filePath: string;
      content?: string;
      lineNumber?: number;
      lineContent?: string;
      matchCount?: number;
    }>;
    message?: string;
  };
}

describe("FileSearchTool", () => {
  test("counts all matches in a file when includeLines is false", async () => {
    const dir = await createWorkspace();
    const filePath = join(dir, "multi-match.txt");
    await writeFile(
      filePath,
      ["alpha", "needle one", "beta", "needle two", "needle three"].join("\n"),
      "utf-8",
    );

    const result = await invokeFileSearch({
      searchTerm: "needle",
      path: dir,
      maxResults: 1,
      includeLines: false,
    });

    expect(result.searchType).toBe("content");
    expect(result.totalFound).toBe(1);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].filePath).toBe(filePath);
    expect(result.matches[0].matchCount).toBe(3);
  });

  test("limits line-level results when includeLines is true", async () => {
    const dir = await createWorkspace();
    const filePath = join(dir, "lines.txt");
    await writeFile(
      filePath,
      ["needle 1", "x", "needle 2", "needle 3"].join("\n"),
      "utf-8",
    );

    const result = await invokeFileSearch({
      searchTerm: "needle",
      path: dir,
      maxResults: 2,
      includeLines: true,
    });

    expect(result.totalFound).toBe(2);
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0]).toMatchObject({
      filePath,
      lineNumber: 1,
      lineContent: "needle 1",
    });
    expect(result.matches[1]).toMatchObject({
      filePath,
      lineNumber: 3,
      lineContent: "needle 2",
    });
  });

  test("returns pattern matches up to maxResults", async () => {
    const dir = await createWorkspace();
    await mkdir(join(dir, "nested"));
    await writeFile(join(dir, "a.ts"), "export const a = 1;\n", "utf-8");
    await writeFile(join(dir, "nested", "b.ts"), "export const b = 2;\n", "utf-8");
    await writeFile(join(dir, "c.js"), "export const c = 3;\n", "utf-8");

    const result = await invokeFileSearch({
      pattern: "**/*.ts",
      path: dir,
      maxResults: 1,
    });

    expect(result.searchType).toBe("pattern");
    expect(result.totalFound).toBe(1);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].filePath.endsWith(".ts")).toBe(true);
  });

  test("rejects a base path outside the configured workspace", async () => {
    const workspaceDir = await createWorkspace();
    const outsideDir = await createTempDir();
    await writeFile(join(outsideDir, "a.txt"), "needle\n", "utf-8");

    const result = await invokeFileSearch({
      pattern: "**/*.txt",
      path: outsideDir,
    });

    expect(result).toContain("outside the allowed workspace roots");
    expect(result).not.toContain("a.txt");
  });

  test("rejects searches when no workspace roots are configured", async () => {
    configureWorkspaceRoots([]);
    const dir = await createTempDir();
    await writeFile(join(dir, "a.txt"), "needle\n", "utf-8");

    const result = await invokeFileSearch({
      searchTerm: "needle",
      path: dir,
    });

    expect(result).toContain("no workspace roots configured");
  });
});
