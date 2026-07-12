import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { formatSkillInstructions, resolveSkillCapabilities } from "../context";
import { SkillLoader } from "../SkillLoader";
import { SkillRegistry } from "../SkillRegistry";
import { createSkillResourceReadTool } from "../SkillResourceTool";
import {
  formatSkillCatalog,
  parseExplicitSkillSelection,
} from "../SkillSelector";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function createSkillRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "skill-registry-test-"));
  tempDirs.push(root);
  return root;
}

async function writeSkill(root: string, name: string): Promise<void> {
  const directory = join(root, name);
  await mkdir(directory);
  await writeFile(
    join(directory, "SKILL.md"),
    [
      "---",
      `name: ${name}`,
      `description: Use ${name} for focused repository reviews.`,
      "---",
      "",
      `# ${name}`,
      "",
      "Inspect the repository and report findings.",
    ].join("\n"),
  );
  await writeFile(
    join(directory, "skill.json"),
    JSON.stringify({
      version: 1,
      requiredCapabilities: ["filesystem-read", "filesystem-search"],
    }),
  );
}

describe("skill management", () => {
  test("discovers metadata and lazily loads full instructions", async () => {
    const root = await createSkillRoot();
    await writeSkill(root, "code-review");

    const registry = await SkillRegistry.discover([root]);
    const metadata = registry.get("code-review");

    expect(metadata?.description).toContain("focused repository reviews");
    const loaded = await new SkillLoader(registry).load("code-review");
    expect(loaded.instructions).toContain("Inspect the repository");
    expect(resolveSkillCapabilities([loaded])).toEqual([
      "filesystem-read",
      "filesystem-search",
    ]);
  });

  test("parses explicit skill mentions and removes them from task input", async () => {
    const root = await createSkillRoot();
    await writeSkill(root, "code-review");
    const registry = await SkillRegistry.discover([root]);

    expect(
      parseExplicitSkillSelection(
        "$code-review inspect the current changes",
        registry,
      ),
    ).toEqual({
      skillNames: ["code-review"],
      input: "inspect the current changes",
    });
  });

  test("rejects unknown explicit skills", async () => {
    const registry = await SkillRegistry.discover([]);
    expect(() =>
      parseExplicitSkillSelection("$missing do work", registry),
    ).toThrow("Unknown skill: missing");
  });

  test("requires a task after an explicit skill mention", async () => {
    const root = await createSkillRoot();
    await writeSkill(root, "code-review");
    const registry = await SkillRegistry.discover([root]);

    expect(() => parseExplicitSkillSelection("$code-review", registry)).toThrow(
      "Provide a task",
    );
  });

  test("rejects duplicate skill names across roots", async () => {
    const firstRoot = await createSkillRoot();
    const secondRoot = await createSkillRoot();
    await writeSkill(firstRoot, "code-review");
    await writeSkill(secondRoot, "code-review");

    expect(SkillRegistry.discover([firstRoot, secondRoot])).rejects.toThrow(
      "Duplicate skill name: code-review",
    );
  });

  test("formats bounded discovery metadata without full instructions", async () => {
    const root = await createSkillRoot();
    await writeSkill(root, "code-review");
    const registry = await SkillRegistry.discover([root]);

    const catalog = formatSkillCatalog(registry);
    expect(catalog).toContain("code-review: Use code-review");
    expect(catalog).not.toContain("Inspect the repository");
  });

  test("formats loaded instructions for a task agent", async () => {
    const root = await createSkillRoot();
    await writeSkill(root, "code-review");
    const registry = await SkillRegistry.discover([root]);
    const loaded = await new SkillLoader(registry).load("code-review");

    expect(formatSkillInstructions([loaded])).toContain(
      '<skill name="code-review">',
    );
  });

  test("discovers metadata without requiring a valid instruction body", async () => {
    const root = await createSkillRoot();
    const directory = join(root, "metadata-only");
    await mkdir(directory);
    await writeFile(
      join(directory, "SKILL.md"),
      [
        "---",
        "name: metadata-only",
        "description: Metadata can be discovered without loading instructions.",
        "---",
      ].join("\n"),
    );

    const registry = await SkillRegistry.discover([root]);
    expect(registry.get("metadata-only")?.description).toContain("Metadata");
    expect(new SkillLoader(registry).load("metadata-only")).rejects.toThrow(
      "has no instructions",
    );
  });

  test("reads selected skill references relative to the skill directory", async () => {
    const root = await createSkillRoot();
    await writeSkill(root, "code-review");
    const referenceDirectory = join(root, "code-review", "references");
    await mkdir(referenceDirectory);
    await writeFile(join(referenceDirectory, "security.md"), "Check boundaries.");

    const registry = await SkillRegistry.discover([root]);
    const loaded = await new SkillLoader(registry).load("code-review");
    const resourceTool = createSkillResourceReadTool([loaded]);
    const result = (await resourceTool.invoke(
      undefined as any,
      JSON.stringify({
        skillName: "code-review",
        resourcePath: "references/security.md",
      }),
    )) as any;

    expect(result.content).toBe("Check boundaries.");
    expect(result.resourcePath).toBe("references/security.md");
  });

  test("prevents selected skill resources from escaping their directory", async () => {
    const root = await createSkillRoot();
    await writeSkill(root, "code-review");
    await writeFile(join(root, "outside.md"), "secret");

    const registry = await SkillRegistry.discover([root]);
    const loaded = await new SkillLoader(registry).load("code-review");
    const resourceTool = createSkillResourceReadTool([loaded]);
    const result = await resourceTool.invoke(
      undefined as any,
      JSON.stringify({
        skillName: "code-review",
        resourcePath: "references/../../outside.md",
      }),
    );

    expect(result).toContain("escapes selected skill");
  });
});
