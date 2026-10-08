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

  const title =
    get(['og:title', 'twitter:title']) ??
    (decode(root.querySelector('title')?.text ?? '') || undefined);
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

  const md: Record<string, string | number | string[] | null> = {
    statusCode: info.statusCode,
    sourceURL: info.url,
    url: info.url,
  };
  const put = (key: string, value: string | undefined): void => {
    if (value) md[key] = value;
  };

  put('title', title);
  put('description', get(['description', 'og:description', 'twitter:description']));
  put('language', lang ?? get(['og:locale']));
  put('keywords', get(['keywords']));
  put('robots', get(['robots']));
  put('ogTitle', get(['og:title']));
  put('ogDescription', get(['og:description']));
  put('ogUrl', get(['og:url']));
  put('ogImage', get(['og:image']));
  put('ogSiteName', get(['og:site_name']));
  put('ogLocale', get(['og:locale']));
  put('favicon', favicon);
  put('publishedTime', get(['article:published_time']));
  put('modifiedTime', get(['article:modified_time']));
  put('articleSection', get(['article:section']));
  if (info.contentType) md.contentType = info.contentType;

  return md as DocumentMetadata;
}
