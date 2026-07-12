import { open, readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { glob } from "glob";
import { parseSkillFrontmatter, parseSkillManifest } from "./frontmatter";
import type { SkillMetadata } from "./types";

const MAX_SKILL_FILE_SIZE = 64 * 1024;
const MAX_FRONTMATTER_SIZE = 16 * 1024;

export class SkillRegistry {
  private readonly skills = new Map<string, SkillMetadata>();

  static async discover(roots: readonly string[]): Promise<SkillRegistry> {
    const registry = new SkillRegistry();

    for (const root of roots) {
      const configuredRoot = resolve(root);
      const rootStat = await stat(configuredRoot).catch(() => undefined);
      if (!rootStat?.isDirectory()) continue;

      const rootPath = await realpath(configuredRoot);
      const files = await glob("**/SKILL.md", {
        cwd: rootPath,
        absolute: true,
        nodir: true,
        follow: false,
      });

      for (const discoveredPath of files.sort()) {
        const filePath = await realpath(discoveredPath);
        assertWithinRoot(rootPath, filePath, "Skill path escapes configured root");

        const fileStat = await stat(filePath);
        if (!fileStat.isFile() || fileStat.size > MAX_SKILL_FILE_SIZE) {
          throw new Error(`Skill file is invalid or exceeds 64KB: ${filePath}`);
        }

        const metadata = parseSkillFrontmatter(
          await readFrontmatterPrefix(filePath),
        );
        const skillDirectory = dirname(filePath);
        const configuredManifestPath = join(skillDirectory, "skill.json");
        const manifestStat = await stat(configuredManifestPath).catch(
          (error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return undefined;
            throw error;
          },
        );
        let manifestRaw: string | undefined;
        if (manifestStat) {
          if (!manifestStat.isFile() || manifestStat.size > MAX_FRONTMATTER_SIZE) {
            throw new Error(`Skill manifest is invalid or exceeds 16KB: ${filePath}`);
          }
          const manifestPath = await realpath(configuredManifestPath);
          assertWithinRoot(
            skillDirectory,
            manifestPath,
            "Skill manifest escapes skill directory",
          );
          manifestRaw = await readFile(manifestPath, "utf8");
        }
        const manifest = parseSkillManifest(manifestRaw);

        registry.register({
          ...metadata,
          ...manifest,
          filePath,
          rootPath,
          fileSize: fileStat.size,
          modifiedTimeMs: fileStat.mtimeMs,
        });
      }
    }

    return registry;
  }

  register(skill: SkillMetadata): void {
    if (this.skills.has(skill.name)) {
      throw new Error(`Duplicate skill name: ${skill.name}`);
    }
    this.skills.set(skill.name, skill);
  }

  get(name: string): SkillMetadata | undefined {
    return this.skills.get(name);
  }

  list(): SkillMetadata[] {
    return [...this.skills.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }
}

export function defaultSkillRoots(cwd = process.cwd()): string[] {
  return [resolve(cwd, ".agents/skills"), resolve(cwd, "skills")];
}

async function readFrontmatterPrefix(filePath: string): Promise<string> {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(MAX_FRONTMATTER_SIZE);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const prefix = buffer.subarray(0, bytesRead).toString("utf8");
    if (!/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(prefix)) {
      throw new Error(`Skill frontmatter exceeds 16KB or is invalid: ${filePath}`);
    }
    return prefix;
  } finally {
    await handle.close();
  }
}

function assertWithinRoot(rootPath: string, filePath: string, message: string) {
  const pathFromRoot = relative(rootPath, filePath);
  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    throw new Error(`${message}: ${filePath}`);
  }
}
