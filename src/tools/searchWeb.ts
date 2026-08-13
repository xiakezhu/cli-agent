import { tool } from '@openai/agents';
import { tavily } from '@tavily/core';
import { z } from 'zod';
import { config } from '../config';
import { withTimeout, sanitizeError, ToolError } from './toolError';

const TIMEOUT_MS = 15_000; // 15 seconds

type SearchResult = {
  title: string;
  url: string;
  snippet?: string;
};

async function callSearchAPI(text: string): Promise<string> {
  const tvly = tavily({ apiKey: config.tavilyApiKey });
  try {
    const response = await withTimeout(
      tvly.search(text),
      TIMEOUT_MS,
    );
    return response.results.map((result: any) => `${result.title}\n${result.url}\n${result.snippet}`).join("\n\n");
  } catch (err) {
    // Re-throw ToolError as-is; sanitize everything else
    if (err instanceof ToolError) {
      throw err;
    }
    throw sanitizeError(err, 'searchWeb');
  }
}


export const searchWebTool = tool({
  name: 'searchWeb',
  description:
    'Search the web for up-to-date information. Use a short, specific query.',
  parameters: z.object({
    query: z.string().min(2, 'Query must be at least 2 characters.'),
  }),
  async execute({ query }) {
    const results = await callSearchAPI(query);
    return { query, results };
  },
});
