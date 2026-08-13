import { tool } from '@openai/agents';
import { z } from 'zod';
import { config } from '../config';
import { logger } from '../utils/logger';
import { ToolError, withTimeout, sanitizeError } from './toolError';

const XAI_ENDPOINT = 'https://api.x.ai/v1/responses';
const GROK_WEB_SEARCH_MODEL = 'grok-4.20-0309-non-reasoning';
const TIMEOUT_MS = 15_000; // 15 seconds

function extractOutput(data: any): string {
  if (typeof data.output_text === 'string' && data.output_text.length > 0) {
    return data.output_text;
  }
  if (Array.isArray(data.output)) {
    return data.output
      .map((entry: any) => {
        if (typeof entry === 'string') return entry;
        if (entry?.content) {
          const text = entry.content
            .filter((part: any) => part?.type === 'output_text')
            .map((part: any) => part.text)
            .join('');
          if (text) return text;
        }
        return undefined;
      })
      .filter(Boolean)
      .join('\n\n');
  }
  return JSON.stringify(data, null, 2);
}

async function callGrokSearchAPI(query: string): Promise<string> {
  if (!config.xaiApiKey) {
    throw new ToolError('web_search', 'XAI_API_KEY is not configured. Add it to your .env to use Grok web search.', 'NOT_CONFIGURED');
  }
  logger.info('Executing Grok web search', { model: GROK_WEB_SEARCH_MODEL, query });
  const controller = new AbortController();

  try {
    const res = await withTimeout(
      fetch(XAI_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.xaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROK_WEB_SEARCH_MODEL,
          tools: [{ type: 'web_search' }],
          input: query,
        }),
        signal: controller.signal,
      }),
      TIMEOUT_MS,
      controller,
    );

    if (!res.ok) {
      const bodyText = await res.text();
      logger.debug('Grok web search failed', { status: res.status, body: bodyText });
      // Sanitize and truncate the response body to avoid leaks and huge messages
      const sanitized = sanitizeError(
        new Error(bodyText),
        'web_search',
      ).message;
      throw new ToolError(
        'web_search',
        `Grok web search failed (${res.status}): ${sanitized}`,
        `HTTP_${res.status}`,
      );
    }
    const data = await res.json();
    const output = extractOutput(data);
    logger.info('Grok web search completed', {
      model: GROK_WEB_SEARCH_MODEL,
      query,
      outputLength: output.length,
    });
    return output;
  } catch (err) {
    // Re-throw ToolError as-is; sanitize everything else
    if (err instanceof ToolError) {
      throw err;
    }
    throw sanitizeError(err, 'web_search');
  }
}

export const grokWebSearchTool = tool({
  name: 'web_search',
  description: "Search the web using Grok's built-in search.",
  parameters: z.object({
    query: z.string().min(2, 'Query must be at least 2 characters.'),
  }),
  async execute({ query }) {
    const results = await callGrokSearchAPI(query);
    return { query, results };
  },
});
