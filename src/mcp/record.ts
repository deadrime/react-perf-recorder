import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { INJECT_KEY, type InjectConfig } from '../shared/inject';
import { ScriptCatalog, type CdpLike } from '../sources/scripts';
import { summarizeCpu, type CpuInput } from '../vite/cpu';
import { ownRoot } from '../vite/cpu/symbols';
import { SessionStore } from '../vite/middleware';
import { ENDPOINT, type RecordingV2 } from '../shared/schema';
import { placeholderTyping, type ReplayPlan } from '../shared/replay';
import { cpuLine } from '../shared/cpu';
import { wastingRoots, type WastingRoot } from '../shared/summary';
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
  /**
   * Profile the page's JS through CDP while recording (every 0.5 ms by default): where the CPU went, by package,
   * function, component render and entry point. `raw` keeps the profile beside the recording, to open in DevTools.
   */
  cpu?: boolean | { intervalUs?: number; raw?: boolean };
  /** Cookies and storage saved by `login`, so a page behind a sign-in records as the signed-in person. */
  state?: string;
  /** Record in a browser that is already running with `--remote-debugging-port`, as the person who owns it. */
  cdp?: string;
  /** A url to open first: a debug or magic link that signs the browser in, before going to the page to measure. */
  via?: string;
  headed?: boolean;
  timeoutMs?: number;
  /**
   * Put the recorder into the page from outside when the dev server has no Vite plugin (`auto`, by default): any
   * React dev server, with less than the plugin gives. `never` records only through the plugin; `always` skips
   * asking the dev server.
   */
  inject?: 'auto' | 'always' | 'never';
  /** The app's folder, for file names and source lines when the recorder is put in from outside; the working directory by default. */
  root?: string;
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
  /** Roots whose renders mostly changed nothing: after a fix, what is left to look at. */
  wasting: WastingRoot[];
  /** Busy time and the packages that took most of it, when `cpu` was on; the rest is in section cpu. */
  cpu?: string;
  /** `injected`: no Vite plugin on the dev server, record_page brought the recorder in itself. */
  recorder: 'plugin' | 'injected';
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

/** How long a sign-in link gets to finish before the page is opened. */
const VIA_WAIT_MS = 15_000;

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
  waitForURL(url: (at: URL) => boolean, options?: { timeout?: number }): Promise<void>;
  waitForLoadState(state: 'networkidle', options?: { timeout?: number }): Promise<void>;
  addInitScript<T>(fn: ((arg: T) => void) | { content: string }, arg?: T): Promise<void>;
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
const CHROMIUM_BINARIES = [
  'chrome-linux/chrome',
  'chrome-linux64/chrome',
  'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
  'chrome-win/chrome.exe',
];

/** Another Chromium Playwright installed on the machine, newest first: a CI image or sandbox often has one of its own. */
export function installedChromium(root = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), '.cache', 'ms-playwright')) {
  let dirs: string[];
  try {
    dirs = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d));
  } catch {
    return undefined;
  }
  dirs.sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
  for (const dir of dirs)
    for (const binary of CHROMIUM_BINARIES) if (fs.existsSync(path.join(root, dir, binary))) return path.join(root, dir, binary);
  return undefined;
}

