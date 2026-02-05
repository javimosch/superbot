/**
 * Web tools: web_search and web_fetch
 */
import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Tool } from './base.js';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/537.36';

/**
 * Strip HTML tags and decode entities
 */
function stripTags(text) {
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<[^>]+>/g, '');
  return text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

/**
 * Normalize whitespace
 */
function normalize(text) {
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export class WebSearchTool extends Tool {
  /**
   * @param {object} options
   * @param {string} [options.apiKey] - Brave API key
   */
  constructor({ apiKey } = {}) {
    super();
    this.apiKey = apiKey || process.env.BRAVE_API_KEY || '';
  }

  get name() { return 'web_search'; }
  get description() { return 'Search the web. Returns titles, URLs, and snippets.'; }
  get parameters() {
    return {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        count: { type: 'integer', description: 'Number of results (1-10)', minimum: 1, maximum: 10 }
      },
      required: ['query']
    };
  }

  async execute({ query, count = 5 }) {
    if (!this.apiKey) {
      return 'Error: BRAVE_API_KEY not configured';
    }

    try {
      const n = Math.min(Math.max(count, 1), 10);
      const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
        params: { q: query, count: n },
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': this.apiKey
        },
        timeout: 10000
      });

      const results = response.data?.web?.results || [];
      if (results.length === 0) {
        return `No results for: ${query}`;
      }

      const lines = [`Results for: ${query}\n`];
      results.slice(0, n).forEach((item, i) => {
        lines.push(`${i + 1}. ${item.title || ''}\n   ${item.url || ''}`);
        if (item.description) lines.push(`   ${item.description}`);
      });
      return lines.join('\n');
    } catch (err) {
      return `Error: ${err.message}`;
    }
  }
}

export class WebFetchTool extends Tool {
  /**
   * @param {object} options
   * @param {number} [options.maxChars=50000]
   */
  constructor({ maxChars = 50000 } = {}) {
    super();
    this.maxChars = maxChars;
  }

  get name() { return 'web_fetch'; }
  get description() { return 'Fetch URL and extract readable content (HTML → text).'; }
  get parameters() {
    return {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        extractMode: { type: 'string', enum: ['markdown', 'text'], description: 'Extract mode' },
        maxChars: { type: 'integer', description: 'Max characters to return', minimum: 100 }
      },
      required: ['url']
    };
  }

  async execute({ url, extractMode = 'text', maxChars }) {
    const max = maxChars || this.maxChars;

    // Validate URL
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return JSON.stringify({ error: 'Only http/https URLs allowed', url });
      }
    } catch {
      return JSON.stringify({ error: 'Invalid URL', url });
    }

    try {
      const response = await axios.get(url, {
        headers: { 'User-Agent': USER_AGENT },
        timeout: 30000,
        maxRedirects: 5
      });

      const contentType = response.headers['content-type'] || '';
      let text, extractor;

      if (contentType.includes('application/json')) {
        text = JSON.stringify(response.data, null, 2);
        extractor = 'json';
      } else if (contentType.includes('text/html') || (typeof response.data === 'string' && response.data.trim().toLowerCase().startsWith('<!doctype'))) {
        const dom = new JSDOM(response.data);
        const doc = dom.window.document;
        // Remove scripts and styles
        doc.querySelectorAll('script, style, nav, header, footer, aside').forEach(el => el.remove());
        const title = doc.querySelector('title')?.textContent || '';
        const body = doc.body?.textContent || '';
        text = title ? `# ${title}\n\n${normalize(body)}` : normalize(body);
        extractor = 'jsdom';
      } else {
        text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        extractor = 'raw';
      }

      const truncated = text.length > max;
      if (truncated) text = text.slice(0, max);

      return JSON.stringify({
        url,
        finalUrl: response.request?.res?.responseUrl || url,
        status: response.status,
        extractor,
        truncated,
        length: text.length,
        text
      });
    } catch (err) {
      return JSON.stringify({ error: err.message, url });
    }
  }
}
