import type { ToolCapability } from "../tools/registry";
import type { LoadedSkill } from "./types";

export function formatSkillInstructions(skills: readonly LoadedSkill[]): string {
  if (skills.length === 0) return "";

  return [
    "Follow the selected trusted skill workflows for this turn.",
    "Load referenced text only when needed with SkillResourceRead and paths relative to the selected skill directory.",
    ...skills.map(
      ({ metadata, instructions }) =>
        `<skill name="${metadata.name}">\n${instructions}\n</skill>`,
    ),
  ].join("\n\n");
}

export function resolveSkillCapabilities(
  skills: readonly LoadedSkill[],
): ToolCapability[] {
  return [...new Set(skills.flatMap(({ metadata }) => metadata.requiredCapabilities))];
}