async function launch(chromium: Playwright['chromium'], headless: boolean) {
  const executablePath = process.env.REACT_PERF_RECORDER_BROWSER;
  try {
    return await chromium.launch({ headless, ...(executablePath ? { executablePath } : {}) });
  } catch (error) {
    const message = messageOf(error);
    if (!/Executable doesn't exist/.test(message)) throw error;
    // The build this Playwright expects is missing; another one installed beside it records as well.
    const other = executablePath ? undefined : installedChromium();
    if (other) return chromium.launch({ headless, executablePath: other }).catch(() => Promise.reject(error));
    throw new Error(
      `${message.split('\n')[0]}\nThe browser this Playwright expects is not installed. Point at one the machine has: ` +
        'REACT_PERF_RECORDER_BROWSER=/path/to/chromium in the environment of the MCP server (a CI image, a sandbox with its own ' +
        'Chromium), or run `npx playwright install chromium`.'
    );
  }
}

/** A single line with no spaces that ends like a module file: meant as a path, whether or not it is there. */
const looksLikePath = (spec: string) => /^[^\s]+\.(m|c)?[jt]s$/.test(spec.trim());

/** Relative imports as they would read from the project, where the agent wrote them from, not from `scripts/`. */
const fromProject = (code: string) =>
  code.replace(
    /(\bfrom\s*|\bimport\s*)(['"])(\.{1,2}\/[^'"]+)\2/g,
    (_, lead, quote, spec) => `${lead}${quote}${pathToFileURL(path.resolve(spec)).href}${quote}`
  );

/**
 * A path, or the module itself: agents pass the code inline as often as a file — the whole module, a CommonJS
 * `module.exports =` one, or only the body of `async (page) => {…}`. Inline code is written to `scripts/` in the
 * recordings folder: a bare import finds the project's packages from there, and a setup kept for replay stays.
 */
export function moduleFile(spec: string, dir: string): string {
  if (fs.existsSync(path.resolve(spec))) return spec;
  if (looksLikePath(spec)) throw new Error(`no such file: ${path.resolve(spec)} — a path is taken from ${process.cwd()}`);
  if (!/\n|=>|\bpage\./.test(spec)) return spec;
  let code: string;
  if (/export\s+default/.test(spec)) code = spec;
  else if (/module\.exports\s*=/.test(spec)) code = spec.replace(/module\.exports\s*=/, 'export default');
  else if (/^\s*(async\s+)?(function\b|\([^)]*\)\s*=>|\w+\s*=>)/.test(spec)) code = `export default ${spec}\n`;
  else {
    // A body's own imports cannot stay inside the function it becomes: they go above it.
    const lines = spec.split('\n');
    let at = 0;
    while (at < lines.length && (/^\s*import\s[^(]/.test(lines[at]) || !lines[at].trim())) at++;
    code = `${lines.slice(0, at).join('\n')}\nexport default async (page) => {\n${lines.slice(at).join('\n')}\n};\n`.replace(/^\n/, '');
  }
  code = fromProject(code);
  const scripts = path.join(dir, 'scripts');
  fs.mkdirSync(scripts, { recursive: true });
  const file = path.join(scripts, `rpr-module-${createHash('sha1').update(code).digest('hex').slice(0, 12)}.mjs`);
  fs.writeFileSync(file, code);
  return file;
}

async function runModule(spec: string, page: PageLike, dir: string) {
  const file = moduleFile(spec, dir);
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

/** The Vite plugin answers at `<base>/__react-perf-recorder/health`: every folder of the url could be the base. */
export function healthUrls(url: string): string[] {
  const parsed = new URL(url);
  const parts = parsed.pathname.split('/').filter(Boolean);
  const out: string[] = [];
  for (let n = parts.length; n >= 0; n--) out.push(`${parsed.origin}/${[...parts.slice(0, n), ENDPOINT, 'health'].join('/')}`);
  return out;
}

interface RequestLike {
  get(url: string, options?: { timeout?: number; failOnStatusCode?: boolean }): Promise<{ ok(): boolean; text(): Promise<string> }>;
}

/** Whether the page's dev server has the plugin: then it records exactly as it always has. */
async function hasPlugin(request: RequestLike, url: string): Promise<boolean> {
  for (const candidate of healthUrls(url).slice(0, 6)) {
    const answer = await request.get(candidate, { timeout: 3000, failOnStatusCode: false }).catch(() => null);
    if (!answer?.ok()) continue;
    const body = await answer.text().catch(() => '');
    try {
      if ((JSON.parse(body) as { ok?: boolean }).ok === true) return true;
    } catch {
      // An app's own page for any path: not the plugin.
    }
  }
  return false;
}

/** The recorder as record_page puts it into a page, built beside this module (or in the package's dist/ from source). */
function recorderScript(): string {
  const candidates = [
    ...(ownRoot ? [path.join(ownRoot, 'dist', 'recorder.iife.js')] : []),
    path.join(path.dirname(new URL(import.meta.url).pathname), 'recorder.iife.js'),
  ];
  const file = candidates.find((f) => fs.existsSync(f));
  if (!file) throw new Error(`recorder.iife.js is not built (looked in ${candidates.join(', ')}): run npm run build`);
  return fs.readFileSync(file, 'utf8');
}

/** Its frames read as the recorder's own, not the app's, wherever a stack is taken. */
const RECORDER_URL = 'react-perf-recorder://recorder/dist/recorder.iife.js';

const injectedScript = (config: InjectConfig) =>
  `window[${JSON.stringify(INJECT_KEY)}] = ${JSON.stringify(config)};\n${recorderScript()}\n//# sourceURL=${RECORDER_URL}\n`;

/** What a recording made without the plugin lacks, so nobody reads its absence as a finding. */
export const INJECTED_NOTE =
  'recorded without the Vite plugin (the recorder was put into the page): memo components written as arrow functions show as Anonymous, ' +
  'zustand stores without the devtools middleware have no store or action names, proxy-memoize is not seen; the Vite plugin gives all of it';

/** No dev server stores this recording: it is saved from here, its positions mapped by the maps the page loaded. */
async function saveOutside(recording: RecordingV2, cpu: CpuInput | undefined, dir: string, root: string, catalog: ScriptCatalog): Promise<string> {
  const store = new SessionStore({
    dir,
    maxBytes: 256 * 1024 * 1024,
    retain: { sessions: 100, bytes: 500 * 1024 * 1024 },
    gitignore: !path.relative(root, dir).startsWith('..'),
    mapSite: (url, line, column, hooks) => catalog.mapSite(url, line, column, hooks),
    summarizeCpu: (input) => summarizeCpu(input, catalog.moduleSource()),
  });
  const { id } = store.open({
    source: recording.tool.source,
    label: recording.label,
    page: recording.page,
    scope: recording.scope,
    conditions: recording.conditions,
    plugins: recording.tool.plugins,
  });
  await store.finish(id, recording, cpu);
  return id;
}

/**
 * Opens the page in its own browser (or in one already running, over CDP), records, and returns what the session
 * says about itself. The browser it launched is always closed; a browser it only connected to never is.
 */
export async function recordPage(options: RecordPageOptions, sessionsDir: string): Promise<RecordPageResult> {
  const { chromium } = await loadPlaywright();
  // A setup without a url: the recording starts where the setup left the page, with what it built in memory.
  const stay = Boolean(options.setup) && !options.url && !options.replay;
  if (stay && options.fromLoad) throw new Error('fromLoad reloads the page: pass the url, or leave out fromLoad to record where setup left it');
  const given = options.url ?? options.replay?.url;
  // A recording keeps its url with the tokens masked: a masked one cannot be opened, the caller has to give it.
  if (!stay && (!given || given.includes('***'))) throw new Error('url is needed: the recording to replay does not carry a usable one');
  let url: string = given ?? '';
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
    let cdp: CdpLike | null = null;
    const session = async () => (cdp ??= await context.newCDPSession(page as never));
    if (options.throttle && options.throttle > 1) await (await session()).send('Emulation.setCPUThrottlingRate', { rate: options.throttle });
    const cpuAsked = options.cpu ? { intervalUs: 500, raw: false, ...(options.cpu === true ? {} : options.cpu) } : null;
    const cpu = cpuAsked && { ...cpuAsked, intervalUs: Math.max(50, Math.round(cpuAsked.intervalUs)) };
    let profiling = false;
    const startProfile = async () => {
      if (!cpu || profiling) return;
      const s = await session();
      await s.send('Profiler.enable');
      await s.send('Profiler.setSamplingInterval', { interval: cpu.intervalUs });
      await s.send('Profiler.start');
      profiling = true;
    };
    const stopProfile = async () => {
      if (!profiling) return null;
      profiling = false;
      const { profile } = (await (await session()).send('Profiler.stop')) as { profile: unknown };
      return profile;
    };
    // Before Stop, so the components still in memory are the ones something holds, not garbage not yet collected.
    const collect = () =>
      session()
        .then((s) => s.send('HeapProfiler.collectGarbage'))
        .then(() => true)
        .catch(() => false);
    const root = path.resolve(options.root ?? process.cwd());
    const request = (context as unknown as { request: RequestLike }).request;
    // Asked before anything opens: a recorder put in from outside has to be there before the page's first script.
    const probeAt = stay ? options.via : url;
    const served = Boolean(probeAt && /^https?:/.test(probeAt));
    let injected = options.inject === 'always' || (options.inject !== 'never' && served && !(await hasPlugin(request, probeAt!)));
    let catalog = injected
      ? new ScriptCatalog({
          root,
          fetchText: async (at) => {
            const answer = await request.get(at, { timeout: 10_000, failOnStatusCode: false }).catch(() => null);
            return answer?.ok() ? answer.text() : null;
          },
        })
      : null;
    if (catalog) {
      await page.addInitScript({ content: injectedScript({ projectRoot: root.replace(/\\/g, '/') }) });
      // Every script's source map, as the page loads it: there is no dev server to ask for them afterwards, and the
      // page learns whose code each line of a bundled chunk is.
      await catalog.attach(await session(), { tables: true });
    }
    // A link that signs the browser in — `/debug/<jwt>`, a magic link — is opened first and is never recorded.
    if (options.via) {
      const via = options.via;
      await page.goto(via, { waitUntil: 'load' });
      // A single-page app checks the token with a request after load and only then moves on: leaving at load cuts
      // the sign-in off, and the page is recorded half signed in.
      const settled = await Promise.race([
        page.waitForURL((at) => !samePage(via, at.href), { timeout: VIA_WAIT_MS }).then(() => true),
        page.waitForLoadState('networkidle', { timeout: VIA_WAIT_MS }).then(() => true),
      ]).catch(() => false);
      if (!settled) warnings.push(`${safeUrl(via)} neither moved on nor went quiet in ${VIA_WAIT_MS / 1000}s: the sign-in may not have finished`);
    }
    if (options.setup) await runModule(options.setup, page, sessionsDir);
    const leftAt = page.url();
    if (stay) {
      if (!/^https?:/.test(leftAt)) throw new Error('setup left no page open: goto the app in it, or pass url');
      url = leftAt;
    } else if (options.setup && /^https?:/.test(leftAt) && !samePage(leftAt, url))
      warnings.push(
        `setup ended on ${safeUrl(leftAt)} and the recording opened ${safeUrl(url)}: storage and cookies carried over, state built in ` +
          'the page did not — leave out url to record where setup left the page'
      );
    // A name is the form an agent has at hand: it read the component's file, so it knows what the component is called.
    const scope = typeof options.scope === 'string' ? { names: [options.scope] } : options.scope;
    // What the page cannot see about itself goes into its conditions, so a comparison says when two runs differ in it.
    const conditions = {
      ...(injected ? { recorder: 'injected' } : {}),
      ...(options.throttle && options.throttle > 1 ? { throttle: options.throttle } : {}),
      ...(cpu ? { cpu: `sampled every ${cpu.intervalUs / 1000}ms` } : {}),
    };
    const start = {
      source: 'script:record',
      ...(options.label ? { label: options.label } : {}),
      ...(scope ? { scope } : {}),
      ...(options.watch?.length ? { watch: options.watch } : {}),
      ...(options.sample ? { sampleReasons: true } : {}),
      ...(Object.keys(conditions).length ? { conditions } : {}),
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
    // The injected recorder reads the same storage; the app's url stays the app's.
    const requested = options.fromLoad && !injected ? withLoadFlag(url) : url;
    // Starting the profiler takes V8 a moment (120-200 ms on a small app): before the load it records, else outside.
    if (options.fromLoad) await startProfile();
    if (!stay) await page.goto(requested, { waitUntil: 'load' });
    try {
      // The client script is injected at the top of <head>, so by `load` it has either booted or never will:
      // a few seconds of grace, not the navigation's whole budget.
      await page.waitForFunction(`Boolean(${ENGINE}?.engine)`, undefined, { timeout: Math.min(timeout, 5000) });
    } catch {
      // Two very different failures look the same from here, so the message names both.
      const landed = page.url();
      throw new Error(
        samePage(url, landed)
          ? injected
            ? `the recorder put into ${landed} did not start`
            : `the recorder is not on ${landed}: the Vite plugin is not in this dev server, or the page is a production build`
          : `${safeUrl(url)} went to ${safeUrl(landed)} — it is behind a sign-in. Open it through a link that signs in ` +
            '(`via`), with a session saved once by `react-perf-recorder login <url>`, or with `cdp` against a browser you are ' +
            'already signed in to — or ask the person to record it from the panel.'
      );
    }
    if (!samePage(url, page.url())) warnings.push(`asked for ${safeUrl(url)}, recorded ${safeUrl(page.url())}`);
    // The plugin's recorder was there after all (a build made with it, no dev server to ask): it records as always.
    if (injected && (await page.evaluate<boolean>(`window[${JSON.stringify(INJECT_KEY)}]?.state === 'aside'`))) {
      injected = false;
      await catalog?.release();
      catalog = null;
      delete (start.conditions as Record<string, unknown> | undefined)?.recorder;
    }

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
      // The engine is in the page before the app: an app still loading has no React root yet to record.
      await page.waitForFunction(`${ENGINE}.engine.componentNames(1).length > 0`, undefined, { timeout: Math.min(timeout, 15_000) }).catch(() => {});
      await startProfile();
      try {
        await page.evaluate(`${ENGINE}.engine.start(${JSON.stringify(start)})`);
      } catch (error) {
        const message = messageOf(error);
        if (injected && /root not found/.test(message))
          throw new Error(`no React root in development mode on ${safeUrl(page.url())}: the recorder reads React's dev build, not a production one`);
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
        const invented = placeholderTyping(options.replay);
        if (invented) warnings.push(invented);
      } else if (options.script) {
        await runModule(options.script, page, sessionsDir);
      } else {
        await page.waitForTimeout(ms);
      }
      // Stopped before the garbage is collected: a forced GC is not the page's work.
      const profile = await stopProfile();
      const collected = await collect();
      const cpuInput = profile && cpu ? ({ format: 'cdp', profile, intervalMs: cpu.intervalUs / 1000, keep: cpu.raw } as CpuInput) : undefined;
      const stopped = await page.evaluate<Promise<Stopped>>(
        ([collected, cpu]: [boolean, unknown]) =>
          (
            globalThis as unknown as { __REACT_PERF_RECORDER__: { engine: { stop(o: object): Promise<RecordingV2 & { id?: string }> } } }
          ).__REACT_PERF_RECORDER__.engine
            .stop({ collected, cpu })
            .then((r) => ({ id: r.id ?? null, recording: r })),
        [collected, injected ? undefined : cpuInput]
      );
      saved = catalog ? { id: await saveOutside(stopped.recording, cpuInput, sessionsDir, root, catalog), recording: stopped.recording } : stopped;
    } catch (error) {
      throw options.script || options.replay ? await explainFailure(error, page, navigatedTo, url, sessionsDir) : error;
    }
    const rec = saved.recording;
    // A replay does again what the person did, not what prepared the page: the setup stays with the recording for it.
    const at = saved.id && path.join(sessionsDir, saved.id);
    if (at && options.setup && fs.existsSync(at))
      fs.writeFileSync(path.join(at, SETUP_FILE), JSON.stringify({ setup: path.resolve(moduleFile(options.setup, sessionsDir)) }));
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
      wasting: wastingRoots(rec),
      ...(rec.cpu ? { cpu: cpuLine(rec.cpu) } : {}),
      recorder: injected ? 'injected' : 'plugin',
      warnings: [
        ...warnings,
        ...(rec.totals.commits === 0
          ? [`nothing rendered in ${(rec.durationMs / 1000).toFixed(1)}s: the page may still be loading, behind a sign-in, or idle`]
          : []),
        ...(injected ? [INJECTED_NOTE] : []),
        ...(cpu && !rec.cpu && !rec.warnings.some((w) => w.startsWith('CPU'))
          ? ['CPU profile not saved: the page has no dev server to read it']
          : []),
        ...rec.warnings,
      ],
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
