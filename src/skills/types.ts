import type { ToolCapability } from "../tools/registry";

export type SkillMetadata = {
  name: string;
  description: string;
  version?: number;
  requiredCapabilities: ToolCapability[];
  filePath: string;
  rootPath: string;
  fileSize: number;
  modifiedTimeMs: number;
};

export type LoadedSkill = {
  metadata: SkillMetadata;
  instructions: string;
};
