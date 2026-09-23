import fs from 'node:fs';
import path from 'node:path';
import type { RecordingV2 } from '../shared/schema';
import { safeUrl } from '../shared/url';

/**
 * Recording a page without a person at the keyboard: open it, wait for the engine the Vite plugin puts there,
 * record, and hand back the id the session was saved under. It exists so that proving a fix — the same scenario
 * before and after — costs two calls instead of a hand-written browser driver.
 */
export interface RecordPageOptions {
  url: string;
  /** How long to record once the page is ready; ignored when a script says when to stop. */
  ms?: number;
  label?: string;
  /** An area: a component's name, the path down to it, or an element — `'MessageList'`, `{ names: [...] }`, `{ selector }`. */
  scope?: string | unknown;
  watch?: string[];
  /** A module whose default export gets the Playwright page; it runs while the recording is on. */
  script?: string;
  /** Record from the first commit of the page load, rather than from a page that has settled. */
  fromLoad?: boolean;
  viewport?: string;
  /** CPU slowdown through CDP, the way a profiler does it: 4 means four times slower. */
  throttle?: number;
  /** Cookies and storage saved by `login`, so a page behind a sign-in records as the signed-in person. */
  state?: string;
  /** Record in a browser that is already running with `--remote-debugging-port`, as the person who owns it. */
  cdp?: string;
  /** A url to open first: a debug or magic link that signs the browser in, before going to the page to measure. */
  via?: string;
  headed?: boolean;
  timeoutMs?: number;
}

export interface RecordPageResult {
  id: string | null;
  /** Where the page ended up: a sign-in wall shows itself as a url that is not the one asked for. */
  url: string;
  requested: string;
  durationSec: number;
  commits: number;
  renders: number;
  rendersWithoutDom: number;
  topRoot: string | null;
  warnings: string[];
}

/** The default place `login` keeps a session: beside the recordings, in a folder git already ignores. */
export const defaultStatePath = (dir: string) => path.join(dir, 'auth.json');

type Playwright = typeof import('playwright');

/**
 * Playwright is the project's, never ours: a recorder must not drag a browser into every install. It is resolved
 * from wherever the command runs, and its absence is an answer, not a crash.
 */
async function loadPlaywright(): Promise<Playwright> {
  for (const name of ['playwright', 'playwright-core']) {
    try {
      return (await import(/* @vite-ignore */ name)) as Playwright;
    } catch {
      // The next one, then the message below.
    }
  }
  throw new Error(
    'playwright is not installed in this project (npm i -D playwright), so there is no browser to record with. ' +
      'Record from the panel instead, or ask for the scenario to be recorded by hand.'
  );
}

const sizeOf = (viewport: string | undefined) => {
  const match = /^(\d+)\s*[x×]\s*(\d+)$/.exec(viewport ?? '');
  return match ? { width: Number(match[1]), height: Number(match[2]) } : undefined;
};

/** `?rpr=rec` makes the page record itself from the first commit, before anything of the app has rendered. */
const withLoadFlag = (url: string) => {
  const parsed = new URL(url);
  parsed.searchParams.set('rpr', 'rec');
  return parsed.toString();
};

const samePage = (a: string, b: string) => {
  try {
    const one = new URL(a);
    const two = new URL(b);
    return one.origin === two.origin && one.pathname === two.pathname;
  } catch {
    return a === b;
  }
};

interface PageLike {
  url(): string;
  goto(url: string, options?: unknown): Promise<unknown>;
  waitForSelector(selector: string, options?: unknown): Promise<unknown>;
  waitForFunction(fn: string, arg?: unknown, options?: unknown): Promise<unknown>;
  evaluate<T>(fn: string | ((arg: never) => T), arg?: unknown): Promise<T>;
  waitForTimeout(ms: number): Promise<void>;
  setDefaultTimeout(ms: number): void;
  close(): Promise<void>;
}

const ENGINE = 'window.__REACT_PERF_RECORDER__';

/**
 * Opens the page in its own browser (or in one already running, over CDP), records, and returns what the session
 * says about itself. The browser it launched is always closed; a browser it only connected to never is.
 */
