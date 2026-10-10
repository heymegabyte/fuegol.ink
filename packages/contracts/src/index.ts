/**
 * @fuegol/contracts — the single source of truth for every API, MCP, SDK, and
 * dashboard boundary. Firecrawl-v2 compatible request/response shapes expressed
 * as Zod schemas; infer TypeScript types from these, never hand-duplicate them.
 */
export * from './common';
export * from './actions';
export * from './webhook';
export * from './scrape';
export * from './map';
export * from './crawl';
export * from './batch';
export * from './search';
export * from './extract';
export * from './account';
export * from './pricing';

/** The upstream Firecrawl revision these contracts are pinned to (see docs/firecrawl-compatibility.md). */
export const FIRECRAWL_COMPAT = {
  apiVersion: 'v2',
  apiRepoSha: 'f9f2e3dd5406da68b8b92667772802a6cd7927d9',
  mcpRepoSha: 'ec0f9de0a3f2bc9c1359868858cecac98ce39f06',
  mcpPackageVersion: '3.28.2',
  mcpToolsRegistered: 30,
  mcpToolsListed: 28,
  /** Updated by the schema-drift detector; see docs/firecrawl-compatibility.md. */
  pinnedAt: '2026-10-07',
} as const;
