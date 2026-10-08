import type { HTMLElement } from 'node-html-parser';
import type { DocumentMetadata } from '@fuegol/contracts';

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim();
}

export interface MetadataInput {
  url: string;
  statusCode: number;
  contentType?: string;
}

/** Extract document metadata from <head> + the HTTP response. Reads <title>, meta
 *  name/property/itemprop tags, <html lang>, and the favicon link. */
export function extractMetadata(root: HTMLElement, info: MetadataInput): DocumentMetadata {
  const metas = root.querySelectorAll('meta');
  const get = (keys: string[]): string | undefined => {
    for (const m of metas) {
      const key = (
        m.getAttribute('property') ??
        m.getAttribute('name') ??
        m.getAttribute('itemprop') ??
        ''
      ).toLowerCase();
      if (keys.includes(key)) {
        const content = m.getAttribute('content');
        if (content) return decode(content);
      }
    }
    return undefined;
  };

  const title = get(['og:title', 'twitter:title']) ?? decode(root.querySelector('title')?.text ?? '') || undefined;
  const lang = root.querySelector('html')?.getAttribute('lang') ?? undefined;
  const faviconHref =
    root.querySelector('link[rel="icon"]')?.getAttribute('href') ??
    root.querySelector('link[rel="shortcut icon"]')?.getAttribute('href') ??
    undefined;
  let favicon: string | undefined;
  if (faviconHref) {
    try {
      favicon = new URL(faviconHref, info.url).toString();
    } catch {
      favicon = undefined;
    }
  }

  const md: DocumentMetadata = {
    statusCode: info.statusCode,
    sourceURL: info.url,
    url: info.url,
    title,
    description: get(['description', 'og:description', 'twitter:description']),
    language: lang ?? get(['og:locale']),
    keywords: get(['keywords']),
    robots: get(['robots']),
    ogTitle: get(['og:title']),
    ogDescription: get(['og:description']),
    ogUrl: get(['og:url']),
    ogImage: get(['og:image']),
    ogSiteName: get(['og:site_name']),
    ogLocale: get(['og:locale']),
    favicon,
    publishedTime: get(['article:published_time']),
    modifiedTime: get(['article:modified_time']),
    articleSection: get(['article:section']),
    ...(info.contentType ? { contentType: info.contentType } : {}),
  };

  for (const key of Object.keys(md) as (keyof DocumentMetadata)[]) {
    if (md[key] === undefined) delete md[key];
  }
  return md;
}
