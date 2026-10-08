import { tryFetchText } from './fetcher';
import type { EngineEnv } from './types';

/**
 * Best-effort robots.txt policy. Fetches /robots.txt and applies the matching
 * user-agent group with longest-prefix Allow/Disallow precedence. We respect robots
 * by default; this is a courtesy + compliance control, not a security boundary.
 */
export async function fetchRobots(base: URL, env: EngineEnv): Promise<string | null> {
  return tryFetchText(new URL('/robots.txt', base), { userAgent: env.USER_AGENT });
}

interface Rule {
  allow: boolean;
  path: string;
}
interface Group {
  agents: string[];
  rules: Rule[];
}

function parseGroups(robotsTxt: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let expectingAgent = false;

  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i);
    if (!m) continue;
    const field = m[1]!.toLowerCase();
    const value = m[2]!.trim();

    if (field === 'user-agent') {
      if (!expectingAgent || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
        expectingAgent = true;
      }
      current.agents.push(value.toLowerCase());
    } else if (current) {
      expectingAgent = false;
      current.rules.push({ allow: field === 'allow', path: value });
    }
  }
  return groups;
}

export function isAllowed(robotsTxt: string | null, pathname: string, ua = 'fuegolbot'): boolean {
  if (!robotsTxt) return true;
  const groups = parseGroups(robotsTxt);
  if (groups.length === 0) return true;

  const uaLower = ua.toLowerCase();
  const specific = groups.find((g) => g.agents.some((a) => a !== '*' && uaLower.includes(a)));
  const group = specific ?? groups.find((g) => g.agents.includes('*'));
  if (!group) return true;

  let decision = true;
  let longest = -1;
  for (const rule of group.rules) {
    if (rule.path === '') continue;
    const prefix = rule.path.replace(/\*.*$/, '');
    if (pathname.startsWith(prefix) && prefix.length > longest) {
      longest = prefix.length;
      decision = rule.allow;
    }
  }
  return decision;
}
