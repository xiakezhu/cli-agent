import { tool } from "@openai/agents";
import z from "zod";
import { readFile, access } from "fs/promises";
import { constants as fsConstants } from "fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { logger } from "../utils/logger";
import { assertPathWithinWorkspace } from "./pathGuard";

// Configuration constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB for text files
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB for images
const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB for PDFs
const MAX_BINARY_OUTPUT_SIZE = 256 * 1024; // 256KB of base64 in a tool result
const MAX_PDF_TEXT_OUTPUT = 256 * 1024; // 256KB of extracted text in a tool result

// Output schema
const outputSchema = z.object({
  type: z.string(),
  file: z.object({
    filePath: z.string().describe("the absolute path of file that was read"),
    content: z.string().describe("the content of the file"),
    numOfLines: z.number().int().describe("Number of Lines in the content"),
  }),
});

type FileReadOutput = z.infer<typeof outputSchema>;

// Handler interface for different file types
interface FileHandler {
  canHandle(ext: string): boolean;
  handle(
    filePath: string,
    options: { offset?: number; limit?: number; pages?: string },
  ): Promise<
    Omit<FileReadOutput, "file"> & {
      file: { filePath: string; content: string; numOfLines: number };
    }
  >;
}

// Text file handler
class TextFileHandler implements FileHandler {
  canHandle(ext: string): boolean {
    return [
      "txt",
      "ts",
      "js",
      "json",
      "md",
      "py",
      "java",
      "cpp",
      "h",
      "c",
      "css",
      "html",
      "xml",
      "yaml",
      "yml",
      "log",
      "csv",
    ].includes(ext);
  }

  async handle(
    filePath: string,
    options: { offset?: number; limit?: number },
  ): Promise<
    Omit<FileReadOutput, "file"> & {
      file: { filePath: string; content: string; numOfLines: number };
    }
  > {
    const { offset = 0, limit } = options;
    try {
      const buffer = await readFile(filePath);

      // Validate file size
      if (buffer.length > MAX_FILE_SIZE) {
        throw new Error(
          `File too large: ${Math.round(buffer.length / 1024)}KB (max: ${MAX_FILE_SIZE / 1024}KB)`,
        );
      }

      const text = buffer.toString("utf-8");
      const { numOfLines, content } = readFileInRange(text, offset, limit);
      logger.info("Read text file", {
        filePath,
        numOfLines,
        totalLines: text.split("\n").length,
      });
      return {
        type: "text",
        file: {
          filePath,
          content,
          numOfLines,
        },
      };
    } catch (err: any) {
      logger.error("Error reading text file", {
        err: err?.message || String(err),
      });
      throw new Error(
        `failed to read text file ${filePath}: ${err?.message || String(err)}`,
      );
    }
  }
}

// PDF file handler
class PDFFileHandler implements FileHandler {
  canHandle(ext: string): boolean {
    return ext === "pdf";
  }

