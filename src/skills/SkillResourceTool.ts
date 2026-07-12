import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { tool } from "@openai/agents";
import { z } from "zod";
import type { LoadedSkill } from "./types";

const MAX_RESOURCE_SIZE = 256 * 1024;

export function createSkillResourceReadTool(skills: readonly LoadedSkill[]) {
  const skillDirectories = new Map(
    skills.map(({ metadata }) => [metadata.name, dirname(metadata.filePath)]),
  );

  return tool({
    name: "SkillResourceRead",
    description:
      "Read a text reference from a selected skill. Use only when its SKILL.md instructions direct you to a relative resource path.",
    parameters: z.strictObject({
      skillName: z.string().describe("Selected skill name"),
      resourcePath: z
        .string()
        .min(1)
        .describe("Path relative to the selected skill directory"),
    }),
    async execute({ skillName, resourcePath }) {
      const configuredDirectory = skillDirectories.get(skillName);
      if (!configuredDirectory) {
        throw new Error(`Skill is not selected: ${skillName}`);
      }
      if (isAbsolute(resourcePath)) {
        throw new Error("Skill resource path must be relative");
      }
      if (
        resourcePath !== "references" &&
        !resourcePath.startsWith("references/")
      ) {
        throw new Error("Skill resources must be read from references/");
      }

      const [skillDirectory, resourceFile] = await Promise.all([
        realpath(configuredDirectory),
        realpath(resolve(configuredDirectory, resourcePath)),
      ]);
      const pathFromSkill = relative(skillDirectory, resourceFile);
      if (pathFromSkill.startsWith("..") || isAbsolute(pathFromSkill)) {
        throw new Error(`Skill resource escapes selected skill: ${resourcePath}`);
      }

      const fileStat = await stat(resourceFile);
      if (!fileStat.isFile() || fileStat.size > MAX_RESOURCE_SIZE) {
        throw new Error("Skill resource is invalid or exceeds 256KB");
      }

      return {
        skillName,
        resourcePath: pathFromSkill,
        content: await readFile(resourceFile, "utf8"),
      };
    },
  });
}
