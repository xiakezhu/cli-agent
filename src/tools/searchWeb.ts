import { tool } from '@openai/agents';
import { tavily } from '@tavily/core';
import { z } from 'zod';
import { config } from '../config';

type SearchResult = {
  title: string;
  url: string;
  snippet?: string;
};

async function callSearchAPI(text: string): Promise<string> {
  const tvly = tavily({ apiKey: config.tavilyApiKey });
  const response = await tvly.search(text);
  return response.results.map((result: any) => `${result.title}\n${result.url}\n${result.snippet}`).join("\n\n");
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
