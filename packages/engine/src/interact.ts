import puppeteer from '@cloudflare/puppeteer';
import type { BrowserWorker, Browser, Page, PaperFormat } from '@cloudflare/puppeteer';
import type { Action, Document, ScrapeRequest } from '@fuegol/contracts';
import { parseHtml, selectContent, extractLinks } from './extract-content';
import { extractMetadata } from './metadata';
import { htmlToMarkdown } from './html-to-markdown';
import { assertSafeUrl } from './ssrf';
import type { EngineEnv } from './types';
import type { ScrapeResult } from './scrape';

/** Thrown when a browser action cannot be executed; the API maps it to SCRAPE_ACTION_ERROR. */
export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionError';
  }
}

/** True when a real Browser Rendering *binding* is present (puppeteer needs the binding, not a token). */
export function puppeteerAvailable(env: EngineEnv): boolean {
  return Boolean(env.BROWSER);
}

/** EngineEnv types BROWSER for Quick Actions; puppeteer wants the raw BrowserWorker binding. */
function browserWorker(env: EngineEnv): BrowserWorker {
  return env.BROWSER as unknown as BrowserWorker;
}

export interface ActionsOutput {
  screenshots: string[];
  scrapes: { url: string; html: string }[];
  javascriptReturns: { type: string; value: unknown }[];
  pdfs: string[];
}

async function storeArtifact(
  env: EngineEnv,
  bytes: Uint8Array,
  ext: 'png' | 'pdf',
): Promise<string | null> {
  if (!env.ARTIFACTS) return null;
  const key = `actions/${crypto.randomUUID()}.${ext}`;
  await env.ARTIFACTS.put(key, bytes, {
    httpMetadata: { contentType: ext === 'pdf' ? 'application/pdf' : 'image/png' },
  });
  return `${env.ASSET_BASE ?? ''}/assets/${key}`;
}

/**
 * Execute an ordered sequence of Firecrawl-compatible browser actions against a live page.
 * Mutates page state (clicks/navigation persist); collects intermediate screenshots, scrapes,
 * JS return values, and PDFs. Shared by stateless action-scrapes and persistent sessions.
 */
