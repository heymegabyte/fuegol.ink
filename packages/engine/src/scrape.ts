import type { Document, ScrapeRequest } from '@fuegol/contracts';
import { ScrapeRequestSchema } from '@fuegol/contracts';
import { safeFetch } from './fetcher';
import { assertSafeUrl } from './ssrf';
import { parseHtml, selectContent, extractLinks } from './extract-content';
import { extractMetadata } from './metadata';
import { htmlToMarkdown, stripBase64Images } from './html-to-markdown';
import { browserAvailable, browserQuickAction, browserScreenshot } from './browser';
import { scrapeWithActions, puppeteerAvailable } from './interact';
import { extractWithAI, extractAvailable } from './extract-ai';
import { planScrape, formatTypes } from './planner';
import type { EngineEnv } from './types';

export interface ScrapeResult {
  document: Document;
  strategy: string;
}

const PLANNED_BROWSER_FORMATS = ['changeTracking', 'images', 'audio', 'video', 'product', 'menu'];

/** Scrape a single URL into a Firecrawl-compatible Document via the cheapest adequate tier.
 *  Post-processes every tier's output uniformly (e.g. removeBase64Images, default true). */
export async function scrape(request: ScrapeRequest, env: EngineEnv): Promise<ScrapeResult> {
  const result = await scrapeInner(request, env);
  if ((request.removeBase64Images ?? true) !== false) {
    const doc = result.document;
    if (doc.markdown) doc.markdown = stripBase64Images(doc.markdown);
    if (doc.html) doc.html = stripBase64Images(doc.html);
  }
  return result;
}

async function scrapeInner(request: ScrapeRequest, env: EngineEnv): Promise<ScrapeResult> {
  const options = ScrapeRequestSchema.parse(request);
  const url = assertSafeUrl(options.url);
  const formats = formatTypes(options.formats);
  const wantMarkdown = formats.has('markdown') || formats.size === 0;
  const plan = planScrape(options, env);

  if (plan.primary === 'browser') {
    // Action sequences (click/type/scroll/screenshot/scrape/JS) need a driven browser.
    if (options.actions && options.actions.length > 0) {
      if (puppeteerAvailable(env)) {
        return scrapeWithActions(options, env, formats);
      }
      const fallback = await browserScrape(options, env, formats);
      fallback.document.warning = appendWarning(
        fallback.document.warning,
        'actions require the Browser Rendering binding (only a REST token is configured); returned a plain render.',
      );
      return fallback;
    }
    return browserScrape(options, env, formats);
  }

  const { response, finalUrl } = await safeFetch(url, {
    headers: options.headers,
    userAgent: env.USER_AGENT,
    timeoutMs: options.timeout ?? 30000,
  });
  const contentType = response.headers.get('content-type') ?? '';
  const statusCode = response.status;

  // Non-HTML (PDF/DOCX/…) needs the document-parse tier (planned).
  if (contentType && !/html|xml|text\/plain/i.test(contentType)) {
    return {
      strategy: 'http',
      document: {
        url: finalUrl,
        metadata: { statusCode, sourceURL: finalUrl, url: finalUrl, contentType },
        warning: `Content-Type "${contentType}" requires the document-parse tier (not enabled on this deployment).`,
      },
    };
  }

  const html = await response.text();
  const root = parseHtml(html);
  const links = extractLinks(root, finalUrl);
  const metadata = extractMetadata(root, { url: finalUrl, statusCode, contentType });
  const content = selectContent(root, {
    onlyMainContent: options.onlyMainContent,
    includeTags: options.includeTags,
    excludeTags: options.excludeTags,
  });
  const markdown = htmlToMarkdown(content, { baseUrl: finalUrl });

  const doc: Document = {
    url: finalUrl,
    title: metadata.title,
    description: metadata.description,
    metadata,
  };
  if (wantMarkdown) doc.markdown = markdown;
  if (formats.has('summary')) doc.summary = summarize(markdown);
  if (formats.has('html')) doc.html = content.toString();
  if (formats.has('rawHtml')) doc.rawHtml = html;
  if (formats.has('links')) doc.links = links;

  // Structured JSON extraction. Prefer Workers AI (available account-wide) over the
  // Browser Rendering /json tier; fall back to a warning when neither is configured.
  if (formats.has('json')) {
    const jsonFmt = (options.formats ?? []).find(
      (f) => typeof f === 'object' && f.type === 'json',
    ) as { prompt?: string; schema?: Record<string, unknown> } | undefined;
    if (extractAvailable(env)) {
      try {
        doc.json = await extractWithAI(
          doc.markdown ?? markdown,
          { prompt: jsonFmt?.prompt, schema: jsonFmt?.schema },
          env,
        );
      } catch (e) {
        doc.warning = appendWarning(doc.warning, `AI extraction failed: ${e instanceof Error ? e.message : 'error'}`);
      }
    } else if (browserAvailable(env)) {
      try {
        const r = await browserQuickAction(env, 'json', {
          url: finalUrl,
          prompt: jsonFmt?.prompt,
          response_format: jsonFmt?.schema ? { type: 'json_schema', json_schema: jsonFmt.schema } : undefined,
        });
        if (r.result !== undefined) doc.json = r.result;
      } catch {
        doc.warning = appendWarning(doc.warning, 'JSON extraction failed; returning content-only result.');
      }
    } else {
      doc.warning = appendWarning(doc.warning, 'json format needs the AI (Workers AI) or browser tier — bind AI to enable.');
    }
  }

  const deferred = [...formats].filter((f) => PLANNED_BROWSER_FORMATS.includes(f));
  if (deferred.length) {
    doc.warning = appendWarning(doc.warning, `formats [${deferred.join(', ')}] are planned, not yet served.`);
  }

  // Near-empty static output (likely a client-rendered SPA) → escalate to the browser
  // tier. Conservative threshold so real-but-short pages don't incur browser cost.
  if (plan.allowEscalation && wantMarkdown && markdown.length < 100) {
    try {
      const r = await browserQuickAction<string>(env, 'markdown', { url: finalUrl });
      if (r.result && r.result.length > markdown.length) {
        doc.markdown = r.result;
        return { document: doc, strategy: 'browser-escalated' };
      }
    } catch {
      /* keep the static result */
    }
  }

  return { document: doc, strategy: 'http' };
}