  async handle(
    filePath: string,
    options: { pages?: string },
  ): Promise<
    Omit<FileReadOutput, "file"> & {
      file: { filePath: string; content: string; numOfLines: number };
    }
  > {
    const { pages } = options;
    let start = 1;
    let end: number | undefined;

    if (pages) {
      const range = parsePageRange(pages);
      start = range.start;
      end = range.end;
    }

    try {
      const buffer = await readFile(filePath);

      // Validate file size
      if (buffer.length > MAX_PDF_SIZE) {
        throw new Error(
          `File too large: ${Math.round(buffer.length / 1024)}KB (max: ${MAX_PDF_SIZE / 1024}KB)`,
        );
      }

      const loadingTask = getDocument({
        data: new Uint8Array(buffer),
        useWorkerFetch: false,
        isEvalSupported: false,
        disableFontFace: true,
        verbosity: 0,
      });
      const doc = await loadingTask.promise;

      try {
        const numPages = doc.numPages;
        if (start > numPages) {
          throw new Error(
            `pages range start (${start}) exceeds document page count (${numPages})`,
          );
        }
        const endPage = end === undefined ? numPages : Math.min(end, numPages);

        const sections: string[] = [];
        let totalLength = 0;
        for (let pageNumber = start; pageNumber <= endPage; pageNumber++) {
          const page = await doc.getPage(pageNumber);
          try {
            const pageContent = await page.getTextContent();
            const pageText = extractTextFromItems(pageContent.items);
            const section = `[Page ${pageNumber}]\n${pageText}`;
            totalLength += section.length;
            if (totalLength > MAX_PDF_TEXT_OUTPUT) {
              throw new Error(
                `PDF text output too large: ${Math.round(totalLength / 1024)}KB ` +
                  `(max tool output: ${MAX_PDF_TEXT_OUTPUT / 1024}KB)`,
              );
            }
            sections.push(section);
          } finally {
            page.cleanup();
          }
        }

        const content = sections.join("\n\n");
        logger.info("Read PDF file", {
          filePath,
          numPages,
          pages: `${start}-${endPage}`,
          extractedLines: content.split("\n").length,
        });
        return {
          type: "pdf",
          file: {
            filePath,
            content,
            numOfLines: content.split("\n").length,
          },
        };
      } finally {
        await loadingTask.destroy().catch(() => {});
      }
    } catch (err: any) {
      logger.error("Error reading PDF", { err: err?.message || String(err) });
      throw err;
    }
  }
}

// Image file handler
class ImageFileHandler implements FileHandler {
  canHandle(ext: string): boolean {
    return ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext);
  }

  async handle(
    filePath: string,
    _options: object,
  ): Promise<
    Omit<FileReadOutput, "file"> & {
      file: { filePath: string; content: string; numOfLines: number };
    }
  > {
    try {
      const buffer = await readFile(filePath);

      // Validate file size for images
      if (buffer.length > MAX_IMAGE_SIZE) {
        throw new Error(
          `Image file too large: ${Math.round(buffer.length / 1024)}KB (max: ${MAX_IMAGE_SIZE / 1024}KB)`,
        );
      }

      const base64 = encodeBoundedBinary(buffer, "Image");
      logger.info("Read image file", { filePath, size: base64.length });
      return {
        type: "image",
        file: {
          filePath,
          content: base64,
          numOfLines: 1,
        },
      };
    } catch (err: any) {
      logger.error("Error reading image file", {
        err: err?.message || String(err),
      });
      throw new Error(
        `failed to read image file ${filePath}: ${err?.message || String(err)}`,
      );
    }
  }
}

// Handler registry
class FileHandlerRegistry {
  private handlers: FileHandler[] = [];

  constructor() {
    this.register(new TextFileHandler());
    this.register(new PDFFileHandler());
    this.register(new ImageFileHandler());
  }

  register(handler: FileHandler): void {
    this.handlers.push(handler);
  }

  getHandler(ext: string): FileHandler | null {
    return this.handlers.find((h) => h.canHandle(ext)) || null;
  }

  getSupportedExtensions(): string[] {
    const exts = new Set<string>();
    this.handlers.forEach((h) => {
      if (h instanceof TextFileHandler) {
        [
          "txt",
          "ts",
          "js",
          "json",
          "md",
          "py",
          "java",
          "cpp",
          "h",
          "c",
          "css",
          "html",
          "xml",
          "yaml",
          "yml",
          "log",
          "csv",
        ].forEach((e) => exts.add(e));
      } else if (h instanceof PDFFileHandler) {
        exts.add("pdf");
      } else if (h instanceof ImageFileHandler) {
        ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].forEach((e) =>
          exts.add(e),
        );
      }
    });
    return Array.from(exts).sort();
  }
}

const handlerRegistry = new FileHandlerRegistry();

