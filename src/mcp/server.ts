import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { z } from 'zod';
import { compareRecordings } from '../shared/compare';
import {
  actionText,
  cascadeLines,
  cascadeOf,
  hookOf,
  hookText,
  memoLine,
  reasonsById,
  rootLine,
  summarize,
  textOf,
  waysOf,
  wayText,
  type HookMode,
} from '../shared/summary';
import type { RecordingV2 } from '../shared/schema';
import { listingOf } from '../shared/listing';
import { planReplay } from '../shared/replay';
import { recordPage } from './record';
import { findSession, listSessions, readRecording, waitForSession } from './store';

declare const __VERSION__: string;
const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev';

const SECTIONS = [
  'summary',
  'actions',
  'roots',
  'outside',
  'causes',
  'components',
  'memos',
  'watch',
  'zones',
  'timeline',
  'segments',
  'frames',
  'navigations',
  'conditions',
  'warnings',
  'plugins',
] as const;

const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 1) }] });

export function section(rec: RecordingV2 & { id?: string; status?: string }, name: string, top: number, offset: number, hooks: HookMode = 'full') {
  const page = <T>(list: T[]) => ({ total: list.length, offset, items: list.slice(offset, offset + top) });
  const ms = rec.durationMs;
  switch (name) {
    case 'summary':
      return summarize(rec, top, hooks);
    case 'actions': {
      const actions = new Map(rec.actions.map((a) => [a.id, a]));
      const roots = [...rec.roots, ...rec.outsideRoots];
      const reasons = reasonsById(rec.reasons);
      return page(
        rec.segments.map((s) => ({
          ...s,
          action: actions.get(s.action),
          topRoots: s.topRoots.map(([i, n]) => {
            const root = roots[i];
            const reason = root ? reasons.get(root.reasons[0]?.[0]) : undefined;
            return {
              root: root?.name,
              renders: n,
              reason: reason && textOf(reason),
              hook: root && reason ? hookText(hookOf(root, reason), hooks) : '',
            };
          }),
        }))
      );
    }
    case 'roots':
      return page(rec.roots.map((r) => ({ ...rootLine(r, ms, reasonsById(rec.reasons), hooks), hooks: r.hooks })));
    case 'outside':
      return page(
        rec.outsideRoots.map((r) => ({ ...rootLine(r, ms, reasonsById(rec.reasons), hooks), hooks: r.hooks, scopeRenders: r.scopeRenders }))
      );
    case 'causes':
      return page(rec.causes);
    case 'memos':
      return page((rec.memos ?? []).map((m) => ({ ...m, line: memoLine(m) })));
    // A component keeps its reasons as ids into the recording's dictionary; nobody reading the answer can join
    // them by hand, so they are handed over in words, with the id kept for the timeline.
    case 'components': {
      const reasons = reasonsById(rec.reasons);
      return page(
        rec.components.map((c) => ({
          ...c,
          reasons: c.reasons.map(([id, n]) => {
            const reason = reasons.get(id);
            return { i: id, n, reason: reason ? textOf(reason) : '?' };
          }),
          ...(c.chains ? { chains: waysOf(rec, c.chains).map((way) => ({ n: way.n, way: wayText(way) })) } : {}),
        }))
      );
    }
    // One line per commit, in words: when, what rendered, why, and what set it off. The recording keeps this as
    // ids into its dictionaries; an agent reading the answer should not have to join them itself.
    case 'timeline': {
      const reasons = reasonsById(rec.reasons);
      const roots = [...rec.roots, ...rec.outsideRoots];
      const causeKeys = new Map(rec.causes.map((c) => [c.i, c.key]));
      const byAction = new Map(rec.actions.map((a) => [a.id, a]));
      return {
        truncated: rec.commits.truncated,
        ...page(
          rec.commits.list.map((commit) => ({
            i: commit.i,
            atSec: +(commit.atMs / 1000).toFixed(2),
            renders: commit.renders,
            ...(commit.noDom ? { noDomChange: commit.noDom } : {}),
            ...(commit.ms ? { renderMs: commit.ms } : {}),
            ...(commit.sinceMs ? { sinceMs: commit.sinceMs } : {}),
            ...(commit.lane ? { lane: commit.lane } : {}),
            ...(commit.event ? { event: commit.event } : {}),
            ...(commit.actionId !== undefined && byAction.has(commit.actionId) ? { action: actionText(byAction.get(commit.actionId)!) } : {}),
            ...(commit.causeIds?.length ? { causes: commit.causeIds.map((i) => causeKeys.get(i)).filter(Boolean) } : {}),
            roots: (commit.roots ?? []).slice(0, 5).map((entry) => ({
              root: roots[entry.i]?.name ?? '?',
              hits: entry.hits,
              reasons: entry.reasonIds.map((id) => {
                const reason = reasons.get(id);
                return reason ? textOf(reason) : '?';
              }),
              ...(roots[entry.i] ? { hook: hookText(hookOf(roots[entry.i], reasons.get(entry.reasonIds[0])), hooks) } : {}),
            })),
            // Whom the roots rendered in turn, and with which props: only when there is more than the roots.
            ...(() => {
              const tree = cascadeOf(rec, commit);
              return tree.some((node) => node.children.length) ? { cascade: cascadeLines(tree, 12) } : {};
            })(),
          }))
        ),
      };
    }
    case 'segments':
      return page(rec.segments);
    case 'frames':
      return { longTasks: rec.frames.longTasks, ...page(rec.frames.loaf.slice().sort((a, b) => b.duration - a.duration)) };
    case 'navigations':
      return page(rec.navigations);
    case 'conditions':
      return { conditions: rec.conditions, conditionsChanged: rec.conditionsChanged ?? {}, page: rec.page };
    case 'warnings':
      return { warnings: rec.warnings, errors: rec.errors };
    case 'watch':
      return rec.watch ?? {};
    case 'zones':
      return rec.zones ?? {};
    case 'plugins':
      return Object.fromEntries(
        Object.entries(rec.plugins).map(([n, s]) => [
          n,
          s.active === false
            ? { version: s.version, active: false, note: 'the library is not on the page' }
            : {
                version: s.version,
                highlights: s.highlights ?? [],
                metrics: Object.entries(s.metrics ?? {})
                  .sort((a, b) => b[1].value - a[1].value)
                  .slice(0, top),
              },
        ])
      );
    default: {
      const plugin = /^plugin:(.+)$/.exec(name)?.[1];
      if (plugin && rec.plugins[plugin]) {
        const text = JSON.stringify(rec.plugins[plugin]);
        return text.length > 40_000 ? { truncated: true, text: text.slice(0, 40_000) } : rec.plugins[plugin];
      }
      throw new Error(`unknown section ${name}; one of ${SECTIONS.join(', ')} or plugin:<name>`);
    }
  }
}

