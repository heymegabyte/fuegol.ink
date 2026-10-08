import { DurableObject } from 'cloudflare:workers';
import type { Document, CrawlRequest, BatchScrapeRequest } from '@fuegol/contracts';
import { scrape, mapSite, assertSafeUrl, fetchRobots, isAllowed } from '@fuegol/engine';
import { engineEnv, type Env } from './env';

/**
 * CrawlCoordinator — one SQLite-backed Durable Object per crawl job. Owns the frontier,
 * per-origin politeness, robots policy, progress, and page storage. Alarm-driven BFS so
 * the crawl outlives any single request and survives restarts. The stateless Worker just
 * creates the DO and reads its status.
 *
 * v0 bounds (documented): ≤100 pages/job, 3 pages/alarm tick, static-tier scrape. Larger
 * crawls + Queues fan-out are a later increment (docs/implementation-roadmap.md).
 */

const MAX_PAGES_CAP = 100;
const BATCH = 3;
const DEFAULT_DELAY_MS = 300;
const FIELD_CAP = 120_000;

interface FrontierItem {
  url: string;
  depth: number;
}

interface CrawlMeta {
  status: 'scraping' | 'completed' | 'failed' | 'cancelled';
  url: string;
  options: CrawlRequest;
  total: number;
  completed: number;
  creditsUsed: number;
  createdAt: string;
  completedAt?: string;
  limit: number;
  maxDepth: number;
}

interface CrawlError {
  id: string;
  timestamp: string;
  url: string;
  error: string;
}

export interface CrawlStatusResult {
  status: CrawlMeta['status'];
  total: number;
  completed: number;
  creditsUsed: number;
  createdAt: string;
  completedAt?: string;
  data: Document[];
  nextOffset: number | null;
}

function normalize(u: string, ignoreQuery: boolean): string {
  try {
    const url = new URL(u);
    return ignoreQuery ? url.origin + url.pathname : url.origin + url.pathname + url.search;
  } catch {
    return u;
  }
}

function inScope(u: string, base: URL, opts: CrawlRequest): boolean {
  try {
    const url = new URL(u);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (url.hostname === base.hostname) return true;
    if (opts.allowSubdomains) {
      const apex = base.hostname.replace(/^www\./, '');
      if (url.hostname === apex || url.hostname.endsWith(`.${apex}`)) return true;
    }
    if (opts.allowExternalLinks) return true;
    return false;
  } catch {
    return false;
  }
}

function pathAllowed(u: string, opts: CrawlRequest): boolean {
  try {
    const p = new URL(u).pathname;
    for (const re of opts.excludePaths ?? []) {
      try {
        if (new RegExp(re).test(p)) return false;
      } catch {
        /* bad pattern — ignore */
      }
    }
    if (opts.includePaths && opts.includePaths.length > 0) {
      return opts.includePaths.some((re) => {
        try {
          return new RegExp(re).test(p);
        } catch {
          return false;
        }
      });
    }
    return true;
  } catch {
    return true;
  }
}

function capField(s?: string): string | undefined {
  if (s === undefined) return undefined;
  return s.length > FIELD_CAP ? `${s.slice(0, FIELD_CAP)}\n\n…[truncated by fuegol crawl]` : s;
}
function capDoc(d: Document): Document {
  return { ...d, markdown: capField(d.markdown), html: capField(d.html), rawHtml: capField(d.rawHtml) };
}

export class CrawlCoordinator extends DurableObject<Env> {
  private eng() {
    return engineEnv(this.env);
  }

