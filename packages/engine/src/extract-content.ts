import { parse, type HTMLElement } from 'node-html-parser';

/** Inert/dangerous elements always removed before extraction. */
const STRIP_ALWAYS = ['script', 'style', 'noscript', 'template', 'svg', 'canvas', 'iframe'];
/** Boilerplate removed only when onlyMainContent is on. */
const STRIP_BOILERPLATE = ['nav', 'footer', 'header', 'aside', 'form'];

export function parseHtml(html: string): HTMLElement {
  return parse(html, { comment: false });
}

function resolveUrl(href: string | undefined, baseUrl: string): string {
  if (!href) return '';
  const t = href.trim();
  if (!t || t.startsWith('javascript:') || t.startsWith('#') || t.startsWith('mailto:')) return '';
  try {
    return new URL(t, baseUrl).toString();
  } catch {
    return '';
  }
}

/** Collect every absolute http(s) link on the page (deduped), before boilerplate stripping. */
export function extractLinks(root: HTMLElement, baseUrl: string): string[] {
  const out = new Set<string>();
  for (const a of root.querySelectorAll('a')) {
    const resolved = resolveUrl(a.getAttribute('href'), baseUrl);
    if (resolved && /^https?:/i.test(resolved)) out.add(resolved);
  }
  return [...out];
}

function textLength(el: HTMLElement): number {
  return (el.text ?? '').replace(/\s+/g, ' ').trim().length;
}

function linkDensity(el: HTMLElement): number {
  const total = textLength(el);
  if (!total) return 1;
  const linkText = el.querySelectorAll('a').reduce((n, a) => n + textLength(a), 0);
  return linkText / total;
}

function scoreCandidate(el: HTMLElement): number {
  const paragraphs = el.querySelectorAll('p').length;
  return textLength(el) * (1 - linkDensity(el)) + paragraphs * 30;
}

export interface SelectOptions {
  onlyMainContent?: boolean;
  includeTags?: string[];
  excludeTags?: string[];
}

/**
 * Choose the content subtree to convert. Mutates `root` (removes inert + boilerplate),
 * so call extractLinks/extractMetadata on `root` BEFORE this. Readability-lite: prefer
 * <main>/<article>, else the highest text-density container.
 */
export function selectContent(root: HTMLElement, opts: SelectOptions): HTMLElement {
  for (const sel of STRIP_ALWAYS) for (const el of root.querySelectorAll(sel)) el.remove();
  const body = root.querySelector('body') ?? root;

  if (opts.excludeTags?.length) {
    for (const sel of opts.excludeTags) {
      try {
        for (const el of body.querySelectorAll(sel)) el.remove();
      } catch {
        /* invalid selector — ignore */
      }
    }
  }

  if (opts.includeTags?.length) {
    const container = parse('<div id="fuegol-root"></div>').querySelector('#fuegol-root')!;
    for (const sel of opts.includeTags) {
      try {
        for (const el of body.querySelectorAll(sel)) container.appendChild(el);
      } catch {
        /* ignore */
      }
    }
    if (textLength(container) > 0) return container;
  }

  if (opts.onlyMainContent === false) return body;

  for (const sel of STRIP_BOILERPLATE) for (const el of body.querySelectorAll(sel)) el.remove();

  const semantic = body.querySelector('main') ?? body.querySelector('article');
  if (semantic && textLength(semantic) > 200) return semantic;

  let best = body;
  let bestScore = scoreCandidate(body);
  for (const el of body.querySelectorAll('article, main, section, div')) {
    const s = scoreCandidate(el);
    if (s > bestScore) {
      bestScore = s;
      best = el;
    }
  }
  return best;
}
