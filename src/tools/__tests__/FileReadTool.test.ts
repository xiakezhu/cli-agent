import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { FileReadTool } from "../FileReadTool";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "file-read-tool-test-"));
  tempDirs.push(dir);
  return dir;
}

async function invokeFileRead(input: Record<string, unknown>) {
  return FileReadTool.invoke(undefined as any, JSON.stringify(input));
}

describe("FileReadTool", () => {
  test("returns a small image as bounded base64", async () => {
    const dir = await createTempDir();
    const filePath = join(dir, "small.png");
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await writeFile(filePath, bytes);

    const result = (await invokeFileRead({ filePath })) as any;

    expect(result.type).toBe("image");
    expect(result.file.content).toBe(bytes.toString("base64"));
  });

  test("rejects binary output above the model-facing limit", async () => {
    const dir = await createTempDir();
    const filePath = join(dir, "large.png");
    await writeFile(filePath, Buffer.alloc(200 * 1024));

    const result = await invokeFileRead({ filePath });

    expect(result).toContain("max tool output: 256KB");
  });
});
