import { describe, it, expect } from 'vitest';
import { parseDocument } from '../src/parse';

const enc = (s: string): ArrayBuffer => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe('parseDocument', () => {
  it('parses HTML to markdown', async () => {
    const r = await parseDocument(
      enc('<html><body><main><h1>Hi</h1><p>Body text here.</p></main></body></html>'),
      'text/html',
      'https://e.com',
    );
    expect(r.markdown).toContain('# Hi');
    expect(r.markdown).toContain('Body text');
    expect(r.metadata.contentType).toBe('text/html');
  });

  it('passes plain text through', async () => {
    const r = await parseDocument(enc('just some text'), 'text/plain');
    expect(r.markdown).toBe('just some text');
  });

  it('detects HTML even with an empty content-type', async () => {
    const r = await parseDocument(enc('<!doctype html><html><body><p>Yo</p></body></html>'), '');
    expect(r.markdown).toContain('Yo');
  });

  it('throws an explicit error on unsupported types', async () => {
    await expect(
      parseDocument(enc('x'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    ).rejects.toThrow(/Unsupported/);
  });
});