  /** Initialize the job, seed the frontier (sitemap + start URL), and kick off the alarm loop. */
  async start(body: CrawlRequest): Promise<{ ok: true }> {
    const base = assertSafeUrl(body.url);
    const limit = Math.min(body.limit ?? MAX_PAGES_CAP, MAX_PAGES_CAP);
    const ignoreQuery = body.ignoreQueryParameters ?? false;

    const meta: CrawlMeta = {
      status: 'scraping',
      url: base.toString(),
      options: body,
      total: 1,
      completed: 0,
      creditsUsed: 0,
      createdAt: new Date().toISOString(),
      limit,
      maxDepth: body.maxDiscoveryDepth ?? 1_000_000,
    };

    const seen = new Set<string>([normalize(base.toString(), ignoreQuery)]);
    const frontier: FrontierItem[] = [{ url: base.toString(), depth: 0 }];

    if (body.sitemap !== 'skip') {
      try {
        const links = await mapSite(
          { url: base.toString(), limit, sitemap: 'include', includeSubdomains: !!body.allowSubdomains },
          this.eng(),
        );
        for (const l of links) {
          if (frontier.length >= limit) break;
          const n = normalize(l.url, ignoreQuery);
          if (!seen.has(n) && inScope(l.url, base, body) && pathAllowed(l.url, body)) {
            seen.add(n);
            frontier.push({ url: l.url, depth: 1 });
          }
        }
      } catch {
        /* sitemap optional */
      }
    }

    let robotsTxt: string | null = null;
    try {
      robotsTxt = await fetchRobots(base, this.eng());
    } catch {
      robotsTxt = null;
    }

    meta.total = Math.min(limit, frontier.length);
    await this.ctx.storage.put('meta', meta);
    await this.ctx.storage.put('frontier', frontier);
    await this.ctx.storage.put('seen', [...seen]);
    await this.ctx.storage.put('errors', [] as CrawlError[]);
    await this.ctx.storage.put('robotsBlocked', [] as string[]);
    await this.ctx.storage.put('robotsTxt', robotsTxt);
    await this.ctx.storage.setAlarm(Date.now() + 10);
    return { ok: true };
  }

  /** Initialize a batch-scrape job: a crawl over a fixed frontier with no link discovery. */
  async startBatch(body: BatchScrapeRequest): Promise<{ invalidURLs: string[] }> {
    const urls = body.urls ?? [];
    const valid: string[] = [];
    const invalidURLs: string[] = [];
    for (const u of urls) {
      try {
        assertSafeUrl(u);
        valid.push(u);
      } catch {
        invalidURLs.push(u);
      }
    }
    const frontier: FrontierItem[] = valid.slice(0, MAX_PAGES_CAP).map((u) => ({ url: u, depth: 0 }));
    const options = {
      ...body,
      maxDiscoveryDepth: 0,
      scrapeOptions: {
        formats: body.formats,
        onlyMainContent: body.onlyMainContent,
        includeTags: body.includeTags,
        excludeTags: body.excludeTags,
      },
    } as unknown as CrawlRequest;
    const meta: CrawlMeta = {
      status: valid.length === 0 ? 'failed' : 'scraping',
      url: valid[0] ?? '',
      options,
      total: frontier.length,
      completed: 0,
      creditsUsed: 0,
      createdAt: new Date().toISOString(),
      limit: Math.min(Math.max(valid.length, 1), MAX_PAGES_CAP),
      maxDepth: 0,
    };
    if (valid.length === 0) meta.completedAt = new Date().toISOString();

    await this.ctx.storage.put('meta', meta);
    await this.ctx.storage.put('frontier', frontier);
    await this.ctx.storage.put(
      'seen',
      frontier.map((f) => f.url),
    );
    await this.ctx.storage.put('errors', [] as CrawlError[]);
    await this.ctx.storage.put('robotsBlocked', [] as string[]);
    await this.ctx.storage.put('robotsTxt', null);
    if (valid.length > 0) await this.ctx.storage.setAlarm(Date.now() + 10);
    return { invalidURLs };
  }