export const FileReadTool = tool({
  name: "FileReadTool",
  description: `Read a file in File System with given path. Supports: ${handlerRegistry
    .getSupportedExtensions()
    .join(", ")}. Text files can be limited by line range. PDF files return extracted text and the pages option selects a 1-indexed page range like "10-50".`,
  parameters: z.strictObject({
    filePath: z.string().describe("The absolute path to the file to read"),
    offset: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("The offset number to start reading from, only for text files"),
    limit: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("The max lines to read, only for text files"),
    pages: z
      .string()
      .optional()
      .describe(`The page range to read in PDF files, e.g., "10-50"`),
  }),
  async execute({
    filePath,
    offset = 0,
    limit,
    pages,
  }): Promise<FileReadOutput> {
    logger.info("Reading file", { filePath, offset, limit, pages });

    // basic validation
    if (typeof filePath !== "string" || filePath.trim() === "") {
      throw new Error("invalid filePath: must be a non-empty string");
    }

    // enforce workspace-root restrictions (also resolves relative paths)
    const safePath = await assertPathWithinWorkspace(filePath);

    // check existence and accessibility
    try {
      await access(safePath, fsConstants.F_OK | fsConstants.R_OK);
    } catch (err) {
      throw new Error(`file does not exist or is not readable: ${safePath}`);
    }

    // validate offset and limit
    if (!Number.isInteger(offset) || offset < 0) {
      throw new Error("offset must be a non-negative integer");
    }
    if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
      throw new Error("limit must be a positive integer when provided");
    }

    const ext = getFileExtension(safePath);

    if (!ext) {
      throw new Error(`file has no extension: ${safePath}`);
    }

    const handler = handlerRegistry.getHandler(ext);

    if (!handler) {
      throw new Error(
        `unsupported file type: .${ext}. Supported types: ${handlerRegistry
          .getSupportedExtensions()
          .join(", ")}`,
      );
    }

    return handler.handle(safePath, { offset, limit, pages });
  },
});

// Export for extensibility: allow adding custom handlers
export { FileHandlerRegistry, FileHandler };
export const getHandlerRegistry = () => handlerRegistry;

function getFileExtension(filePath: string): string {
  const lastDotIndex = filePath.lastIndexOf(".");
  if (lastDotIndex === -1 || lastDotIndex === filePath.length - 1) {
    return "";
  }
  return filePath.slice(lastDotIndex + 1).toLowerCase();
}

function parsePageRange(pages: string): { start: number; end: number } {
  const pagesMatch = pages.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
  if (!pagesMatch) {
    throw new Error('pages must be a range like "10-50"');
  }
  const start = parseInt(pagesMatch[1], 10);
  const end = parseInt(pagesMatch[2], 10);
  if (start <= 0 || end < start) {
    throw new Error("pages range invalid: start must be >=1 and end >= start");
  }
  return { start, end };
}

function extractTextFromItems(items: unknown[]): string {
  let text = "";
  for (const item of items) {
    const candidate = item as { str?: unknown; hasEOL?: unknown };
    if (typeof candidate.str !== "string") continue;
    text += candidate.str;
    text += candidate.hasEOL ? "\n" : " ";
  }
  return text.replace(/[ \t]+\n/g, "\n").trim();
}

function readFileInRange(raw: string, offset: number, maxLines?: number) {
  const lines = raw.split("\n");
  const totalLines = lines.length;

  // Adjust for the last line without newline
  const hasTrailingNewline = raw.endsWith("\n");
  const effectiveLines = hasTrailingNewline ? lines.length : lines.length;

  const startIndex = Math.min(offset, effectiveLines);
  const endIndex =
    maxLines !== undefined
      ? Math.min(startIndex + maxLines, effectiveLines)
      : effectiveLines;

  const selectedLines = lines.slice(startIndex, endIndex);
  const content = selectedLines.join("\n");

  return {
    numOfLines: selectedLines.length,
    content,
  };
}

function encodeBoundedBinary(buffer: Buffer, label: string): string {
  const encodedSize = Math.ceil(buffer.length / 3) * 4;
  if (encodedSize > MAX_BINARY_OUTPUT_SIZE) {
    throw new Error(
      `${label} output too large: ${Math.round(encodedSize / 1024)}KB encoded ` +
        `(max tool output: ${MAX_BINARY_OUTPUT_SIZE / 1024}KB)`,
    );
  }

  return buffer.toString("base64");
}
