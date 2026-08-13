import type { LoadedSkill } from "./types";
import { formatSkillInstructions } from "./context";
import { SkillLoader } from "./SkillLoader";
import { parseExplicitSkillSelection } from "./SkillSelector";
import { SkillRegistry } from "./SkillRegistry";

export function applySkillInstructions(task: string, skills: readonly LoadedSkill[]): string {
  const instructions = formatSkillInstructions(skills);
  if (!instructions) return task;
  return `${instructions}\n\nUser task:\n${task}`;
}

export async function preparePromptWithSkills(
  text: string,
  registry: SkillRegistry,
  loader: SkillLoader,
): Promise<string> {
  const { skillNames, input } = parseExplicitSkillSelection(text, registry);
  if (skillNames.length === 0) return input;
  const loaded = await Promise.all(skillNames.map((name) => loader.load(name)));
  return applySkillInstructions(input, loaded);
}
