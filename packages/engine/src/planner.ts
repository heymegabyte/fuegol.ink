import type { ScrapeOptions } from '@fuegol/contracts';
import { browserAvailable } from './browser';
import type { EngineEnv } from './types';

export type Tier = 'cache' | 'http' | 'browser' | 'browser-actions' | 'ai';

export interface ScrapePlan {
  primary: 'http' | 'browser';
  /** Escalate http → browser if the static result is low-yield and a browser is available. */
  allowEscalation: boolean;
  reasons: string[];
}

/** Collect the set of requested format "type" strings (string + object forms). */
export function formatTypes(formats: ScrapeOptions['formats']): Set<string> {
  const out = new Set<string>();
  for (const f of formats ?? ['markdown']) {
    if (typeof f === 'string') out.add(f);
    else if (f && typeof f === 'object' && 'type' in f) out.add((f as { type: string }).type);
  }
  return out;
}

/**
 * The execution planner: pick the least-expensive adequate strategy. Static HTTP is
 * always cheapest (and free); the browser tier is reserved for pages that genuinely
 * need JS rendering, interaction, a screenshot, or an anti-bot proxy.
 */
export function planScrape(options: ScrapeOptions, env: EngineEnv): ScrapePlan {
  const formats = formatTypes(options.formats);
  const reasons: string[] = [];
  let needsBrowser = false;

  if (options.actions && options.actions.length > 0) {
    needsBrowser = true;
    reasons.push('actions');
  }
  if ((options.waitFor ?? 0) > 0) {
    needsBrowser = true;
    reasons.push('waitFor');
  }
  if (options.mobile) {
    needsBrowser = true;
    reasons.push('mobile-viewport');
  }
  if (options.proxy === 'stealth' || options.proxy === 'enhanced') {
    needsBrowser = true;
    reasons.push(`proxy:${options.proxy}`);
  }
  if (formats.has('screenshot')) {
    needsBrowser = true;
    reasons.push('screenshot');
  }

  const available = browserAvailable(env);
  if (needsBrowser && available) {
    return { primary: 'browser', allowEscalation: false, reasons };
  }
  return {
    primary: 'http',
    allowEscalation: available,
    reasons: reasons.length ? [...reasons, 'browser-unavailable→static'] : ['static-sufficient'],
  };
}
