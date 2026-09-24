import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RecordingV2 } from '../shared/schema';
import type { ReplayPlan } from '../shared/replay';
import { safeUrl } from '../shared/url';
import { ON_LOAD_KEY } from '../ui/storage';

/**
 * Recording a page without a person at the keyboard: open it, wait for the engine the Vite plugin puts there,
 * record, and hand back the id the session was saved under.
 */
export interface RecordPageOptions {
  /** Optional with `replay`: the page the replayed recording was made on. */
  url?: string;
  /** How long to record once the page is ready; ignored when a script says when to stop. */
  ms?: number;
  label?: string;
  /** An area: a component's name, the path down to it, or an element — `'MessageList'`, `{ names: [...] }`, `{ selector }`. */
  scope?: string | unknown;
  watch?: string[];
  /** A module whose default export gets the Playwright page; it runs while the recording is on. */
  script?: string;
  /** A module run before the page is opened for the recording: seeds storage, signs in. Not recorded. */
  setup?: string;
  /** A recording to do again: its actions, at its pace, from the page load. Instead of `script`. */
  replay?: ReplayPlan & { url?: string };
  /** Record from the first commit of the page load, rather than from a page that has settled. */
  fromLoad?: boolean;
  viewport?: string;
  /** Parent reasons for a sample of a big list's instances: faster; counts of renders stay exact. */
  sample?: boolean;
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
  rendersPerCommit: number;
  topRoot: string | null;
  warnings: string[];
}

/** The default place `login` keeps a session: beside the recordings, in a folder git already ignores. */
export const defaultStatePath = (dir: string) => path.join(dir, 'auth.json');

type Playwright = typeof import('playwright');

/**
 * Playwright is the project's, never a dependency: a recorder must not drag a browser into every install. Its
 * absence is an answer, not a crash.
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
  addInitScript<T>(fn: (arg: T) => void, arg: T): Promise<void>;
  setDefaultTimeout(ms: number): void;
  on(event: 'domcontentloaded', listener: () => void): void;
  screenshot(options: { path: string }): Promise<unknown>;
  close(): Promise<void>;
}

const ENGINE = 'window.__REACT_PERF_RECORDER__';
/** Beside a recording made by record_page: the `setup` it ran, which a replay of it runs again. */
export const SETUP_FILE = 'record-page.json';

const messageOf = (error: unknown) => String((error as Error)?.message ?? error);

/**
 * REACT_PERF_RECORDER_BROWSER is a browser of the machine's own, for CI images and cloud sandboxes; a browser
 * Playwright cannot find is named in words.
 */
