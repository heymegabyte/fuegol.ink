import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { scrape, assertSafeUrl, SsrfError } from '@fuegol/engine';
import { engineEnv, type Env } from '../env';
import { fail, parseBody } from '../lib/respond';
import { requireAuth, type Vars } from '../lib/auth';
import { aiSearchAvailable, indexDoc, queryContent, ragAnswer } from '../lib/ai-search';

/**
 * AI Search — index your scraped content, then ask natural-language questions over it.
 * Per-API-key tenant isolation (Vectorize namespace = keyId); requires an authenticated key.
 */
const route = new Hono<{ Bindings: Env; Variables: Vars }>();
type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

function gate(c: Ctx): { denied?: Response; tenant?: string } {
  if (!aiSearchAvailable(c.env)) {
    return {
      denied: fail(
        c,
        501,
        'AI Search requires the Workers AI + Vectorize bindings (not configured on this deployment).',
        'UNKNOWN_ERROR',
      ),
    };
  }
  const p = c.get('principal');
  if (!p.authed) return { denied: requireAuth(c)! };
  if (!p.keyId)
    return {
      denied: fail(
        c,
        501,
        'AI Search requires a D1-backed fuegol.ink key (your index is per key).',
        'UNKNOWN_ERROR',
      ),
    };
  return { tenant: p.keyId };
}

// Index content: scrape url(s) and/or raw text → chunk → embed → upsert into your namespace.
route.post('/ai-search/index', async (c) => {
  const { denied, tenant } = gate(c);
  if (denied) return denied;
  const parsed = await parseBody(
    c,
    z
      .object({
        url: z.string().url().optional(),
        urls: z.array(z.string().url()).max(20).optional(),
        text: z.string().min(1).max(500_000).optional(),
        title: z.string().optional(),
      })
      .refine((b) => b.url || (b.urls && b.urls.length) || b.text, 'Provide url, urls, or text.'),
  );
  if (!parsed.ok) return parsed.response;

  const eng = engineEnv(c.env);
  const urls = parsed.data.urls ?? (parsed.data.url ? [parsed.data.url] : []);
  let indexed = 0;
  const documents: string[] = [];
  try {
    for (const u of urls) {
      assertSafeUrl(u);
      const { document } = await scrape({ url: u, formats: ['markdown'] } as never, eng);
      if (document.markdown) {
        indexed += await indexDoc(c.env, tenant!, {
          url: document.url ?? u,
          title: document.title,
          markdown: document.markdown,
        });
        documents.push(document.url ?? u);
      }
    }
    if (parsed.data.text) {
      const u = `text://${parsed.data.title ?? 'inline'}`;
      indexed += await indexDoc(c.env, tenant!, {
        url: u,
        title: parsed.data.title,
        markdown: parsed.data.text,
      });
      documents.push(u);
    }
    return c.json({ success: true as const, indexed, documents });
  } catch (e) {
    if (e instanceof SsrfError) return fail(c, 400, e.message, 'unsafe_domain_blocked');
    return fail(c, 500, e instanceof Error ? e.message : 'index failed', 'UNKNOWN_ERROR');
  }
});

// Query your indexed content: semantic retrieval + an optional grounded RAG answer.
route.post('/ai-search/query', async (c) => {
  const { denied, tenant } = gate(c);
  if (denied) return denied;
  const parsed = await parseBody(
    c,
    z.object({
      query: z.string().min(1),
      topK: z.number().int().positive().max(20).default(5),
      synthesize: z.boolean().default(true),
    }),
  );
  if (!parsed.ok) return parsed.response;
  try {
    const sources = await queryContent(c.env, tenant!, parsed.data.query, parsed.data.topK);
    const answer =
      parsed.data.synthesize && sources.length
        ? await ragAnswer(c.env, parsed.data.query, sources)
        : undefined;
    return c.json({ success: true as const, answer, sources });
  } catch (e) {
    return fail(c, 500, e instanceof Error ? e.message : 'query failed', 'UNKNOWN_ERROR');
  }
});

export default route;