  override async alarm(): Promise<void> {
    const meta = (await this.ctx.storage.get<CrawlMeta>('meta')) ?? null;
    if (!meta || meta.status !== 'scraping') return;

    const frontier = (await this.ctx.storage.get<FrontierItem[]>('frontier')) ?? [];
    const seen = new Set<string>((await this.ctx.storage.get<string[]>('seen')) ?? []);
    const errors = (await this.ctx.storage.get<CrawlError[]>('errors')) ?? [];
    const robotsBlocked = (await this.ctx.storage.get<string[]>('robotsBlocked')) ?? [];
    const robotsTxt = (await this.ctx.storage.get<string | null>('robotsTxt')) ?? null;
    const base = new URL(meta.url);
    const opts = meta.options;
    const ignoreQuery = opts.ignoreQueryParameters ?? false;

    const batch = frontier.splice(0, BATCH);
    for (const item of batch) {
      if (meta.completed >= meta.limit) break;

      if (robotsTxt && !isAllowed(robotsTxt, new URL(item.url).pathname)) {
        robotsBlocked.push(item.url);
        continue;
      }

      try {
        const scrapeOpts = {
          url: item.url,
          formats: opts.scrapeOptions?.formats ?? ['markdown', 'links'],
          onlyMainContent: opts.scrapeOptions?.onlyMainContent ?? true,
          includeTags: opts.scrapeOptions?.includeTags,
          excludeTags: opts.scrapeOptions?.excludeTags,
        };
        const { document } = await scrape(scrapeOpts as never, this.eng());
        await this.ctx.storage.put(`page:${meta.completed}`, capDoc(document));
        meta.completed += 1;
        meta.creditsUsed += 1;

        if (item.depth < meta.maxDepth && meta.completed + frontier.length < meta.limit) {
          for (const link of document.links ?? []) {
            if (meta.completed + frontier.length >= meta.limit) break;
            const n = normalize(link, ignoreQuery);
            if (!seen.has(n) && inScope(link, base, opts) && pathAllowed(link, opts)) {
              seen.add(n);
              frontier.push({ url: link, depth: item.depth + 1 });
            }
          }
        }
      } catch (err) {
        errors.push({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          url: item.url,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Re-read meta before writing: cancel() may have run while we awaited scrapes
    // (DO I/O interleaves at await points). Don't resurrect a cancelled job.
    const latest = await this.ctx.storage.get<CrawlMeta>('meta');
    const cancelled = latest?.status === 'cancelled';
    meta.total = Math.min(meta.limit, meta.completed + frontier.length);
    const done = frontier.length === 0 || meta.completed >= meta.limit;
    if (cancelled) {
      meta.status = 'cancelled';
      meta.completedAt = latest?.completedAt ?? new Date().toISOString();
    } else if (done) {
      meta.status = 'completed';
      meta.completedAt = new Date().toISOString();
    }

    await this.ctx.storage.put('meta', meta);
    await this.ctx.storage.put('frontier', frontier);
    await this.ctx.storage.put('seen', [...seen]);
    await this.ctx.storage.put('errors', errors);
    await this.ctx.storage.put('robotsBlocked', robotsBlocked);

    if (!done && !cancelled) {
      const delay = opts.delay ? Math.min(opts.delay * 1000, 60_000) : DEFAULT_DELAY_MS;
      await this.ctx.storage.setAlarm(Date.now() + delay);
    }
  }

  async status(offset = 0, pageSize = 10): Promise<CrawlStatusResult | null> {
    const meta = (await this.ctx.storage.get<CrawlMeta>('meta')) ?? null;
    if (!meta) return null;
    const end = Math.min(offset + pageSize, meta.completed);
    const data: Document[] = [];
    for (let i = offset; i < end; i += 1) {
      const d = await this.ctx.storage.get<Document>(`page:${i}`);
      if (d) data.push(d);
    }
    return {
      status: meta.status,
      total: meta.total,
      completed: meta.completed,
      creditsUsed: meta.creditsUsed,
      createdAt: meta.createdAt,
      completedAt: meta.completedAt,
      data,
      nextOffset: end < meta.completed ? end : null,
    };
  }

  async cancel(): Promise<boolean> {
    const meta = (await this.ctx.storage.get<CrawlMeta>('meta')) ?? null;
    if (!meta) return false;
    if (meta.status === 'scraping') {
      meta.status = 'cancelled';
      meta.completedAt = new Date().toISOString();
      await this.ctx.storage.put('meta', meta);
      await this.ctx.storage.deleteAlarm();
    }
    return true;
  }

  async getErrors(): Promise<{ errors: CrawlError[]; robotsBlocked: string[] }> {
    return {
      errors: (await this.ctx.storage.get<CrawlError[]>('errors')) ?? [],
      robotsBlocked: (await this.ctx.storage.get<string[]>('robotsBlocked')) ?? [],
    };
  }
}