export async function applyActions(
  page: Page,
  actions: Action[],
  env: EngineEnv,
): Promise<ActionsOutput> {
  const out: ActionsOutput = { screenshots: [], scrapes: [], javascriptReturns: [], pdfs: [] };
  for (const [i, action] of actions.entries()) {
    try {
      switch (action.type) {
        case 'wait':
          if (action.selector) await page.waitForSelector(action.selector, { timeout: 20000 });
          else await new Promise((r) => setTimeout(r, Math.min(action.milliseconds ?? 1000, 30000)));
          break;
        case 'click':
          if (action.all) {
            const els = await page.$$(action.selector);
            if (els.length === 0) throw new Error(`no elements match "${action.selector}"`);
            for (const el of els) await el.click();
          } else {
            await page.click(action.selector);
          }
          break;
        case 'write':
          if (action.selector) await page.type(action.selector, action.text);
          else await page.keyboard.type(action.text);
          break;
        case 'press':
          await page.keyboard.press(action.key as Parameters<Page['keyboard']['press']>[0]);
          break;
        case 'scroll': {
          // String-form evaluate runs in the page (DOM) context — the engine lib has no DOM types.
          const dy = (action.direction === 'up' ? -1 : 1) * 600;
          const evalStr = action.selector
            ? `(() => { const el = document.querySelector(${JSON.stringify(action.selector)}); if (el) el.scrollBy(0, ${dy}); else window.scrollBy(0, ${dy}); })()`
            : `window.scrollBy(0, ${dy})`;
          await (page.evaluate as (s: string) => Promise<unknown>)(evalStr);
          break;
        }
        case 'screenshot': {
          const bytes = (await page.screenshot({
            fullPage: action.fullPage ?? false,
            type: 'png',
          })) as Uint8Array;
          const url = await storeArtifact(env, bytes, 'png');
          if (url) out.screenshots.push(url);
          break;
        }
        case 'scrape': {
          out.scrapes.push({ url: page.url(), html: await page.content() });
          break;
        }
        case 'executeJavascript': {
          // Run the caller's expression in page context. Puppeteer evaluates a string directly.
          const value = await (page.evaluate as (s: string) => Promise<unknown>)(action.script);
          out.javascriptReturns.push({ type: typeof value, value });
          break;
        }
        case 'pdf': {
          const bytes = (await page.pdf({
            landscape: action.landscape,
            scale: action.scale,
            format: action.format as PaperFormat | undefined,
          })) as Uint8Array;
          const url = await storeArtifact(env, bytes, 'pdf');
          if (url) out.pdfs.push(url);
          break;
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new ActionError(`action[${i}] (${action.type}) failed: ${msg}`);
    }
  }
  return out;
}

/** Build a Firecrawl Document from the *current* state of a live page (post-actions). */
export async function captureDocument(
  page: Page,
  options: ScrapeRequest,
  formats: Set<string>,
  env: EngineEnv,
  statusCode: number,
): Promise<Document> {
  const finalUrl = page.url();
  const rawHtml = await page.content();
  const root = parseHtml(rawHtml);
  const links = extractLinks(root, finalUrl);
  const metadata = extractMetadata(root, { url: finalUrl, statusCode, contentType: 'text/html' });
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
  if (formats.has('markdown') || formats.size === 0) doc.markdown = markdown;
  if (formats.has('html')) doc.html = content.toString();
  if (formats.has('rawHtml')) doc.rawHtml = rawHtml;
  if (formats.has('links')) doc.links = links;
  if (formats.has('screenshot')) {
    const bytes = (await page.screenshot({ type: 'png', fullPage: false })) as Uint8Array;
    const u = await storeArtifact(env, bytes, 'png');
    if (u) doc.screenshot = u;
    else doc.warning = 'screenshot capture needs the R2 (ARTIFACTS) binding.';
  }
  return doc;
}

function attachActions(doc: Document, actionsOut: ActionsOutput): void {
  const hasAny =
    actionsOut.screenshots.length ||
    actionsOut.scrapes.length ||
    actionsOut.javascriptReturns.length ||
    actionsOut.pdfs.length;
  if (!hasAny) return;
  doc.actions = {
    screenshots: actionsOut.screenshots.length ? actionsOut.screenshots : undefined,
    scrapes: actionsOut.scrapes.length ? actionsOut.scrapes : undefined,
    javascriptReturns: actionsOut.javascriptReturns.length ? actionsOut.javascriptReturns : undefined,
    pdfs: actionsOut.pdfs.length ? actionsOut.pdfs : undefined,
  };
}

/**
 * Stateless action-scrape: launch a browser, navigate, run the action sequence, then capture
 * the final page state. One browser per request (closed on exit). This is Firecrawl's
 * `/scrape` + `actions` semantics — the document reflects the page *after* interactions.
 */
export async function scrapeWithActions(
  options: ScrapeRequest,
  env: EngineEnv,
  formats: Set<string>,
): Promise<ScrapeResult> {
  const target = assertSafeUrl(options.url).toString();
  const browser: Browser = await puppeteer.launch(browserWorker(env));
  try {
    const page = await browser.newPage();
    if (options.mobile) {
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    }
    const response = await page.goto(target, {
      waitUntil: 'domcontentloaded',
      timeout: options.timeout ?? 30000,
    });
    const statusCode = response?.status() ?? 200;
    if (options.waitFor) await new Promise((r) => setTimeout(r, Math.min(options.waitFor ?? 0, 30000)));

    const actionsOut = await applyActions(page, options.actions ?? [], env);
    const doc = await captureDocument(page, options, formats, env, statusCode);
    attachActions(doc, actionsOut);
    return { document: doc, strategy: 'browser-actions' };
  } finally {
    await browser.close();
  }
}