export function createServer(dir: string) {
  const server = new McpServer({ name: 'react-perf-recorder', version: VERSION });

  server.registerTool(
    'list_recordings',
    {
      description:
        'Sessions recorded with the panel, record_page or scripts, newest first: id, status (recording — still running, done, interrupted — the page reloaded or closed), source, label, url, area, duration, actions, commits, renders and the top cascade root.',
      inputSchema: {
        limit: z.number().int().min(1).max(200).optional().describe('20 by default.'),
        status: z.enum(['recording', 'done', 'interrupted']).optional(),
        scope: z.string().optional().describe('Only sessions whose area name contains this; "whole app" for those with no area.'),
        source: z.string().optional().describe('Only sessions whose source contains this: panel, record, script:<name>.'),
        url: z
          .string()
          .optional()
          .describe('Only sessions whose page url contains this, e.g. "localhost:5406" — another agent may record another app into the same folder.'),
        label: z.string().optional().describe('Only sessions whose label contains this.'),
      },
    },
    async ({ limit = 20, status, scope, source, url, label }) => {
      const sessions = listSessions(dir).filter(
        (s) =>
          (!status || s.status === status) &&
          (!scope || (s.meta.scope?.name ?? 'whole app').includes(scope)) &&
          (!source || s.meta.source.includes(source)) &&
          (!url || s.meta.page.url.includes(url)) &&
          (!label || (s.meta.label ?? '').includes(label))
      );
      return json({
        dir,
        total: sessions.length,
        recordings: sessions.slice(0, limit).map((s) => {
          // A finished session says it all in its metadata; older ones and running ones are read through.
          const listing = s.meta.listing ?? (s.hasRecording || s.status !== 'done' ? listingOf(readRecording(s)) : null);
          return {
            id: s.id,
            status: s.status,
            createdAt: s.meta.createdAt,
            source: s.meta.source,
            ...(s.meta.label ? { label: s.meta.label } : {}),
            url: s.meta.page.url,
            area: s.meta.scope?.name ?? 'whole app',
            durationSec: listing ? +(listing.durationMs / 1000).toFixed(1) : null,
            actions: listing?.actions ?? 0,
            commits: listing?.commits ?? 0,
            renders: listing?.renders ?? 0,
            topRoot: listing?.topRoot ?? null,
            plugins: s.meta.plugins.map((p) => p.name),
            bytes: s.bytes,
          };
        }),
      });
    }
  );

  server.registerTool(
    'get_recording',
    {
      description:
        'One session, in words: reasons, hook chains and causes resolved from the ids recording.json keeps them as — read sections, not the file. ' +
        'id: an id from list_recordings, "latest" or "latest-1". A running or interrupted session is rebuilt from its events (partial: ' +
        'no hook names, components, ways or plugin sections). The answer carries the session folder for grep.',
      inputSchema: {
        id: z.string().default('latest'),
        section: z
          .string()
          .optional()
          .describe(
            `${SECTIONS.join(', ')}, or plugin:<name> for a plugin's raw data. summary (default): totals, cascade roots with reason, ` +
              'hook chain and file:line, roots from outside the area, causes, the costliest actions, memos that keep recomputing, ' +
              "plugin highlights — usually the whole answer. components: each component's reasons and its ways down from a root, " +
              'with the props each parent handed on. timeline: one line per commit — when, what rendered, the action and causes, each ' +
              'root with its reasons, and the commit\'s cascade as a tree — for "what happened at 2.4s". actions: the element each ' +
              'one landed on, its component and file, what it cost. memos: useMemo/useCallback that keep recomputing, the dependency ' +
              'that moved and its line.'
          ),
        top: z.number().int().min(1).max(100).optional().describe('How many entries of a long section, 10 by default.'),
        offset: z.number().int().min(0).optional().describe('Where to start in a long section, to page through it.'),
        hooks: z
          .enum(['full', 'short'])
          .optional()
          .describe(
            'Hook chains in reason lines. full (default): every hook down to the primitive, with [package] where app code hands over. short: app hooks and the package API they call. Raw chains stay in section roots either way.'
          ),
      },
    },
    async ({ id, section: name = 'summary', top = 10, offset = 0, hooks = 'full' }) => {
      const entry = findSession(dir, id);
      const rec = readRecording(entry);
      return json({
        id: entry.id,
        status: entry.status,
        dir: entry.dir,
        ...(rec.partial ? { partial: true } : {}),
        [name]: section(rec, name, top, offset, hooks),
      });
    }
  );

  server.registerTool(
    'record_page',
    {
      description:
        "Records a page in a browser of its own and returns the session id, so a fix can be measured: record, change the code, record again with the same arguments, then compare_recordings. Needs the dev server running with the Vite plugin and playwright installed in the project. A scenario of clicks and typing goes in a script module, or replay does again what a recording did — the person's own clicks and typing, at their pace, from the page load; replay does not wait for data, so a scenario whose actions wait on requests needs a script. Without either it records ms of the page as it is, and fromLoad records the page load itself. Behind a sign-in: via (a link that signs in), then a session saved once by `react-perf-recorder login <url>`, then cdp; a page that redirects to a login says so. Outlines are off in these runs. A run that outlasts the client's time limit (about a minute) keeps recording in the page: list_recordings shows it as recording until it ends — keep a script well under a minute.",
      inputSchema: {
        url: z.string().optional().describe("The page to open, on the dev server. With replay, the recording's page when left out."),
        ms: z
          .number()
          .int()
          .min(200)
          .max(60_000)
          .optional()
          .describe('How long to record the page as it is, 3000 by default. With a script or replay the recording lasts as long as they run.'),
        label: z.string().optional().describe('What this run is, e.g. "before" and "after".'),
        scope: z
          .union([z.string(), z.object({ names: z.array(z.string()) }), z.object({ selector: z.string(), component: z.string().optional() })])
          .optional()
          .describe(
            'Record only what renders inside an area: a component\'s name as the page calls it ("MessageList"), the path down to it when the name repeats, or an element. Renders that came from above are kept as outside roots, with their reason.'
          ),
        watch: z
          .array(z.string())
          .optional()
          .describe('Components to follow by name through the whole page: how often each rendered and which root pulled it.'),
        script: z
          .string()
          .optional()
          .describe(
            'A module with `export default async (page) => {…}`: the page is already open at url and recording when it runs, and the recording stops when it returns — so it only does the actions. No goto, reload or engine.start/stop in it: a navigation ends the recording. A failure answers with the page url, its text and a screenshot.'
          ),
        setup: z
          .string()
          .optional()
          .describe(
            'A module like script, run before the page is opened for the recording and not recorded: seed localStorage or IndexedDB (goto the dev server, evaluate, return), sign in, build data through the UI.'
          ),
        replay: z
          .string()
          .optional()
          .describe(
            'A recording id (or "latest") whose actions to do again, from the page load, on its page and in its area unless url and scope say otherwise: record it after the fix, then compare_recordings with the original.'
          ),
        fromLoad: z.boolean().optional().describe('Record from the first commit of the page load.'),
        viewport: z.string().optional().describe('1280x800; keep it the same across runs that will be compared.'),
        sample: z
          .boolean()
          .optional()
          .describe(
            'Faster on lists of thousands: reasons of renders a parent caused are a sample, counts stay exact, and no ways or commit cascades are kept.'
          ),
        throttle: z.number().min(1).max(20).optional().describe('CPU slowdown, 4 = four times slower.'),
        state: z.string().optional().describe('A session saved by `login`; the default beside the recordings is used when it is there.'),
        cdp: z.string().optional().describe('http://localhost:9222 of a browser already running and signed in.'),
        via: z
          .string()
          .optional()
          .describe('A url to open first that signs the browser in — a debug or magic link. It is not recorded, and its token is never stored.'),
      },
    },
    async ({ replay, ...args }) => {
      if (!replay) return json(await recordPage(args, dir));
      const rec = readRecording(findSession(dir, replay));
      const plan = planReplay({ ...rec, id: rec.id ?? replay });
      if (!plan.steps.length) throw new Error(`${replay} has no actions to replay${plan.skipped.length ? `: ${plan.skipped.join('; ')}` : ''}`);
      const scope = args.scope ?? rec.scope?.name;
      return json(await recordPage({ ...args, ...(scope ? { scope } : {}), replay: { ...plan, url: rec.page.url } }, dir));
    }
  );

  server.registerTool(
    'wait_for_recording',
    {
      description:
        'Blocks until the person starts (until: "started") or finishes (until: "done", default) a recording in the browser, then returns its id and summary. Use when you asked them to record a scenario with the panel. Returns status "timeout" after timeoutMs; call again to keep waiting.',
      inputSchema: {
        timeoutMs: z.number().int().min(1000).max(600_000).optional().describe('120000 (two minutes) by default.'),
        afterId: z
          .string()
          .optional()
          .describe(
            'Only a session newer than this id: pass the latest one to skip what was there before you asked — always, when others record into the same folder.'
          ),
        url: z.string().optional().describe("Only a session whose page url contains this: the person's app, not another agent's."),
        until: z.enum(['started', 'done']).optional(),
      },
    },
    async ({ timeoutMs = 120_000, afterId, url, until = 'done' }, extra) => {
      const progressToken = extra._meta?.progressToken;
      const entry = await waitForSession(dir, {
        afterId,
        url,
        until,
        timeoutMs,
        signal: extra.signal,
        onTick: (waited) => {
          if (progressToken !== undefined) {
            void extra.sendNotification({ method: 'notifications/progress', params: { progressToken, progress: waited, total: timeoutMs } } as never);
          }
        },
      });
      if (!entry) return json({ status: 'timeout', waitedMs: timeoutMs, dir });
      const rec = readRecording(entry);
      return json({ status: entry.status, id: entry.id, dir: entry.dir, summary: summarize(rec, 5) });
    }
  );

  server.registerTool(
    'compare_recordings',
    {
      description:
        'Before/after of two sessions: totals per second and per commit, cascade roots (new, gone, changed by cascade per second), causes, the same user actions — the median of each time it was done, per character for typing, so the runs need not match click for click — and plugin metrics. Warns when viewport, page, area, conditions or durations differ, when outlines were on in only one run, and when a side is partial.',
      inputSchema: {
        before: z.string().describe('A session id, or "latest-1".'),
        after: z.string().default('latest'),
        top: z.number().int().min(1).max(50).optional().describe('How many roots to list, 15 by default.'),
        match: z
          .enum(['key', 'name'])
          .optional()
          .describe(
            'How a root is found again. key (default): by name, file and path above it. name: by name and file only — when the fix moved it in the tree.'
          ),
      },
    },
    async ({ before, after, top, match }) => {
      const a = readRecording(findSession(dir, before));
      const b = readRecording(findSession(dir, after));
      return json(compareRecordings(a, b, { top, match }));
    }
  );

  return server;
}

export async function runStdio(dir: string, transport: Transport = new StdioServerTransport()) {
  const server = createServer(dir);
  await server.connect(transport);
  return server;
}
