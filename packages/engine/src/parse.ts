import { extractText, getDocumentProxy } from 'unpdf';
import { parseHtml, selectContent } from './extract-content';
import { htmlToMarkdown } from './html-to-markdown';

/**
 * Document parsing → Markdown. PDF via unpdf (Workers-compatible serverless PDF.js),
 * HTML via the readability engine, plain text passthrough. DOCX/XLSX/PPTX are an
 * explicit unsupported-format error (no Workers-safe parser yet) — never a silent empty.
 */

export interface ParseResult {
  markdown: string;
  metadata: { contentType?: string; numPages?: number; title?: string };
  pages?: Array<{ pageNumber: number; markdown: string }>;
}

function looksLikePdf(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes.slice(0, 5));
  return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46; // %PDF
}

function looksLikeHtml(text: string): boolean {
  return /^\s*<(!doctype|html|head|body)/i.test(text);
}

export async function parseDocument(
  bytes: ArrayBuffer,
  contentType: string,
  baseUrl = '',
): Promise<ParseResult> {
  const ct = (contentType || '').toLowerCase();

  if (ct.includes('pdf') || looksLikePdf(bytes)) {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { totalPages, text } = (await extractText(pdf, { mergePages: false })) as {
      totalPages: number;
      text: string | string[];
    };
    const pageTexts = Array.isArray(text) ? text : [String(text)];
    const pages = pageTexts.map((t, i) => ({
      pageNumber: i + 1,
      markdown: (t ?? '').replace(/[ \t]+\n/g, '\n').trim(),
    }));
    const markdown = pages
      .map((p) => p.markdown)
      .filter(Boolean)
      .join('\n\n')
      .trim();
    return { markdown, metadata: { contentType: 'application/pdf', numPages: totalPages }, pages };
  }

  // Note: match XML narrowly — DOCX's mimetype contains the substring "xml"
  // (…openxmlformats…), which must NOT be treated as HTML.
  if (ct.includes('html') || ct === 'application/xml' || ct === 'text/xml' || ct.endsWith('+xml')) {
    const html = new TextDecoder().decode(bytes);
    const content = selectContent(parseHtml(html), { onlyMainContent: true });
    return { markdown: htmlToMarkdown(content, { baseUrl }), metadata: { contentType: 'text/html' } };
  }

  if (ct.includes('text') || ct.includes('markdown') || ct.includes('json') || ct === '') {
    const decoded = new TextDecoder().decode(bytes);
    if (looksLikeHtml(decoded)) {
      const content = selectContent(parseHtml(decoded), { onlyMainContent: true });
      return { markdown: htmlToMarkdown(content, { baseUrl }), metadata: { contentType: 'text/html' } };
    }
    return { markdown: decoded.trim(), metadata: { contentType: ct || 'text/plain' } };
  }

  throw new Error(
    `Unsupported document type "${ct}". Supported: PDF, HTML, text/markdown. DOCX/XLSX/PPTX parsing is a planned increment.`,
  );
}
