/** AI Search — semantic search over indexed content. Vectorize (768-dim, cosine) stores
 *  Workers-AI embeddings of scraped chunks; per-API-key tenant isolation via Vectorize
 *  namespaces. Index → query → optional RAG answer. Needs the AI + VECTORIZE bindings. */
import type { Env } from '../env';

const EMBED_MODEL = '@cf/baai/bge-base-en-v1.5'; // 768-dim — matches the fuegol-rag index
const ANSWER_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const CHUNK_CHARS = 900;
const MAX_CHUNKS_PER_DOC = 50;

export function aiSearchAvailable(env: Env): boolean {
  return Boolean(env.AI && env.VECTORIZE);
}

async function sha256hex(input: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Paragraph-aware chunking to ~CHUNK_CHARS, hard-splitting oversized paragraphs. */
export function chunkText(text: string): string[] {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let cur = '';
  for (const p of paras) {
    if (cur && (cur.length + 2 + p.length) > CHUNK_CHARS) {
      chunks.push(cur);
      cur = p;
    } else {
      cur = cur ? `${cur}\n\n${p}` : p;
    }
    if (chunks.length >= MAX_CHUNKS_PER_DOC) break;
  }
  if (cur && chunks.length < MAX_CHUNKS_PER_DOC) chunks.push(cur);
  // Hard-split any chunk that's still too long (a single huge paragraph).
  const out: string[] = [];
  for (const c of chunks) {
    if (c.length <= CHUNK_CHARS * 1.5) out.push(c);
    else for (let i = 0; i < c.length; i += CHUNK_CHARS) out.push(c.slice(i, i + CHUNK_CHARS));
    if (out.length >= MAX_CHUNKS_PER_DOC) break;
  }
  return out.slice(0, MAX_CHUNKS_PER_DOC);
}

async function embed(env: Env, texts: string[]): Promise<number[][]> {
  const out = (await env.AI!.run(EMBED_MODEL, { text: texts })) as { data?: number[][] };
  return out.data ?? [];
}

export interface IndexDoc {
  url: string;
  title?: string;
  markdown: string;
}

/** Embed + upsert a document's chunks into the tenant's namespace. Returns chunks indexed. */
export async function indexDoc(env: Env, tenant: string, doc: IndexDoc): Promise<number> {
  const chunks = chunkText(doc.markdown);
  if (!chunks.length) return 0;
  const vectors = await embed(env, chunks);
  const items: Array<{ id: string; values: number[]; metadata: Record<string, string> }> = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const values = vectors[i];
    const chunk = chunks[i];
    if (!values || !chunk) continue;
    items.push({
      id: await sha256hex(`${tenant}|${doc.url}|${i}`),
      values,
      // Tenant isolation via a metadata-index filter (namespace on upsert didn't segment).
      metadata: { tenant, url: doc.url, title: doc.title ?? '', text: chunk.slice(0, 1000) },
    });
  }
  if (!items.length) return 0;
  // Cast: workers-types' VectorizeVector shape matches { id, values, namespace, metadata }.
  await env.VECTORIZE!.upsert(items as unknown as Parameters<VectorizeIndex['upsert']>[0]);
  return items.length;
}

export interface SearchMatch {
  url: string;
  title: string;
  text: string;
  score: number;
}

/** Embed the query + return the tenant's top-K most similar chunks. */
export async function queryContent(env: Env, tenant: string, query: string, topK: number): Promise<SearchMatch[]> {
  const [qv] = await embed(env, [query]);
  if (!qv) return [];
  // Tenant isolation via the `tenant` metadata index. NOTE: a newly-indexed vector is
  // searchable unfiltered within ~15s but filterable (tenant-scoped) only after ~60s — the
  // metadata index propagates separately. Clients indexing then immediately querying their
  // own tenant should allow ~1 min.
  const res = (await env.VECTORIZE!.query(qv, {
    topK,
    returnMetadata: 'all',
    filter: { tenant: { $eq: tenant } },
  } as unknown as Parameters<VectorizeIndex['query']>[1])) as {
    matches?: Array<{ score: number; metadata?: Record<string, unknown> }>;
  };
  return (res.matches ?? []).map((m) => ({
    url: String(m.metadata?.url ?? ''),
    title: String(m.metadata?.title ?? ''),
    text: String(m.metadata?.text ?? ''),
    score: m.score,
  }));
}

/** Synthesize a grounded answer from retrieved chunks (RAG). */
export async function ragAnswer(env: Env, query: string, chunks: SearchMatch[]): Promise<string> {
  const context = chunks.map((c, i) => `[${i + 1}] (${c.url})\n${c.text}`).join('\n\n');
  const out = (await env.AI!.run(ANSWER_MODEL, {
    messages: [
      {
        role: 'system',
        content:
          'Answer the question using ONLY the provided context. Cite sources as [n]. If the context does not contain the answer, say you do not have enough indexed information.',
      },
      { role: 'user', content: `Context:\n${context}\n\nQuestion: ${query}` },
    ],
    max_tokens: 600,
  })) as { response?: string };
  return out.response ?? '';
}
