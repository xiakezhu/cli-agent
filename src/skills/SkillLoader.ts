import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import { parseSkillDocument } from "./frontmatter";
import { SkillRegistry } from "./SkillRegistry";
import type { LoadedSkill } from "./types";

const MAX_SKILL_FILE_SIZE = 64 * 1024;

export class SkillLoader {
  constructor(private readonly registry: SkillRegistry) {}

  async load(name: string): Promise<LoadedSkill> {
    const metadata = this.registry.get(name);
    if (!metadata) throw new Error(`Unknown skill: ${name}`);

    const [rootPath, filePath] = await Promise.all([
      realpath(metadata.rootPath),
      realpath(metadata.filePath),
    ]);
    const pathFromRoot = relative(rootPath, filePath);
    if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
      throw new Error(`Skill path escapes configured root: ${name}`);
    }

    const fileStat = await stat(filePath);
    if (!fileStat.isFile() || fileStat.size > MAX_SKILL_FILE_SIZE) {
      throw new Error(`Skill file is invalid or exceeds 64KB: ${name}`);
    }
    if (
      fileStat.size !== metadata.fileSize ||
      fileStat.mtimeMs !== metadata.modifiedTimeMs
    ) {
      throw new Error(`Skill changed after discovery; restart the CLI: ${name}`);
    }

    const raw = await readFile(filePath, "utf8");
    const parsed = parseSkillDocument(raw, {
      version: metadata.version,
      requiredCapabilities: metadata.requiredCapabilities,
    });
    if (parsed.metadata.name !== name) {
      throw new Error(`Skill name changed after discovery: ${name}`);
    }
    return { metadata, instructions: parsed.instructions };
  }
}
