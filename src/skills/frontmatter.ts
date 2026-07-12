import { z } from "zod";
import type { ToolCapability } from "../tools/registry";

const capabilitySchema = z.enum([
  "web-search",
  "filesystem-read",
  "filesystem-search",
]);

const metadataSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must use kebab-case"),
  description: z.string().trim().min(1).max(500),
}).strict();

const manifestSchema = z
  .object({
    version: z.number().int().positive().optional(),
    requiredCapabilities: z.array(capabilitySchema).default([]),
  })
  .strict();

export type SkillFrontmatter = z.infer<typeof metadataSchema>;
export type SkillManifest = z.infer<typeof manifestSchema>;

export type ParsedSkillDocument = {
  metadata: {
    name: string;
    description: string;
    version?: number;
    requiredCapabilities: ToolCapability[];
  };
  instructions: string;
};

export function parseSkillFrontmatter(raw: string): SkillFrontmatter {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    throw new Error("SKILL.md must start with YAML frontmatter");
  }

  const fields = parseSimpleYaml(match[1]);
  return metadataSchema.parse({
    name: fields.name,
    description: fields.description,
  });
}

export function parseSkillDocument(
  raw: string,
  manifest: SkillManifest = { requiredCapabilities: [] },
): ParsedSkillDocument {
  const metadata = parseSkillFrontmatter(raw);
  const match = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
  const instructions = match?.[1].trim() ?? "";
  if (!instructions) {
    throw new Error(`Skill ${metadata.name} has no instructions`);
  }

  return {
    metadata: { ...metadata, ...manifest },
    instructions,
  };
}

export function parseSkillManifest(raw: string | undefined): SkillManifest {
  if (raw === undefined) return { requiredCapabilities: [] };
  return manifestSchema.parse(JSON.parse(raw));
}

function parseSimpleYaml(source: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  let activeList: string | undefined;

  for (const originalLine of source.split(/\r?\n/)) {
    const line = originalLine.trim();
    if (!line || line.startsWith("#")) continue;

    const listItem = line.match(/^-\s+(.+)$/);
    if (listItem && activeList) {
      const current = result[activeList];
      if (!Array.isArray(current)) {
        throw new Error(`Invalid list for ${activeList}`);
      }
      current.push(unquote(listItem[1]));
      continue;
    }

    const field = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (!field) {
      throw new Error(`Unsupported frontmatter line: ${line}`);
    }

    const [, key, rawValue] = field;
    if (rawValue === "") {
      result[key] = [];
      activeList = key;
    } else {
      result[key] = unquote(rawValue);
      activeList = undefined;
    }
  }

  return result;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