export async function recordPage(options: RecordPageOptions, sessionsDir: string): Promise<RecordPageResult> {
  const { chromium } = await loadPlaywright();
  const ms = Math.max(200, options.ms ?? 3000);
  const timeout = options.timeoutMs ?? 30_000;
  const warnings: string[] = [];
  const state = options.state ?? defaultStatePath(sessionsDir);
  const hasState = fs.existsSync(state);
  if (options.state && !hasState) throw new Error(`no saved session at ${state}; make one with: react-perf-recorder login <url> --state ${state}`);

  const connected = Boolean(options.cdp);
  const browser = connected ? await chromium.connectOverCDP(options.cdp!) : await chromium.launch({ headless: !options.headed });
  // A browser of the person's own already carries their session; a fresh one gets whatever `login` saved.
  const context = connected
    ? browser.contexts()[0] ?? (await browser.newContext())
    : await browser.newContext({ ...(hasState ? { storageState: state } : {}), ...(sizeOf(options.viewport) ? { viewport: sizeOf(options.viewport) } : {}) });
  const page = (await context.newPage()) as unknown as PageLike;
  page.setDefaultTimeout(timeout);

  try {
    if (options.throttle && options.throttle > 1) {
      const session = await context.newCDPSession(page as never);
      await session.send('Emulation.setCPUThrottlingRate', { rate: options.throttle });
    }
    // A link that signs the browser in — `/debug/<jwt>`, a magic link — is opened first and is never recorded.
    if (options.via) await page.goto(options.via, { waitUntil: 'load' });
    const requested = options.fromLoad ? withLoadFlag(options.url) : options.url;
    await page.goto(requested, { waitUntil: 'load' });
    try {
      // The client script is injected at the top of <head>, so by `load` it has either booted or never will:
      // a few seconds of grace, not the navigation's whole budget. A page with no recorder should say so at once.
      await page.waitForFunction(`Boolean(${ENGINE}?.engine)`, undefined, { timeout: Math.min(timeout, 5000) });
    } catch {
      // Two very different failures look the same from here, so the message names both.
      const landed = page.url();
      throw new Error(
        samePage(options.url, landed)
          ? `the recorder is not on ${landed}: the Vite plugin is not in this dev server, or the page is a production build`
          : `${safeUrl(options.url)} went to ${safeUrl(landed)} — it is behind a sign-in. Open it through a link that signs in ` +
            '(`via`), with a session saved once by `react-perf-recorder login <url>`, or with `cdp` against a browser you are ' +
            'already signed in to — or ask the person to record it from the panel.'
      );
    }
    if (!samePage(options.url, page.url())) warnings.push(`asked for ${safeUrl(options.url)}, recorded ${safeUrl(page.url())}`);

    // A name is the form an agent has at hand: it read the component's file, so it knows what the component is called.
    const scope = typeof options.scope === 'string' ? { names: [options.scope] } : options.scope;
    const start = {
      source: 'script:record',
      ...(options.label ? { label: options.label } : {}),
      ...(scope ? { scope } : {}),
      ...(options.watch?.length ? { watch: options.watch } : {}),
      highlight: false,
    };
    // A page-load recording is already running by the time the engine exists; anything else starts here.
    if (!options.fromLoad) {
      try {
        await page.evaluate(`${ENGINE}.engine.start(${JSON.stringify(start)})`);
      } catch (error) {
        const message = String((error as Error)?.message ?? error);
        // An area that is not on the page is a dead end unless the answer says what is: the names it could have meant.
        if (!/is not mounted|no element matches|does not own/.test(message)) throw error;
        const names = await page.evaluate<string[]>(`${ENGINE}.engine.componentNames()`).catch(() => []);
        // The page's own stack is of no use to whoever asked for the wrong area; the names that are there is.
        const first = message.split('\n')[0].replace(/^.*?Error: /, '');
        throw new Error(`${first}${names.length ? `; the page has ${names.slice(0, 20).join(', ')}` : ''}`);
      }
    }
    if (options.script) {
      const module = (await import(/* @vite-ignore */ path.isAbsolute(options.script) ? options.script : path.resolve(options.script))) as {
        default?: (page: unknown) => Promise<void> | void;
      };
      if (typeof module.default !== 'function') throw new Error(`${options.script} must export default async (page) => { … }`);
      await module.default(page);
    } else {
      await page.waitForTimeout(ms);
    }
    const saved = await page.evaluate<{ id: string | null; recording: RecordingV2 }>(
      `${ENGINE}.engine.stop().then((r) => ({ id: r.id ?? null, recording: r }))`
    );
    const rec = saved.recording;
    return {
      id: saved.id,
      url: safeUrl(page.url()),
      requested: safeUrl(options.url),
      durationSec: +(rec.durationMs / 1000).toFixed(1),
      commits: rec.totals.commitsInScope,
      renders: rec.totals.renders,
      rendersWithoutDom: rec.totals.rendersWithoutDom,
      topRoot: rec.roots[0] ? `${rec.roots[0].name} ×${rec.roots[0].hits}` : null,
      warnings: [...warnings, ...rec.warnings],
    };
  } finally {
    if (connected) await page.close().catch(() => {});
    else await browser.close().catch(() => {});
  }
}

/**
 * Signs in by hand, once: a headed browser, the person does whatever their app asks, and the cookies and storage
 * are kept for every later recording. Nothing of what they typed is stored — only the session the site handed back.
 */
export async function saveLogin(url: string, file: string, done: (page: PageLike) => Promise<void>, headless = false): Promise<string> {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = (await context.newPage()) as unknown as PageLike;
  await page.goto(url, { waitUntil: 'load' });
  await done(page);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await context.storageState({ path: file });
  await browser.close();
  return file;
}
