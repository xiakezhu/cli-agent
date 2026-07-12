import { Agent, run } from "@openai/agents";
import { z } from "zod";
import { SkillRegistry } from "./SkillRegistry";

const MAX_SELECTED_SKILLS = 2;
const MAX_CATALOG_CHARS = 8_000;

const selectionSchema = z.object({
  skills: z.array(z.string()).max(MAX_SELECTED_SKILLS),
  reason: z.string(),
});

export type ExplicitSkillSelection = {
  skillNames: string[];
  input: string;
};

export function parseExplicitSkillSelection(
  input: string,
  registry: SkillRegistry,
): ExplicitSkillSelection {
  const requested = [...input.matchAll(/(?:^|\s)\$([a-z0-9]+(?:-[a-z0-9]+)*)\b/g)]
    .map((match) => match[1])
    .filter((name, index, names) => names.indexOf(name) === index);

  if (requested.length > MAX_SELECTED_SKILLS) {
    throw new Error(`Select at most ${MAX_SELECTED_SKILLS} skills`);
  }
  for (const name of requested) {
    if (!registry.get(name)) throw new Error(`Unknown skill: ${name}`);
  }

  const taskInput = input
    .replace(/(?:^|\s)\$[a-z0-9]+(?:-[a-z0-9]+)*\b/g, " ")
    .trim();
  if (requested.length > 0 && !taskInput) {
    throw new Error("Provide a task after the explicit skill name");
  }

  return {
    skillNames: requested,
    input: taskInput,
  };
}

export async function selectSkillsImplicitly(options: {
  input: string;
  registry: SkillRegistry;
  model: string;
}): Promise<string[]> {
  const catalog = formatSkillCatalog(options.registry);
  if (!catalog) return [];

  const selector = new Agent({
    name: "Skill Selector",
    model: options.model,
    instructions: [
      "Select reusable skills that clearly apply to the user's task.",
      `Select at most ${MAX_SELECTED_SKILLS}. Select none when no skill clearly applies.`,
      "Return only registered skill names. Do not perform the task.",
      "Available skills:",
      catalog,
    ].join("\n"),
    outputType: selectionSchema,
    tools: [],
  });

  const result = await run(selector, options.input, { maxTurns: 2 });
  const names = result.finalOutput?.skills ?? [];
  return names.filter((name) => options.registry.get(name));
}

export function formatSkillCatalog(registry: SkillRegistry): string {
  const lines: string[] = [];
  let length = 0;
  for (const skill of registry.list()) {
    const line = `- ${skill.name}: ${skill.description}`;
    if (length + line.length + 1 > MAX_CATALOG_CHARS) break;
    lines.push(line);
    length += line.length + 1;
  }
  return lines.join("\n");
}