/** Browser-primary scrape (JS-rendered). Uses Quick Actions for markdown/html/links. */
async function browserScrape(
  options: ScrapeRequest,
  env: EngineEnv,
  formats: Set<string>,
): Promise<ScrapeResult> {
  const url = new URL(options.url).toString();
  const doc: Document = { url, metadata: { statusCode: 200, sourceURL: url, url } };

  if (formats.has('markdown') || formats.size === 0) {
    let r = await browserQuickAction<string>(env, 'markdown', { url });
    if (!r.result) r = await browserQuickAction<string>(env, 'markdown', { url }); // retry browser cold-start
    // Browser Rendering /markdown prepends YAML frontmatter; strip it for Firecrawl parity.
    if (r.result) doc.markdown = r.result.replace(/^---\n[\s\S]*?\n---\n+/, '');
  }
  if (formats.has('html')) {
    const r = await browserQuickAction<string>(env, 'content', { url });
    if (r.result) doc.html = r.result;
  }
  if (formats.has('links')) {
    const r = await browserQuickAction<string[]>(env, 'links', { url });
    if (Array.isArray(r.result)) doc.links = r.result;
  }
  if (formats.has('screenshot')) {
    if (env.ARTIFACTS) {
      const bytes = await browserScreenshot(env, url);
      if (bytes) {
        const key = `screenshots/${crypto.randomUUID()}.png`;
        await env.ARTIFACTS.put(key, bytes, { httpMetadata: { contentType: 'image/png' } });
        doc.screenshot = `${env.ASSET_BASE ?? ''}/assets/${key}`;
      } else {
        doc.warning = 'screenshot capture failed.';
      }
    } else {
      doc.warning = 'screenshot format needs the R2 (ARTIFACTS) binding.';
    }
  }
  return { document: doc, strategy: 'browser' };
}

function summarize(markdown: string): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*`_[\]()!|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= 400) return text;
  return text.slice(0, 400).replace(/\s\S*$/, '') + '…';
}

function appendWarning(existing: string | undefined, next: string): string {
  return existing ? `${existing} ${next}` : next;
}
