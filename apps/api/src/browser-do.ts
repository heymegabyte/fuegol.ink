import { DurableObject } from 'cloudflare:workers';
import puppeteer from '@cloudflare/puppeteer';
import type { BrowserWorker } from '@cloudflare/puppeteer';
import type { Action, Document } from '@fuegol/contracts';
import { applyActions, captureDocument, assertSafeUrl, ActionError } from '@fuegol/engine';
import { engineEnv, type Env } from './env';

/**
 * BrowserSession — one Durable Object per persistent interactive browser session.
 *
 * The browser itself runs in Cloudflare Browser Run and is kept alive with `keep_alive`.
 * We do NOT hold the CDP socket across HTTP requests (it is request-scoped); instead we
 * store the Browser Run `sessionId` and reconnect per call, reattaching to the live tab
 * via `browser.pages()`. The tab's URL / cookies / form state therefore persist across
 * separate `act` requests — true stateful interaction — while each request is self-contained.
 * The DO's single-threaded nature serializes concurrent `act` calls on one session.
 */

const KEEP_ALIVE_MS = 600_000; // Browser Run keeps the browser alive this long (max 20 min).
const IDLE_TTL_MS = 600_000; // Auto-close the session after this much inactivity.

interface SessionMeta {
  cfSessionId: string;
  ownerKeyId: string | null;
  createdAt: string;
  lastUrl: string;
  title: string;
  initialUrl: string;
  actCount: number;
}

export interface SessionState {
  status: 'live' | 'expired' | 'closed' | 'none' | 'forbidden' | 'error' | 'action_error';
  id?: string;
  url?: string;
  title?: string;
  createdAt?: string;
  actCount?: number;
  actions?: Document['actions'];
  document?: Document;
  error?: string;
  code?: string;
}

function browserWorker(env: Env): BrowserWorker {
  return env.BROWSER as unknown as BrowserWorker;
}

export class BrowserSession extends DurableObject<Env> {
  /** Launch a browser, open + navigate a tab, and persist the session handle. */
  async create(input: { url: string; ownerKeyId: string | null }): Promise<SessionState> {
    const target = assertSafeUrl(input.url).toString();
    const browser = await puppeteer.launch(browserWorker(this.env), { keep_alive: KEEP_ALIVE_MS });
    try {
      const cfSessionId = browser.sessionId();
      const page = await browser.newPage();
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const meta: SessionMeta = {
        cfSessionId,
        ownerKeyId: input.ownerKeyId,
        createdAt: new Date().toISOString(),
        lastUrl: page.url(),
        title: await page.title(),
        initialUrl: target,
        actCount: 0,
      };
      await this.ctx.storage.put('meta', meta);
      await this.ctx.storage.setAlarm(Date.now() + IDLE_TTL_MS);
      return { status: 'live', url: meta.lastUrl, title: meta.title, createdAt: meta.createdAt, actCount: 0 };
    } finally {
      await browser.disconnect(); // keep the browser + tab alive for subsequent act() calls
    }
  }

  /** Reconnect to the live tab, run an action sequence, and capture the post-action page. */
  async act(input: {
    actions: Action[];
    ownerKeyId: string | null;
    formats?: string[];
  }): Promise<SessionState> {
    const meta = await this.ctx.storage.get<SessionMeta>('meta');
    if (!meta) return { status: 'none', error: 'No such session (never created or already closed).' };
    if (meta.ownerKeyId && input.ownerKeyId !== meta.ownerKeyId) {
      return { status: 'forbidden', error: 'This session belongs to another API key.' };
    }

    let browser;
    try {
      browser = await puppeteer.connect(browserWorker(this.env), meta.cfSessionId);
    } catch {
      await this.ctx.storage.deleteAll();
      return { status: 'expired', error: 'Session expired (browser keep-alive elapsed). Create a new session.' };
    }

    try {
      const pages = await browser.pages();
      const page = pages[0] ?? (await browser.newPage());
      const engine = engineEnv(this.env);
      const out = await applyActions(page, input.actions ?? [], engine);
      const formats = new Set(input.formats ?? ['markdown']);
      const document = await captureDocument(page, { onlyMainContent: true }, formats, engine, 200);
      const hasArtifacts =
        out.screenshots.length || out.scrapes.length || out.javascriptReturns.length || out.pdfs.length;
      if (hasArtifacts) {
        document.actions = {
          screenshots: out.screenshots.length ? out.screenshots : undefined,
          scrapes: out.scrapes.length ? out.scrapes : undefined,
          javascriptReturns: out.javascriptReturns.length ? out.javascriptReturns : undefined,
          pdfs: out.pdfs.length ? out.pdfs : undefined,
        };
      }
      meta.lastUrl = page.url();
      meta.title = document.title ?? meta.title;
      meta.actCount += 1;
      await this.ctx.storage.put('meta', meta);
      await this.ctx.storage.setAlarm(Date.now() + IDLE_TTL_MS);
      return {
        status: 'live',
        url: meta.lastUrl,
        title: meta.title,
        actCount: meta.actCount,
        actions: document.actions,
        document,
      };
    } catch (e) {
      if (e instanceof ActionError) return { status: 'action_error', error: e.message, code: 'SCRAPE_ACTION_ERROR' };
      return { status: 'error', error: e instanceof Error ? e.message : 'act failed' };
    } finally {
      await browser.disconnect();
    }
  }

  /** Report current session state without driving the browser. */
  async info(ownerKeyId: string | null): Promise<SessionState> {
    const meta = await this.ctx.storage.get<SessionMeta>('meta');
    if (!meta) return { status: 'none' };
    if (meta.ownerKeyId && ownerKeyId !== meta.ownerKeyId) return { status: 'forbidden' };
    return {
      status: 'live',
      url: meta.lastUrl,
      title: meta.title,
      createdAt: meta.createdAt,
      actCount: meta.actCount,
    };
  }

  /** Terminate the browser + clear state. */
  async close(ownerKeyId: string | null): Promise<SessionState> {
    const meta = await this.ctx.storage.get<SessionMeta>('meta');
    if (!meta) return { status: 'none' };
    if (meta.ownerKeyId && ownerKeyId !== meta.ownerKeyId) return { status: 'forbidden' };
    try {
      const browser = await puppeteer.connect(browserWorker(this.env), meta.cfSessionId);
      await browser.close();
    } catch {
      /* already gone — nothing to terminate */
    }
    await this.ctx.storage.deleteAll();
    return { status: 'closed' };
  }

  /** Idle TTL reached → terminate the browser + clear state. */
  override async alarm(): Promise<void> {
    const meta = await this.ctx.storage.get<SessionMeta>('meta');
    if (meta) {
      try {
        const browser = await puppeteer.connect(browserWorker(this.env), meta.cfSessionId);
        await browser.close();
      } catch {
        /* already gone */
      }
    }
    await this.ctx.storage.deleteAll();
  }
}
