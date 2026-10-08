import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './env';
import { listTools, TOOLS, toolError, type McpContent, type ToolProfile } from './tools';

/**
 * fuegol.ink remote MCP — stateless Streamable-HTTP (JSON-RPC 2.0 over POST).
 * Firecrawl-tool-compatible. Profiles: /v2/mcp (full), /v2/mcp-search (search-only),
 * /mcp (alias → full). Clean-room stateless handler (request/response tool flow); a
 * migration to Cloudflare's createMcpHandler is tracked once its wiring is verified.
 */

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'fuegol.ink', title: 'fuegol.ink — web data engine for AI', version: '0.1.0' };

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function result(id: JsonRpcRequest['id'], value: unknown) {
  return { jsonrpc: '2.0' as const, id: id ?? null, result: value };
}
function rpcError(id: JsonRpcRequest['id'], code: number, message: string) {
  return { jsonrpc: '2.0' as const, id: id ?? null, error: { code, message } };
}

async function handleOne(req: JsonRpcRequest, env: Env, profile: ToolProfile): Promise<object | null> {
  if (!req || req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
    return rpcError(req?.id ?? null, -32600, 'Invalid Request');
  }
  switch (req.method) {
    case 'initialize':
      return result(req.id, {
        protocolVersion:
          typeof req.params?.protocolVersion === 'string' ? req.params.protocolVersion : PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          'Firecrawl-compatible web-data tools. firecrawl_scrape + firecrawl_map are live; other tools return an explicit not-yet-implemented error (never fabricated data).',
      });
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null; // notifications: no response
    case 'ping':
      return result(req.id, {});
    case 'tools/list':
      return result(req.id, {
        tools: listTools(profile).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
    case 'tools/call': {
      const name = req.params?.name as string | undefined;
      const args = (req.params?.arguments as Record<string, unknown>) ?? {};
      const tool = TOOLS.find((t) => t.name === name && t.profiles.includes(profile));
      if (!tool) return rpcError(req.id, -32602, `Unknown tool: ${name ?? '(none)'}`);
      try {
        const content: McpContent = await tool.handler(args, env);
        return result(req.id, { content, isError: false });
      } catch (err) {
        const { text } = toolError(err);
        return result(req.id, { content: [{ type: 'text', text }], isError: true });
      }
    }
    default:
      return rpcError(req.id, -32601, `Method not found: ${req.method}`);
  }
}

async function handleMcp(body: unknown, env: Env, profile: ToolProfile): Promise<{ status: number; json?: unknown }> {
  const batch = Array.isArray(body) ? (body as JsonRpcRequest[]) : [body as JsonRpcRequest];
  const responses: object[] = [];
  for (const req of batch) {
    const res = await handleOne(req, env, profile);
    if (res !== null) responses.push(res);
  }
  if (responses.length === 0) return { status: 202 };
  return { status: 200, json: Array.isArray(body) ? responses : responses[0] };
}

const app = new Hono<{ Bindings: Env }>();
app.use('*', cors({ origin: '*', allowHeaders: ['content-type', 'authorization', 'mcp-protocol-version'], allowMethods: ['GET', 'POST', 'OPTIONS'] }));

const INFO = {
  service: 'fuegol.ink MCP',
  transport: 'Streamable HTTP (stateless JSON-RPC 2.0)',
  endpoints: {
    full: 'POST /v2/mcp',
    searchOnly: 'POST /v2/mcp-search',
    alias: 'POST /mcp',
  },
  liveTools: ['firecrawl_scrape', 'firecrawl_map'],
  note: 'Other Firecrawl tools are advertised for compatibility but return an explicit not-yet-implemented error until their increment ships.',
};

app.get('/', (c) => c.json(INFO));
app.get('/health', (c) => c.json({ status: 'ok', service: 'fuegol-mcp' }));

const mount = (path: string, profile: ToolProfile) => {
  app.get(path, (c) => c.json({ ...INFO, profile, hint: 'POST JSON-RPC 2.0 here (initialize, tools/list, tools/call).' }));
  app.post(path, async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(rpcError(null, -32700, 'Parse error'), 400);
    }
    const { status, json } = await handleMcp(body, c.env, profile);
    if (status === 202) return c.body(null, 202);
    return c.json(json as object, 200);
  });
};

mount('/v2/mcp', 'full');
mount('/mcp', 'full');
mount('/v2/mcp-search', 'search');

export default app;
