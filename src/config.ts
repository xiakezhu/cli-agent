import { z } from 'zod';

const envSchema = z.object({
  LLM_API_KEY: z.string().trim().min(1),
  TAVILY_API_KEY: z.string().trim().min(1),
  OPENAI_BASE_URL: z.string().trim().url().optional(),
  OPENAI_MODEL: z.string().trim().min(1).optional(),
});

function formatEnvError(issues: z.ZodIssue[]): string {
  const missing = new Set<string>();
  const invalid = new Set<string>();

  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key !== 'string') continue;

    if (issue.code === 'invalid_type' && issue.message === 'undefined') {
      missing.add(key);
      continue;
    }

    invalid.add(key);
  }

  const lines: string[] = ['Environment validation failed.'];
  if (missing.size > 0) {
    lines.push('Missing required environment variable(s):');
    for (const key of missing) lines.push(`  - ${key}`);
  }
  if (invalid.size > 0) {
    lines.push('Invalid environment variable(s):');
    for (const key of invalid) lines.push(`  - ${key}`);
  }
  lines.push('');
  lines.push('Set these values in your shell or .env before starting the CLI.');
  return lines.join('\n');
}

function readEnv(): z.infer<typeof envSchema> {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(formatEnvError(parsed.error.issues));
  }
  return parsed.data;
}

const env = readEnv();

export const config = {
  llmApiKey: env.LLM_API_KEY,
  tavilyApiKey: env.TAVILY_API_KEY,
  openAIBaseURL: env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
  openAIModel: env.OPENAI_MODEL ?? 'gpt-4',
} as const;
