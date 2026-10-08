import type { HTMLElement, Node } from 'node-html-parser';

/**
 * HTML → Markdown converter over a node-html-parser tree. Handles the 80% that
 * matters for readable output: headings, paragraphs, links, images, lists (nested),
 * code/pre, blockquotes, tables, emphasis, hr/br. Relative URLs resolve against baseUrl.
 */

export interface MarkdownContext {
  baseUrl: string;
}

const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'dd', 'dt',
  'figure', 'figcaption', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hr', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul', 'li',
]);

const NODE_ELEMENT = 1;
const NODE_TEXT = 3;

function isElement(node: Node): node is HTMLElement {
  return node.nodeType === NODE_ELEMENT;
}

function tagOf(el: HTMLElement): string {
  return (el.rawTagName ?? '').toLowerCase();
}

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

function resolveUrl(href: string | undefined, baseUrl: string): string {
  if (!href) return '';
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('javascript:') || trimmed.startsWith('#')) return '';
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return trimmed;
  }
}

function isBlockLevel(node: Node): boolean {
  return isElement(node) && BLOCK_TAGS.has(tagOf(node));
}

function renderInline(node: Node, ctx: MarkdownContext): string {
  if (node.nodeType === NODE_TEXT) {
    return decodeEntities((node as unknown as { rawText: string }).rawText).replace(/\s+/g, ' ');
  }
  if (!isElement(node)) return '';
  const el = node;
  const tag = tagOf(el);
  const inner = () => el.childNodes.map((c) => renderInline(c, ctx)).join('');

  switch (tag) {
    case 'a': {
      const href = resolveUrl(el.getAttribute('href'), ctx.baseUrl);
      const text = inner().trim();
      return href && text ? `[${text}](${href})` : text;
    }
    case 'img': {
      const src = resolveUrl(el.getAttribute('src'), ctx.baseUrl);
      const alt = (el.getAttribute('alt') ?? '').trim();
      return src ? `![${alt}](${src})` : '';
    }
    case 'strong':
    case 'b': {
      const t = inner();
      return t.trim() ? `**${t.trim()}**` : '';
    }
    case 'em':
    case 'i': {
      const t = inner();
      return t.trim() ? `*${t.trim()}*` : '';
    }
    case 'code':
      return `\`${decodeEntities(el.text).replace(/`/g, '')}\``;
    case 'br':
      return '  \n';
    case 'del':
    case 's':
      return `~~${inner().trim()}~~`;
    default:
      return inner();
  }
}

function detectLanguage(el: HTMLElement): string {
  const cls = el.getAttribute('class') ?? '';
  const match = cls.match(/(?:language|lang)-([a-z0-9+#]+)/i);
  return match ? match[1]! : '';
}

function renderList(el: HTMLElement, ordered: boolean, ctx: MarkdownContext, depth: number): string {
  const items = el.childNodes.filter((c) => isElement(c) && tagOf(c) === 'li') as HTMLElement[];
  const indent = '  '.repeat(depth);
  let index = 0;
  const lines: string[] = [];
  for (const li of items) {
    index += 1;
    const marker = ordered ? `${index}.` : '-';
    const nested: string[] = [];
    const inlineParts: string[] = [];
    for (const child of li.childNodes) {
      if (isElement(child) && (tagOf(child) === 'ul' || tagOf(child) === 'ol')) {
        nested.push(renderList(child, tagOf(child) === 'ol', ctx, depth + 1));
      } else if (isBlockLevel(child)) {
        inlineParts.push(renderBlock(child, ctx).replace(/\n+/g, ' '));
      } else {
        inlineParts.push(renderInline(child, ctx));
      }
    }
    const text = inlineParts.join('').replace(/\s+/g, ' ').trim();
    lines.push(`${indent}${marker} ${text}`.trimEnd());
    for (const n of nested) if (n.trim()) lines.push(n);
  }
  return lines.join('\n');
}

function renderTable(el: HTMLElement, ctx: MarkdownContext): string {
  const rows = el.querySelectorAll('tr');
  if (rows.length === 0) return '';
  const toCells = (tr: HTMLElement) =>
    tr
      .childNodes.filter((c) => isElement(c) && (tagOf(c) === 'td' || tagOf(c) === 'th'))
      .map((c) => renderInline(c, ctx).replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim());

  const header = toCells(rows[0]!);
  if (header.length === 0) return '';
  const lines = [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`];
  for (let i = 1; i < rows.length; i += 1) {
    const cells = toCells(rows[i]!);
    if (cells.length) lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

function renderChildren(el: HTMLElement, ctx: MarkdownContext): string {
  const blocks: string[] = [];
  let inlineBuffer: Node[] = [];
  const flush = () => {
    if (inlineBuffer.length === 0) return;
    const text = inlineBuffer
      .map((n) => renderInline(n, ctx))
      .join('')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .trim();
    if (text) blocks.push(text);
    inlineBuffer = [];
  };
  for (const child of el.childNodes) {
    if (isBlockLevel(child)) {
      flush();
      const block = renderBlock(child as HTMLElement, ctx);
      if (block.trim()) blocks.push(block.trim());
    } else {
      inlineBuffer.push(child);
    }
  }
  flush();
  return blocks.join('\n\n');
}

function renderBlock(node: Node, ctx: MarkdownContext): string {
  if (node.nodeType === NODE_TEXT) {
    return decodeEntities((node as unknown as { rawText: string }).rawText).replace(/\s+/g, ' ').trim();
  }
  if (!isElement(node)) return '';
  const el = node;
  const tag = tagOf(el);

  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag[1]);
    const text = el.childNodes.map((c) => renderInline(c, ctx)).join('').replace(/\s+/g, ' ').trim();
    return text ? `${'#'.repeat(level)} ${text}` : '';
  }

  switch (tag) {
    case 'p':
      return el.childNodes.map((c) => renderInline(c, ctx)).join('').replace(/[ \t]+/g, ' ').trim();
    case 'hr':
      return '---';
    case 'br':
      return '';
    case 'blockquote':
      return renderChildren(el, ctx)
        .split('\n')
        .map((l) => (l ? `> ${l}` : '>'))
        .join('\n');
    case 'pre': {
      // node-html-parser treats <pre> as a block-text element, so its inner <code>
      // may be unparsed raw text. Handle both the parsed and raw-string forms.
      const codeEl = el.querySelector('code');
      let lang = '';
      let raw = '';
      if (codeEl) {
        lang = detectLanguage(codeEl);
        raw = (codeEl as unknown as { rawText: string }).rawText ?? '';
      } else {
        raw = (el as unknown as { rawText: string }).rawText ?? '';
        const wrapped = raw.match(/^\s*<code([^>]*)>([\s\S]*?)<\/code>\s*$/i);
        if (wrapped) {
          const langMatch = (wrapped[1] ?? '').match(/(?:language|lang)-([a-z0-9+#]+)/i);
          if (langMatch) lang = langMatch[1]!;
          raw = wrapped[2] ?? '';
        }
      }
      if (!lang) lang = detectLanguage(el);
      const code = decodeEntities(raw).replace(/\n+$/, '');
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }
    case 'ul':
      return renderList(el, false, ctx, 0);
    case 'ol':
      return renderList(el, true, ctx, 0);
    case 'table':
      return renderTable(el, ctx);
    case 'img':
      return renderInline(el, ctx);
    case 'figure':
    case 'figcaption':
    case 'details':
    default:
      return renderChildren(el, ctx);
  }
}

/** Convert an HTML element subtree to Markdown. */
export function htmlToMarkdown(root: HTMLElement, ctx: MarkdownContext): string {
  return renderChildren(root, ctx)
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}
