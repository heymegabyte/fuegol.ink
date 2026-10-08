import { describe, it, expect } from 'vitest';
import { parseHtml, selectContent, extractLinks } from '../src/extract-content';
import { htmlToMarkdown } from '../src/html-to-markdown';

describe('htmlToMarkdown', () => {
  it('converts headings, links, lists, code, emphasis', () => {
    const html = `<html><body>
      <nav><a href="/skip">nav</a></nav>
      <main>
        <h1>Title</h1>
        <p>Hello <strong>bold</strong> <a href="/x">world</a>.</p>
        <ul><li>alpha</li><li>beta</li></ul>
        <pre><code class="language-ts">const a = 1;</code></pre>
      </main>
    </body></html>`;
    const root = parseHtml(html);
    const content = selectContent(root, { onlyMainContent: true });
    const md = htmlToMarkdown(content, { baseUrl: 'https://e.com' });
    expect(md).toContain('# Title');
    expect(md).toContain('**bold**');
    expect(md).toContain('[world](https://e.com/x)');
    expect(md).toContain('- alpha');
    expect(md).toContain('```ts');
    // nav was stripped by onlyMainContent
    expect(md).not.toContain('nav');
  });

  it('builds a markdown table', () => {
    const html = `<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>`;
    const md = htmlToMarkdown(parseHtml(html), { baseUrl: 'https://e.com' });
    expect(md).toContain('| A | B |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| 1 | 2 |');
  });

  it('resolves + dedupes absolute links', () => {
    const html = `<a href="/a">a</a><a href="https://other.com/b">b</a><a href="/a">dup</a><a href="#frag">frag</a>`;
    const links = extractLinks(parseHtml(html), 'https://e.com/base');
    expect(links).toContain('https://e.com/a');
    expect(links).toContain('https://other.com/b');
    expect(links.filter((l) => l === 'https://e.com/a')).toHaveLength(1);
    expect(links.some((l) => l.includes('#frag'))).toBe(false);
  });
});
