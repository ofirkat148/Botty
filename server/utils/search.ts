/**
 * Web search utility using the Tavily Search API.
 * Docs: https://docs.tavily.com/docs/rest-api/api-reference
 */

export type SearchResult = {
  title: string;
  url: string;
  content: string;
};

export type WebSearchResponse = {
  query: string;
  results: SearchResult[];
};

const TAVILY_API_URL = 'https://api.tavily.com/search';

/**
 * Run a web search via Tavily. Returns up to `maxResults` results.
 * Throws if the API key is missing or the request fails.
 */
export async function webSearch(
  query: string,
  apiKey: string,
  options: { maxResults?: number; signal?: AbortSignal } = {}
): Promise<WebSearchResponse> {
  const { maxResults = 5, signal } = options;

  const response = await fetch(TAVILY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    signal,
    body: JSON.stringify({
      api_key: apiKey,
      query: query.trim().slice(0, 400),
      search_depth: 'basic',
      max_results: Math.min(Math.max(1, maxResults), 10),
      include_answer: false,
      include_raw_content: false,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Tavily search failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const data = await response.json() as {
    query?: string;
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };

  const results: SearchResult[] = (data.results || [])
    .slice(0, maxResults)
    .map(r => ({
      title: String(r.title || '').trim(),
      url: String(r.url || '').trim(),
      content: String(r.content || '').trim().slice(0, 800),
    }))
    .filter(r => r.url);

  return { query: data.query || query, results };
}

/**
 * Format search results as a context block to prepend to the user prompt.
 */
export function formatSearchContext(search: WebSearchResponse): string {
  if (!search.results.length) return '';
  const lines = [
    `[WEB SEARCH RESULTS for: "${search.query}"]`,
    'Use the following current information to answer the user. Cite sources where relevant.',
    '',
  ];
  search.results.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.title}`);
    lines.push(`   URL: ${r.url}`);
    lines.push(`   ${r.content}`);
    lines.push('');
  });
  return lines.join('\n');
}
