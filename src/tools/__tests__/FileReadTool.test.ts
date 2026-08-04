import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdtemp,
  rm,
  writeFile,
  symlink,
} from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { FileReadTool } from "../FileReadTool";
import { configureWorkspaceRoots } from "../pathGuard";

const tempDirs: string[] = [];

afterEach(async () => {
  configureWorkspaceRoots([]);
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "file-read-tool-test-"));
  tempDirs.push(dir);
  return dir;
}

async function createWorkspace(): Promise<string> {
  const dir = await createTempDir();
  configureWorkspaceRoots([dir]);
  return dir;
}

async function invokeFileRead(input: Record<string, unknown>) {
  return FileReadTool.invoke(undefined as any, JSON.stringify(input));
}

/**
 * Build a minimal valid multi-page PDF where each page contains one text run.
 * xref offsets are computed so the file parses without recovery.
 */
function createMinimalPdf(pageTexts: string[]): Buffer {
  const objects: string[] = [];
  const offsets: number[] = [];
  let offset = 0;

  const pushObject = (obj: string) => {
    objects.push(obj);
    offsets.push(offset);
    offset += obj.length;
  };

  pushObject("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  const kids = pageTexts.map((_, i) => `${3 + i} 0 R`).join(" ");
  pushObject(
    `2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pageTexts.length} >>\nendobj\n`,
  );

  const firstContent = 3 + pageTexts.length;
  for (let i = 0; i < pageTexts.length; i++) {
    pushObject(
      `${3 + i} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${firstContent + i} 0 R /Resources << /Font << /F1 ${firstContent + pageTexts.length} 0 R >> >> >>\nendobj\n`,
    );
  }
  for (let i = 0; i < pageTexts.length; i++) {
    const streamData = `BT /F1 12 Tf 72 720 Td (${pageTexts[i]}) Tj ET`;
    pushObject(
      `${firstContent + i} 0 obj\n<< /Length ${streamData.length} >>\nstream\n${streamData}\nendstream\nendobj\n`,
    );
  }
  pushObject(
    `${firstContent + pageTexts.length} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
  );

  const header = "%PDF-1.4\n";
  const body = objects.join("");
  const xrefStart = header.length + body.length;
  const count = firstContent + pageTexts.length + 1;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (const objectOffset of offsets) {
    xref += `${String(objectOffset + header.length).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(header + body + xref + trailer, "utf8");
}

describe("FileReadTool", () => {
  test("reads a text file and reports its line count", async () => {
    const workspaceDir = await createWorkspace();
    const filePath = join(workspaceDir, "sample.txt");
    await writeFile(filePath, ["alpha", "beta", "gamma"].join("\n"), "utf-8");

    const result = (await invokeFileRead({ filePath })) as any;

    expect(result.type).toBe("text");
    expect(result.file.content).toBe("alpha\nbeta\ngamma");
    expect(result.file.numOfLines).toBe(3);
  });

  test("honors offset and limit for text files", async () => {
    const workspaceDir = await createWorkspace();
    const filePath = join(workspaceDir, "sample.txt");
    await writeFile(
      filePath,
      ["line0", "line1", "line2", "line3", "line4"].join("\n"),
      "utf-8",
    );

    const result = (await invokeFileRead({
      filePath,
      offset: 1,
      limit: 2,
    })) as any;

    expect(result.file.content).toBe("line1\nline2");
    expect(result.file.numOfLines).toBe(2);
  });

  test("returns empty content when offset is past the end of file", async () => {
    const workspaceDir = await createWorkspace();
    const filePath = join(workspaceDir, "sample.txt");
    await writeFile(filePath, "single line", "utf-8");

    const result = (await invokeFileRead({ filePath, offset: 10 })) as any;

    expect(result.file.content).toBe("");
    expect(result.file.numOfLines).toBe(0);
  });

  test("rejects text files above 10MB", async () => {
    const workspaceDir = await createWorkspace();
    const filePath = join(workspaceDir, "large.txt");
    await writeFile(filePath, Buffer.alloc(10 * 1024 * 1024 + 1));

    const result = await invokeFileRead({ filePath });

    expect(result).toContain("File too large");
  });

  test("rejects images above 5MB", async () => {
    const workspaceDir = await createWorkspace();
    const filePath = join(workspaceDir, "large.png");
    await writeFile(filePath, Buffer.alloc(5 * 1024 * 1024 + 1));

    const result = await invokeFileRead({ filePath });

    expect(result).toContain("Image file too large");
  });

  test("returns a small image as bounded base64", async () => {
    const workspaceDir = await createWorkspace();
    const filePath = join(workspaceDir, "small.png");
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await writeFile(filePath, bytes);

    const result = (await invokeFileRead({ filePath })) as any;

    expect(result.type).toBe("image");
    expect(result.file.content).toBe(bytes.toString("base64"));
  });

  test("rejects binary output above the model-facing limit", async () => {
    const workspaceDir = await createWorkspace();
    const filePath = join(workspaceDir, "large.png");
    await writeFile(filePath, Buffer.alloc(200 * 1024));

    const result = await invokeFileRead({ filePath });

    expect(result).toContain("max tool output: 256KB");
  });

  test("extracts text from a PDF with page markers", async () => {
    const workspaceDir = await createWorkspace();
    const filePath = join(workspaceDir, "doc.pdf");
    await writeFile(
      filePath,
      createMinimalPdf(["ALPHA PAGE", "BETA PAGE", "GAMMA PAGE"]),
    );

    const result = (await invokeFileRead({ filePath })) as any;

    expect(result.type).toBe("pdf");
    expect(result.file.content).toContain("[Page 1]");
    expect(result.file.content).toContain("ALPHA PAGE");
    expect(result.file.content).toContain("[Page 3]");
    expect(result.file.content).toContain("GAMMA PAGE");
  });

  test("filters PDF output to the requested page range", async () => {
    const workspaceDir = await createWorkspace();
    const filePath = join(workspaceDir, "doc.pdf");
    await writeFile(
      filePath,
      createMinimalPdf(["ALPHA PAGE", "BETA PAGE", "GAMMA PAGE"]),
    );

    const result = (await invokeFileRead({ filePath, pages: "2-2" })) as any;

    expect(result.type).toBe("pdf");
    expect(result.file.content).toContain("[Page 2]");
    expect(result.file.content).toContain("BETA PAGE");
    expect(result.file.content).not.toContain("ALPHA PAGE");
    expect(result.file.content).not.toContain("GAMMA PAGE");
  });

  test("clamps the PDF page range end to the document page count", async () => {
    const workspaceDir = await createWorkspace();
    const filePath = join(workspaceDir, "doc.pdf");
    await writeFile(
      filePath,
      createMinimalPdf(["ALPHA PAGE", "BETA PAGE"]),
    );

    const result = (await invokeFileRead({ filePath, pages: "2-99" })) as any;

    expect(result.file.content).toContain("[Page 2]");
    expect(result.file.content).not.toContain("[Page 3]");
  });

  test("rejects a malformed PDF page range", async () => {
    const workspaceDir = await createWorkspace();
    const filePath = join(workspaceDir, "doc.pdf");
    await writeFile(filePath, createMinimalPdf(["PAGE"]));

    const result = await invokeFileRead({ filePath, pages: "banana" });

    expect(result).toContain('pages must be a range like "10-50"');
  });

  test("rejects a PDF page range that starts beyond the document", async () => {
    const workspaceDir = await createWorkspace();
    const filePath = join(workspaceDir, "doc.pdf");
    await writeFile(filePath, createMinimalPdf(["PAGE"]));

    const result = await invokeFileRead({ filePath, pages: "5-6" });

    expect(result).toContain("exceeds document page count (1)");
  });

  test("rejects unsupported file types", async () => {
    const workspaceDir = await createWorkspace();
    const filePath = join(workspaceDir, "file.xyz");
    await writeFile(filePath, "data", "utf-8");

    const result = await invokeFileRead({ filePath });

    expect(result).toContain("unsupported file type: .xyz");
  });

  test("rejects files without an extension", async () => {
    const workspaceDir = await createWorkspace();
    const filePath = join(workspaceDir, "noextension");
    await writeFile(filePath, "data", "utf-8");

    const result = await invokeFileRead({ filePath });

    expect(result).toContain("file has no extension");
  });

  test("rejects missing files", async () => {
    const workspaceDir = await createWorkspace();
    const filePath = join(workspaceDir, "missing.txt");

    const result = await invokeFileRead({ filePath });

    expect(result).toContain("does not exist or is not readable");
  });

  test("rejects paths outside the configured workspace", async () => {
    const workspaceDir = await createWorkspace();
    const outsideDir = await createTempDir();
    const filePath = join(outsideDir, "secret.txt");
    await writeFile(filePath, "secret", "utf-8");

    const result = await invokeFileRead({ filePath });

    expect(result).toContain("outside the allowed workspace roots");
  });

  test("rejects symlinks that escape the workspace", async () => {
    const workspaceDir = await createWorkspace();
    const outsideDir = await createTempDir();
    const outsideFile = join(outsideDir, "secret.txt");
    await writeFile(outsideFile, "secret", "utf-8");

    const linkPath = join(workspaceDir, "link.txt");
    await symlink(outsideFile, linkPath);

    const result = await invokeFileRead({ filePath: linkPath });

    expect(result).toContain("outside the allowed workspace roots");
  });

  test("rejects reads when no workspace roots are configured", async () => {
    configureWorkspaceRoots([]);
    const filePath = join(await createTempDir(), "any.txt");
    await writeFile(filePath, "data", "utf-8");

    const result = await invokeFileRead({ filePath });

    expect(result).toContain("no workspace roots configured");
  });
});
