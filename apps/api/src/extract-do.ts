import { DurableObject } from 'cloudflare:workers';
import type { ExtractRequest } from '@fuegol/contracts';
import { scrape, assertSafeUrl, extractWithAI, extractAvailable, webSearch, searchAvailable } from '@fuegol/engine';
import { engineEnv, type Env } from './env';

interface ExtractMeta {
  status: 'processing' | 'completed' | 'failed';
  body: ExtractRequest;
  createdAt: string;
  completedAt?: string;
  data?: unknown;
  sources?: Record<string, string[]>;
  error?: string;
  invalidURLs: string[];
}

export interface ExtractStatusResult {
  status: ExtractMeta['status'];
  data?: unknown;
  sources?: Record<string, string[]>;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

const MAX_URLS = 10;
const MAX_COMBINED = 40_000;

/**
 * ExtractCoordinator — async structured extraction. Scrapes up to 10 URLs (static tier),
 * concatenates their markdown, and runs a single Workers-AI extraction against the
 * prompt/schema into one consolidated JSON result. One DO per extract job.
 */
export class ExtractCoordinator extends DurableObject<Env> {
  async start(body: ExtractRequest): Promise<{ invalidURLs: string[] }> {
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
    const meta: ExtractMeta = {
      status: 'processing',
      body: { ...body, urls: valid } as ExtractRequest,
      createdAt: new Date().toISOString(),
      invalidURLs,
    };
    await this.ctx.storage.put('meta', meta);
    await this.ctx.storage.setAlarm(Date.now() + 10);
    return { invalidURLs };
  }

  override async alarm(): Promise<void> {
    const meta = (await this.ctx.storage.get<ExtractMeta>('meta')) ?? null;
    if (!meta || meta.status !== 'processing') return;
    const eng = engineEnv(this.env);

    try {
      if (!extractAvailable(eng)) {
        throw new Error('Workers AI (AI binding) is not configured on this deployment.');
      }
      let urls = (meta.body.urls ?? []).slice(0, MAX_URLS);
      if (urls.length === 0) {
        // Agent / web-search mode: discover sources from the prompt.
        if (meta.body.enableWebSearch && searchAvailable(eng) && meta.body.prompt) {
          const { web } = await webSearch(meta.body.prompt, { limit: 5 }, eng);
          urls = web.map((r) => r.url).slice(0, MAX_URLS);
        }
        if (urls.length === 0) {
          throw new Error('Provide urls, or set enableWebSearch with a search provider configured.');
        }
      }
      const parts: string[] = [];
      const sources: Record<string, string[]> = {};
      for (const u of urls) {
        try {
          const { document } = await scrape({ url: u, formats: ['markdown'] } as never, eng);
          parts.push(`# Source: ${u}\n\n${document.markdown ?? ''}`);
          sources[u] = [u];
        } catch (e) {
          parts.push(`# Source: ${u}\n\n[scrape failed: ${e instanceof Error ? e.message : 'error'}]`);
        }
      }
      const combined = parts.join('\n\n---\n\n').slice(0, MAX_COMBINED);
      const data = await extractWithAI(
        combined,
        {
          prompt: meta.body.prompt,
          schema: meta.body.schema as Record<string, unknown> | undefined,
          systemPrompt: meta.body.systemPrompt,
        },
        eng,
      );
      meta.data = data;
      meta.status = 'completed';
      meta.completedAt = new Date().toISOString();
      if (meta.body.showSources) meta.sources = sources;
    } catch (e) {
      meta.status = 'failed';
      meta.error = e instanceof Error ? e.message : String(e);
      meta.completedAt = new Date().toISOString();
    }
    await this.ctx.storage.put('meta', meta);
  }

  async status(): Promise<ExtractStatusResult | null> {
    const meta = (await this.ctx.storage.get<ExtractMeta>('meta')) ?? null;
    if (!meta) return null;
    return {
      status: meta.status,
      data: meta.data,
      sources: meta.sources,
      error: meta.error,
      createdAt: meta.createdAt,
      completedAt: meta.completedAt,
    };
  }
}
