import { tool } from "@openai/agents";
import z from "zod";
import { glob } from "glob";
import { readFile, access } from "fs/promises";
import { constants as fsConstants } from "fs";
import { logger } from "../utils/logger";

// Maximum number of files to return
const MAX_FILES_TO_RETURN = 100;

// Maximum file size for content search
const MAX_CONTENT_SEARCH_SIZE = 1024 * 1024; // 1MB

/**
 * Represents a file match from a search
 */
interface FileMatch {
  filePath: string;
  content?: string;
  lineNumber?: number;
  lineContent?: string;
  matchCount?: number;
}

/**
 * Represents the result of a file search
 */
interface FileSearchResult {
  query: string;
  searchType: "pattern" | "content";
  totalFound: number;
  matches: FileMatch[];
  message?: string;
}

export const fileSearchTool = tool({
  name: "FileSearch",
  description:
    "Search for files in the filesystem using glob patterns or search for content within files. Use glob patterns like '**/*.ts' or '*test*' to find files, or use searchTerm to search for text content inside files.",
  parameters: z.strictObject({
    pattern: z
      .string()
      .describe(
        "Glob pattern to match files (e.g., '**/*.ts', 'src/**/*.js', '*test*')"
      )
      .optional(),
    searchTerm: z
      .string()
      .describe(
        "Text content to search for inside files (works recursively)"
      )
      .optional(),
    path: z
      .string()
      .describe("Base directory to search in. Defaults to current directory.")
      .optional(),
    maxResults: z
      .number()
      .int()
      .positive()
      .default(50)
      .describe("Maximum number of results to return (max: 100)"),
    includeLines: z
      .boolean()
      .default(false)
      .describe("Include line numbers and content when searching for text"),
  }),
  async execute({
    pattern,
    searchTerm,
    path = ".",
    maxResults,
    includeLines,
  }): Promise<FileSearchResult> {
    logger.info("Executing file search", {
      pattern,
      searchTerm,
      path,
      maxResults,
      includeLines,
    });

    // Validate inputs
    if (!pattern && !searchTerm) {
      throw new Error(
        "Either 'pattern' (glob pattern) or 'searchTerm' (text content) must be provided"
      );
    }

    // Limit max results
    const actualMaxResults = Math.min(maxResults, MAX_FILES_TO_RETURN);

    try {
      // Validate base path exists
      await access(path, fsConstants.F_OK | fsConstants.R_OK);

      // Search by glob pattern
      if (pattern) {
        return await searchByPattern(pattern, path, actualMaxResults);
      }

      // Search by content
      if (searchTerm) {
        return await searchByContent(
          searchTerm,
          path,
          actualMaxResults,
          includeLines
        );
      }
    } catch (err: any) {
      logger.error("File search error", {
        err: err?.message || String(err),
        pattern,
        searchTerm,
        path,
      });
      throw new Error(
        `File search failed: ${err?.message || String(err)}`
      );
    }
  },
});

/**
 * Search for files using a glob pattern
 */
async function searchByPattern(
  pattern: string,
  basePath: string,
  maxResults: number
): Promise<FileSearchResult> {
  try {
    const results = await glob(pattern, {
      cwd: basePath,
      absolute: false,
      nodir: true,
      dot: false,
      strict: false,
    });

    // Filter results that exist and are readable
    const validResults: string[] = [];
    for (const filePath of results) {
      try {
        const fullPath = `${basePath}/${filePath}`;
        await access(fullPath, fsConstants.F_OK | fsConstants.R_OK);
        validResults.push(fullPath);
        if (validResults.length >= maxResults) {
          break;
        }
      } catch (err: any) {
        // Skip files that don't exist or aren't readable
        logger.debug("Skipped unreadable file", { filePath });
      }
    }

    if (validResults.length === 0) {
      return {
        query: pattern,
        searchType: "pattern",
        totalFound: 0,
        matches: [],
        message: `No files found matching pattern: ${pattern}`,
      };
    }

    return {
      query: pattern,
      searchType: "pattern",
      totalFound: validResults.length,
      matches: validResults.map((filePath) => ({ filePath })),
    };
  } catch (err: any) {
    logger.error("Pattern search error", {
      err: err?.message || String(err),
      pattern,
      basePath,
    });
    throw new Error(`Failed to search by pattern: ${err?.message || String(err)}`);
  }
}

/**
 * Search for content inside files
 */
async function searchByContent(
  searchTerm: string,
  basePath: string,
  maxResults: number,
  includeLines: boolean
): Promise<FileSearchResult> {
  // First find all candidate files
  const pattern = "**/*";
  const candidateFiles: string[] = [];

  try {
    const results = await glob(pattern, {
      cwd: basePath,
      absolute: false,
      nodir: true,
      dot: false,
      strict: false,
    });

    for (const filePath of results) {
      try {
        const fullPath = `${basePath}/${filePath}`;
        await access(fullPath, fsConstants.F_OK | fsConstants.R_OK);
        candidateFiles.push(fullPath);
      } catch (err: any) {
        logger.debug("Skipped unreadable file", { filePath });
      }
    }
  } catch (err: any) {
    throw new Error(`Failed to find candidate files: ${err?.message || String(err)}`);
  }

  logger.info("Found candidate files for content search", {
    count: candidateFiles.length,
    maxResults,
  });

  // Search through files for the search term
  const matches: FileMatch[] = [];
  let searchCount = 0;

  for (const filePath of candidateFiles) {
    if (matches.length >= maxResults) {
      break;
    }

    try {
      const buffer = await readFile(filePath);

      // Skip large files
      if (buffer.length > MAX_CONTENT_SEARCH_SIZE) {
        logger.debug("Skipped large file", { filePath, size: buffer.length });
        continue;
      }

      const text = buffer.toString("utf-8");

      // Simple case-insensitive search
      const lines = text.split("\n");
      let fileMatchCount = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.toLowerCase().includes(searchTerm.toLowerCase())) {
          if (!includeLines) {
            // Just return the file path with match count
            if (fileMatchCount === 0) {
              matches.push({
                filePath,
                matchCount: 1,
              });
            } else {
              matches[matches.length - 1].matchCount =
                (matches[matches.length - 1].matchCount || 0) + 1;
            }
            fileMatchCount++;
          } else {
            // Include line numbers and content
            matches.push({
              filePath,
              lineNumber: i + 1,
              lineContent: line.trim(),
            });
            if (matches.length >= maxResults) {
              break;
            }
          }
        }
      }
    } catch (err: any) {
      logger.debug("Skipped file with read error", {
        filePath,
        err: err?.message || String(err),
      });
    }

    searchCount++;
  }

  logger.info("Content search completed", {
    filesSearched: searchCount,
    matchesFound: matches.length,
  });

  if (matches.length === 0) {
    return {
      query: searchTerm,
      searchType: "content",
      totalFound: 0,
      matches: [],
      message: `No matches found for: ${searchTerm}`,
    };
  }

  return {
    query: searchTerm,
    searchType: "content",
    totalFound: matches.length,
    matches,
  };
}