async function launch(chromium: Playwright['chromium'], headless: boolean) {
  const executablePath = process.env.REACT_PERF_RECORDER_BROWSER;
  try {
    return await chromium.launch({ headless, ...(executablePath ? { executablePath } : {}) });
  } catch (error) {
    const message = messageOf(error);
    if (!/Executable doesn't exist/.test(message)) throw error;
    throw new Error(
      `${message.split('\n')[0]}\nThe browser this Playwright expects is not installed. Point at one the machine has: ` +
        'REACT_PERF_RECORDER_BROWSER=/path/to/chromium in the environment of the MCP server (a CI image, a sandbox with its own ' +
        'Chromium), or run `npx playwright install chromium`.'
    );
  }
}

async function runModule(file: string, page: PageLike) {
  // The server lives for the whole session and Node keeps a module by its URL: an edited script would run as it was.
  const resolved = path.resolve(file);
  const module = (await import(/* @vite-ignore */ `${pathToFileURL(resolved).href}?v=${fs.statSync(resolved).mtimeMs}`)) as {
    default?: (page: unknown) => Promise<void> | void;
  };
  if (typeof module.default !== 'function') throw new Error(`${file} must export default async (page) => { … }`);
  await module.default(page);
}

/**
 * A failed script says what the page was doing, not only what Playwright waited for: where it was, what it showed,
 * a screenshot beside the recordings — and the two ways a script ends a recording it did not start.
 */
async function explainFailure(error: unknown, page: PageLike, navigatedTo: string | null, opened: string, dir: string): Promise<Error> {
  const message = messageOf(error).split('\n')[0];
  const hints: string[] = [];
  const same = (a: string, b: string) => a.split('#')[0] === b.split('#')[0];
  if (navigatedTo && same(navigatedTo, opened))
    hints.push(
      'the page reloaded itself at the url it was opened on, and the recording ended with it: the dev server does that when it ' +
        'optimizes dependencies found on a first visit — record again'
    );
  else if (navigatedTo)
    hints.push(
      `the script navigated to ${safeUrl(navigatedTo)}: the recording lives in the page and ended with it. record_page has already ` +
        'opened the url and is recording — a script only does the actions; storage to seed or a sign-in goes in `setup`, run before the page opens'
    );
  else if (/recording is already running|no recording is running/.test(message))
    hints.push('record_page starts and stops the recording itself: a script must not call engine.start, stop or record');
  const shot = path.join(dir, `record-page-failure-${Date.now()}.png`);
  const [saved, text] = await Promise.all([
    page
      .screenshot({ path: shot })
      .then(() => true)
      .catch(() => false),
    page.evaluate<string>('(document.body?.innerText ?? "").replace(/\\s+/g, " ").trim().slice(0, 300)').catch(() => ''),
  ]);
  const where = [`page ${safeUrl(page.url())}`, text ? `showing: "${text}"` : '', saved ? `screenshot ${shot}` : ''].filter(Boolean);
  return new Error([message, ...hints, where.join('; ')].join('\n'));
}

/**
 * Opens the page in its own browser (or in one already running, over CDP), records, and returns what the session
 * says about itself. The browser it launched is always closed; a browser it only connected to never is.
 */
export async function recordPage(options: RecordPageOptions, sessionsDir: string): Promise<RecordPageResult> {
  const { chromium } = await loadPlaywright();
  const given = options.url ?? options.replay?.url;
  // A recording keeps its url with the tokens masked: a masked one cannot be opened, the caller has to give it.
  if (!given || given.includes('***')) throw new Error('url is needed: the recording to replay does not carry a usable one');
  const url: string = given;
  options = { ...options, url, ...(options.replay ? { fromLoad: options.fromLoad ?? true } : {}) };
  const ms = Math.max(200, options.ms ?? 3000);
  const timeout = options.timeoutMs ?? 30_000;
  const warnings: string[] = [];
  const state = options.state ?? defaultStatePath(sessionsDir);
  const hasState = fs.existsSync(state);
  if (options.state && !hasState) throw new Error(`no saved session at ${state}; make one with: react-perf-recorder login <url> --state ${state}`);

  const connected = Boolean(options.cdp);
  const browser = connected ? await chromium.connectOverCDP(options.cdp!) : await launch(chromium, !options.headed);
  let page: PageLike | null = null;
  try {
    // A browser of the person's own already carries their session; a fresh one gets whatever `login` saved.
    const context = connected
      ? browser.contexts()[0] ?? (await browser.newContext())
      : await browser.newContext({
          ...(hasState ? { storageState: state } : {}),
          ...(sizeOf(options.viewport) ? { viewport: sizeOf(options.viewport) } : {}),
        });
    page = (await context.newPage()) as unknown as PageLike;
    page.setDefaultTimeout(timeout);
    if (options.throttle && options.throttle > 1) {
      const session = await context.newCDPSession(page as never);
      await session.send('Emulation.setCPUThrottlingRate', { rate: options.throttle });
    }
    // A link that signs the browser in — `/debug/<jwt>`, a magic link — is opened first and is never recorded.
    if (options.via) await page.goto(options.via, { waitUntil: 'load' });
    if (options.setup) await runModule(options.setup, page);
    // A name is the form an agent has at hand: it read the component's file, so it knows what the component is called.
    const scope = typeof options.scope === 'string' ? { names: [options.scope] } : options.scope;
    const start = {
      source: 'script:record',
      ...(options.label ? { label: options.label } : {}),
      ...(scope ? { scope } : {}),
      ...(options.watch?.length ? { watch: options.watch } : {}),
      ...(options.sample ? { sampleReasons: true } : {}),
      highlight: false,
    };
    // A recording from the load starts in the page before this script can say anything: what it should be about
    // is left where the panel's own load button leaves it, for the page to pick up as it boots.
    if (options.fromLoad)
      await page.addInitScript(
        ({ key, value }) => {
          try {
            sessionStorage.setItem(key, value);
          } catch {
            // No storage: the page records the whole app, and the check below says so.
          }
        },
        { key: ON_LOAD_KEY, value: JSON.stringify(start) }
      );
    const requested = options.fromLoad ? withLoadFlag(url) : url;
    await page.goto(requested, { waitUntil: 'load' });
    try {
      // The client script is injected at the top of <head>, so by `load` it has either booted or never will:
      // a few seconds of grace, not the navigation's whole budget.
      await page.waitForFunction(`Boolean(${ENGINE}?.engine)`, undefined, { timeout: Math.min(timeout, 5000) });
    } catch {
      // Two very different failures look the same from here, so the message names both.
      const landed = page.url();
      throw new Error(
        samePage(url, landed)
          ? `the recorder is not on ${landed}: the Vite plugin is not in this dev server, or the page is a production build`
          : `${safeUrl(url)} went to ${safeUrl(landed)} — it is behind a sign-in. Open it through a link that signs in ` +
            '(`via`), with a session saved once by `react-perf-recorder login <url>`, or with `cdp` against a browser you are ' +
            'already signed in to — or ask the person to record it from the panel.'
      );
    }
    if (!samePage(url, page.url())) warnings.push(`asked for ${safeUrl(url)}, recorded ${safeUrl(page.url())}`);

    // A page-load recording starts once its area is mounted; one that never does is the same dead end as below.
    if (options.fromLoad) {
      const started = await page
        .waitForFunction(`${ENGINE}.engine.recording`, undefined, { timeout: Math.min(timeout, 5000) })
        .then(() => true)
        .catch(() => false);
      if (!started) {
        const names = await page.evaluate<string[]>(`${ENGINE}.engine.componentNames()`).catch(() => []);
        throw new Error(
          `the recording from the page load did not start${scope ? `: ${JSON.stringify(scope)} is not mounted` : ''}${
            names.length ? `; the page has ${names.slice(0, 20).join(', ')}` : ''
          }`
        );
      }
    } else {
      try {
        await page.evaluate(`${ENGINE}.engine.start(${JSON.stringify(start)})`);
      } catch (error) {
        const message = messageOf(error);
        // An area that is not on the page is a dead end unless the answer says what is: the names it could have meant.
        if (!/is not mounted|no element matches|does not own/.test(message)) throw error;
        const names = await page.evaluate<string[]>(`${ENGINE}.engine.componentNames()`).catch(() => []);
        // The page's own stack is of no use to whoever asked for the wrong area; the names that are there is.
        const first = message.split('\n')[0].replace(/^.*?Error: /, '');
        throw new Error(`${first}${names.length ? `; the page has ${names.slice(0, 20).join(', ')}` : ''}`);
      }
    }
    let navigatedTo: string | null = null;
    const current = page;
    // A new document, not framenavigated: pushState of a client-side router keeps the recording alive.
    current.on('domcontentloaded', () => {
      navigatedTo = current.url();
    });
    type Stopped = { id: string | null; recording: RecordingV2 };
    let saved: Stopped;
    try {
      if (options.replay) {
        await page.evaluate(`${ENGINE}.replay(${JSON.stringify(options.replay)})`);
        if (options.replay.skipped.length) warnings.push(`not replayed: ${options.replay.skipped.join('; ')}`);
      } else if (options.script) {
        await runModule(options.script, page);
      } else {
        await page.waitForTimeout(ms);
      }
      saved = await page.evaluate<Stopped>(`${ENGINE}.engine.stop().then((r) => ({ id: r.id ?? null, recording: r }))`);
    } catch (error) {
      throw options.script || options.replay ? await explainFailure(error, page, navigatedTo, url, sessionsDir) : error;
    }
    const rec = saved.recording;
    // A replay does again what the person did, not what prepared the page: the setup stays with the recording for it.
    const at = saved.id && path.join(sessionsDir, saved.id);
    if (at && options.setup && fs.existsSync(at)) fs.writeFileSync(path.join(at, SETUP_FILE), JSON.stringify({ setup: path.resolve(options.setup) }));
    return {
      id: saved.id,
      url: safeUrl(page.url()),
      requested: safeUrl(url),
      durationSec: +(rec.durationMs / 1000).toFixed(1),
      commits: rec.totals.commitsInScope,
      renders: rec.totals.renders,
      rendersWithoutDom: rec.totals.rendersWithoutDom,
      rendersPerCommit: rec.totals.rendersPerScopeCommit,
      topRoot: rec.roots[0] ? `${rec.roots[0].name} ×${rec.roots[0].hits}` : null,
      warnings: [...warnings, ...rec.warnings],
    };
  } finally {
    if (connected) await page?.close().catch(() => {});
    else await browser.close().catch(() => {});
  }
}

/**
 * Signs in by hand, once: a headed browser, the person does whatever their app asks, and the cookies and storage
 * are kept for every later recording. Nothing of what they typed is stored — only the session the site handed back.
 */
export async function saveLogin(url: string, file: string, done: (page: PageLike) => Promise<void>, headless = false): Promise<string> {
  const { chromium } = await loadPlaywright();
  const browser = await launch(chromium, headless);
  try {
    const context = await browser.newContext();
    const page = (await context.newPage()) as unknown as PageLike;
    await page.goto(url, { waitUntil: 'load' });
    await done(page);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await context.storageState({ path: file });
    return file;
  } finally {
    await browser.close().catch(() => {});
  }
}
